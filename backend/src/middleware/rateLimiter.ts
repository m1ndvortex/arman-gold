import { Request, Response, NextFunction } from 'express';
import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';

export interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (req: Request) => string; // Custom key generator
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
  message?: string; // Custom error message
  statusCode?: number; // HTTP status code for rate limit exceeded
  headers?: boolean; // Include rate limit headers in response
}

export interface RateLimitInfo {
  totalHits: number;
  totalHitsPerWindow: number;
  remainingPoints: number;
  msBeforeNext: number;
  isFirstInDuration: boolean;
}

class RateLimiter {
  private options: Required<RateLimitOptions>;

  constructor(options: RateLimitOptions) {
    this.options = {
      windowMs: options.windowMs,
      maxRequests: options.maxRequests,
      keyGenerator: options.keyGenerator || this.defaultKeyGenerator,
      skipSuccessfulRequests: options.skipSuccessfulRequests || false,
      skipFailedRequests: options.skipFailedRequests || false,
      message: options.message || 'Too many requests, please try again later.',
      statusCode: options.statusCode || 429,
      headers: options.headers !== false
    };
  }

  /**
   * Express middleware for rate limiting
   */
  middleware() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const key = this.options.keyGenerator(req);
        const rateLimitInfo = await this.checkRateLimit(key);

        // Add rate limit headers if enabled
        if (this.options.headers) {
          res.set({
            'X-RateLimit-Limit': this.options.maxRequests.toString(),
            'X-RateLimit-Remaining': Math.max(0, rateLimitInfo.remainingPoints).toString(),
            'X-RateLimit-Reset': new Date(Date.now() + rateLimitInfo.msBeforeNext).toISOString(),
            'X-RateLimit-Window': this.options.windowMs.toString()
          });
        }

        // Check if rate limit exceeded
        if (rateLimitInfo.remainingPoints < 0) {
          logger.warn(`Rate limit exceeded for key: ${key}`, {
            totalHits: rateLimitInfo.totalHits,
            windowMs: this.options.windowMs,
            maxRequests: this.options.maxRequests
          });

          if (this.options.headers) {
            res.set('Retry-After', Math.ceil(rateLimitInfo.msBeforeNext / 1000).toString());
          }

          res.status(this.options.statusCode).json({
            error: 'RATE_LIMIT_EXCEEDED',
            message: this.options.message,
            retryAfter: Math.ceil(rateLimitInfo.msBeforeNext / 1000)
          });
          return;
        }

        // Store rate limit info in request for potential use by other middleware
        (req as any).rateLimit = rateLimitInfo;

        // Handle response counting
        if (!this.options.skipSuccessfulRequests || !this.options.skipFailedRequests) {
          const originalSend = res.send;
          const self = this;
          res.send = function(body: any) {
            const statusCode = res.statusCode;
            const shouldSkip = 
              (statusCode < 400 && self.options.skipSuccessfulRequests) ||
              (statusCode >= 400 && self.options.skipFailedRequests);

            if (shouldSkip) {
              // Decrement the counter if we should skip this request
              self.decrementCounter(key).catch((err: any) => 
                logger.error('Failed to decrement rate limit counter:', err)
              );
            }

            return originalSend.call(this, body);
          };
        }

