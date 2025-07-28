import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { logger } from '../utils/logger';
import { authService } from '../services/auth';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    tenantId: string;
    email: string;
    role: string;
  };
  tenantId?: string;
}

/**
 * Enhanced security middleware with custom headers and policies
 */
export const securityMiddleware = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  
  // HTTP Strict Transport Security
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  
  // X-Frame-Options
  frameguard: {
    action: 'deny'
  },
  
  // X-Content-Type-Options
  noSniff: true,
  
  // Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  },
  
  // X-Permitted-Cross-Domain-Policies
  permittedCrossDomainPolicies: false,
  
  // Hide X-Powered-By header
  hidePoweredBy: true
});

/**
 * Custom security headers middleware
 */
export const customSecurityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Add custom security headers
  res.setHeader('X-Request-ID', req.headers['x-request-id'] || generateRequestId());
  res.setHeader('X-API-Version', '1.0.0');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  
  // Remove server information
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
  
  next();
};

/**
 * JWT Authentication middleware
 */
export const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Access token is required'
      });
      return;
    }

    // Verify token
    const payload = authService.verifyAccessToken(token);
    
    // Attach user info to request
    req.user = {
      userId: payload.userId,
      tenantId: payload.tenantId,
      email: payload.email,
      role: payload.role
    };
    
    req.tenantId = payload.tenantId;

    next();
  } catch (error) {
    logger.warn('Authentication failed:', error);
    res.status(401).json({
      error: 'AUTHENTICATION_FAILED',
      message: 'Invalid or expired access token'
    });
  }
};

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
export const optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const payload = authService.verifyAccessToken(token);
      req.user = {
        userId: payload.userId,
        tenantId: payload.tenantId,
        email: payload.email,
        role: payload.role
      };
      req.tenantId = payload.tenantId;
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

/**
 * Role-based authorization middleware
 */
export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required'
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Authorization failed: User ${req.user.email} with role ${req.user.role} attempted to access resource requiring roles: ${allowedRoles.join(', ')}`);
      res.status(403).json({
        error: 'AUTHORIZATION_DENIED',
        message: 'Insufficient permissions'
      });
      return;
    }

    next();
  };
};

/**
 * Tenant isolation middleware
 */
export const requireTenant = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (!req.user || !req.user.tenantId) {
    res.status(401).json({
      error: 'TENANT_REQUIRED',
      message: 'Tenant context required'
    });
    return;
  }

  // Ensure tenant ID in URL matches authenticated user's tenant
  const urlTenantId = req.params.tenantId || req.query.tenantId;
  if (urlTenantId && urlTenantId !== req.user.tenantId) {
    logger.warn(`Tenant isolation violation: User ${req.user.email} attempted to access tenant ${urlTenantId}`);
    res.status(403).json({
      error: 'TENANT_ACCESS_DENIED',
      message: 'Access to this tenant is denied'
    });
    return;
  }

  next();
};

/**
 * IP whitelist middleware
 */
export const ipWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = getClientIP(req);
    
    if (!allowedIPs.includes(clientIP)) {
      logger.warn(`IP access denied: ${clientIP} attempted to access restricted resource`);
      res.status(403).json({
        error: 'IP_ACCESS_DENIED',
        message: 'Access from this IP address is not allowed'
      });
      return;
    }

    next();
  };
};

/**
 * Request logging middleware
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] || generateRequestId();
  
  // Add request ID to headers
  req.headers['x-request-id'] = requestId as string;
  
  // Log request
  logger.info(`${req.method} ${req.originalUrl}`, {
    requestId,
    ip: getClientIP(req),
    userAgent: req.headers['user-agent'],
    tenantId: (req as AuthenticatedRequest).tenantId
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(`${req.method} ${req.originalUrl} - ${res.statusCode}`, {
      requestId,
      duration,
      statusCode: res.statusCode
    });
  });

  next();
};

/**
 * Error handling middleware
 */
export const errorHandler = (error: any, req: Request, res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] as string;
  
  logger.error('API Error:', {
    requestId,
    error: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: getClientIP(req)
  });

  // Don't expose internal errors in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let message = 'An internal server error occurred';

  // Handle specific error types
  if (error.message === 'Invalid credentials') {
    statusCode = 401;
    errorCode = 'INVALID_CREDENTIALS';
    message = 'Invalid email or password';
  } else if (error.message === 'Two-factor authentication code required') {
    statusCode = 401;
    errorCode = 'TWO_FACTOR_REQUIRED';
    message = 'Two-factor authentication code required';
  } else if (error.message === 'Invalid two-factor authentication code') {
    statusCode = 401;
    errorCode = 'INVALID_TWO_FACTOR_CODE';
    message = 'Invalid two-factor authentication code';
  } else if (error.message.includes('Invalid or expired')) {
    statusCode = 401;
    errorCode = 'TOKEN_INVALID';
    message = error.message;
  }

  res.status(statusCode).json({
    error: errorCode,
    message: isDevelopment ? error.message : message,
    requestId,
    timestamp: new Date().toISOString(),
    ...(isDevelopment && { stack: error.stack })
  });
};

/**
 * Get client IP address
 */
function getClientIP(req: Request): string {
  return (
    req.headers['x-forwarded-for'] as string ||
    req.headers['x-real-ip'] as string ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    'unknown'
  ).split(',')[0].trim();
}

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * CORS configuration for production
 */
export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'];
    
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Tenant-ID'],
  exposedHeaders: ['X-Request-ID', 'X-API-Version']
};

export default {
  securityMiddleware,
  customSecurityHeaders,
  authenticateToken,
  optionalAuth,
  requireRole,
  requireTenant,
  ipWhitelist,
  requestLogger,
  errorHandler,
  corsOptions
};