        next();
      } catch (error) {
        logger.error('Rate limiter middleware error:', error);
        // On error, allow the request to proceed to avoid blocking legitimate traffic
        next();
      }
    };
  }

  /**
   * Check rate limit for a given key
   */
  async checkRateLimit(key: string): Promise<RateLimitInfo> {
    try {
      const redis = getRedisClient();
      const now = Date.now();
      const window = Math.floor(now / this.options.windowMs);
      const redisKey = `rate_limit:${key}:${window}`;

      // Increment counter
      const currentCount = await redis.incr(redisKey);
      
      // Set expiration on first request in window
      if (currentCount === 1) {
        await redis.expire(redisKey, Math.ceil(this.options.windowMs / 1000));
      }

      const remainingPoints = this.options.maxRequests - currentCount;
      const windowStart = window * this.options.windowMs;
      const windowEnd = windowStart + this.options.windowMs;
      const msBeforeNext = windowEnd - now;

      return {
        totalHits: currentCount,
        totalHitsPerWindow: currentCount,
        remainingPoints,
        msBeforeNext,
        isFirstInDuration: currentCount === 1
      };
    } catch (error) {
      logger.error('Rate limit check failed:', error);
      // Return permissive values on error
      return {
        totalHits: 0,
        totalHitsPerWindow: 0,
        remainingPoints: this.options.maxRequests,
        msBeforeNext: this.options.windowMs,
        isFirstInDuration: true
      };
    }
  }

  /**
   * Reset rate limit for a key
   */
  async resetRateLimit(key: string): Promise<boolean> {
    try {
      const redis = getRedisClient();
      const now = Date.now();
      const window = Math.floor(now / this.options.windowMs);
      const redisKey = `rate_limit:${key}:${window}`;

      const result = await redis.del(redisKey);
      logger.info(`Rate limit reset for key: ${key}`);
      return result > 0;
    } catch (error) {
      logger.error('Rate limit reset failed:', error);
      return false;
    }
  }

  /**
   * Get current rate limit status for a key
   */
  async getRateLimitStatus(key: string): Promise<RateLimitInfo> {
    try {
      const redis = getRedisClient();
      const now = Date.now();
      const window = Math.floor(now / this.options.windowMs);
      const redisKey = `rate_limit:${key}:${window}`;

      const currentCount = await redis.get(redisKey);
      const count = currentCount ? parseInt(currentCount) : 0;

      const remainingPoints = this.options.maxRequests - count;
      const windowStart = window * this.options.windowMs;
      const windowEnd = windowStart + this.options.windowMs;
      const msBeforeNext = windowEnd - now;

      return {
        totalHits: count,
        totalHitsPerWindow: count,
        remainingPoints,
        msBeforeNext,
        isFirstInDuration: count === 0
      };
    } catch (error) {
      logger.error('Get rate limit status failed:', error);
      return {
        totalHits: 0,
        totalHitsPerWindow: 0,
        remainingPoints: this.options.maxRequests,
        msBeforeNext: this.options.windowMs,
        isFirstInDuration: true
      };
    }
  }

  /**
   * Decrement counter (for skipped requests)
   */
  private async decrementCounter(key: string): Promise<void> {
    try {
      const redis = getRedisClient();
      const now = Date.now();
      const window = Math.floor(now / this.options.windowMs);
      const redisKey = `rate_limit:${key}:${window}`;

      await redis.decr(redisKey);
    } catch (error) {
      logger.error('Failed to decrement rate limit counter:', error);
    }
  }

  /**
   * Default key generator based on IP address
   */
  private defaultKeyGenerator(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'] as string;
    const ip = forwarded ? forwarded.split(',')[0] : req.connection.remoteAddress;
    return `ip:${ip}`;
  }
}

/**
 * Create rate limiter middleware with predefined configurations
 */
export const createRateLimiter = (options: RateLimitOptions) => {
  const limiter = new RateLimiter(options);
  return limiter.middleware();
};

/**
 * General API rate limiter
 */
export const apiRateLimiter = createRateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Too many API requests from this IP, please try again later.'
});

/**
 * Authentication rate limiter (stricter)
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 login attempts per 15 minutes
  keyGenerator: (req: Request) => {
    const email = req.body?.email || 'unknown';
    const forwarded = req.headers['x-forwarded-for'] as string;
    const ip = forwarded ? forwarded.split(',')[0] : req.connection.remoteAddress;
    return `auth:${email}:${ip}`;
  },
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true // Don't count successful logins
});

/**
 * Password reset rate limiter
 */
export const passwordResetRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 3, // 3 password reset attempts per hour
  keyGenerator: (req: Request) => {
    const email = req.body?.email || 'unknown';
    return `password_reset:${email}`;
  },
  message: 'Too many password reset attempts, please try again later.'
});

/**
 * Invoice creation rate limiter
 */
export const invoiceRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 invoices per minute
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id || 'anonymous';
    const tenantId = (req as any).tenantContext?.id || 'unknown';
    return `invoice:${tenantId}:${userId}`;
  },
  message: 'Too many invoices created, please slow down.'
});

/**
 * File upload rate limiter
 */
export const uploadRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 20, // 20 uploads per minute
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id || 'anonymous';
    const tenantId = (req as any).tenantContext?.id || 'unknown';
    return `upload:${tenantId}:${userId}`;
  },
  message: 'Too many file uploads, please slow down.'
});

/**
 * Advanced rate limiter with multiple tiers
 */
export class TieredRateLimiter {
  private limiters: { name: string; limiter: RateLimiter }[];

  constructor(tiers: { name: string; options: RateLimitOptions }[]) {
    this.limiters = tiers.map(tier => ({
      name: tier.name,
      limiter: new RateLimiter(tier.options)
    }));
  }

  middleware() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        for (const { name, limiter } of this.limiters) {
          const key = limiter['options'].keyGenerator(req);
          const rateLimitInfo = await limiter.checkRateLimit(key);

          if (rateLimitInfo.remainingPoints < 0) {
            logger.warn(`Tiered rate limit exceeded (${name}) for key: ${key}`);
            
            res.status(429).json({
              error: 'RATE_LIMIT_EXCEEDED',
              tier: name,
              message: limiter['options'].message,
              retryAfter: Math.ceil(rateLimitInfo.msBeforeNext / 1000)
            });
            return;
          }
        }

        next();
      } catch (error) {
        logger.error('Tiered rate limiter error:', error);
        next();
      }
    };
  }
}

export { RateLimiter };
export default RateLimiter;