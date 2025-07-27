import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export interface SessionData {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
  deviceInfo?: {
    userAgent: string;
    ip: string;
    deviceId: string;
  };
  loginTime: number;
  lastActivity: number;
  twoFactorVerified?: boolean;
}

export interface SessionOptions {
  ttl?: number; // Time to live in seconds
  sliding?: boolean; // Whether to extend session on activity
}

class SessionService {
  private readonly SESSION_PREFIX = 'session:';
  private readonly USER_SESSIONS_PREFIX = 'user_sessions:';
  private readonly DEFAULT_TTL = 24 * 60 * 60; // 24 hours in seconds

  /**
   * Create a new session
   */
  async createSession(
    sessionData: Omit<SessionData, 'loginTime' | 'lastActivity'>,
    options: SessionOptions = {}
  ): Promise<string> {
    try {
      const redis = getRedisClient();
      const sessionId = this.generateSessionId();
      const ttl = options.ttl || this.DEFAULT_TTL;

      const fullSessionData: SessionData = {
        ...sessionData,
        loginTime: Date.now(),
        lastActivity: Date.now()
      };

      // Store session data
      const sessionKey = this.getSessionKey(sessionId);
      await redis.setEx(sessionKey, ttl, JSON.stringify(fullSessionData));

      // Track user sessions for multi-device management
      const userSessionsKey = this.getUserSessionsKey(sessionData.userId);
      await redis.sAdd(userSessionsKey, sessionId);
      await redis.expire(userSessionsKey, ttl);

      logger.info(`Session created for user ${sessionData.userId}: ${sessionId}`);
      return sessionId;
    } catch (error) {
      logger.error('Failed to create session:', error);
      throw new Error('Session creation failed');
    }
  }

  /**
   * Get session data by session ID
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      const redis = getRedisClient();
      const sessionKey = this.getSessionKey(sessionId);
      const sessionDataStr = await redis.get(sessionKey);

      if (!sessionDataStr) {
        return null;
      }

      const sessionData: SessionData = JSON.parse(sessionDataStr);
      
      // Update last activity if sliding sessions are enabled
      await this.updateLastActivity(sessionId, sessionData);
      
      return sessionData;
    } catch (error) {
      logger.error('Failed to get session:', error);
      return null;
    }
  }

  /**
   * Update session data
   */
  async updateSession(sessionId: string, updates: Partial<SessionData>): Promise<boolean> {
    try {
      const redis = getRedisClient();
      const sessionKey = this.getSessionKey(sessionId);
      
      const existingData = await this.getSession(sessionId);
      if (!existingData) {
        return false;
      }

      const updatedData: SessionData = {
        ...existingData,
        ...updates,
        lastActivity: Date.now()
      };

      const ttl = await redis.ttl(sessionKey);
      if (ttl > 0) {
        await redis.setEx(sessionKey, ttl, JSON.stringify(updatedData));
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to update session:', error);
      return false;
    }
  }

  /**
   * Destroy a session
   */
  async destroySession(sessionId: string): Promise<boolean> {
    try {
      const redis = getRedisClient();
      const sessionData = await this.getSession(sessionId);
      
      if (sessionData) {
        // Remove from user sessions set
        const userSessionsKey = this.getUserSessionsKey(sessionData.userId);
        await redis.sRem(userSessionsKey, sessionId);
      }

      // Delete session
      const sessionKey = this.getSessionKey(sessionId);
      const result = await redis.del(sessionKey);
      
      logger.info(`Session destroyed: ${sessionId}`);
      return result > 0;
    } catch (error) {
      logger.error('Failed to destroy session:', error);
      return false;
    }
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId: string): Promise<{ sessionId: string; data: SessionData }[]> {
    try {
      const redis = getRedisClient();
      const userSessionsKey = this.getUserSessionsKey(userId);
      const sessionIds = await redis.sMembers(userSessionsKey);

      const sessions: { sessionId: string; data: SessionData }[] = [];

      for (const sessionId of sessionIds) {
        const sessionData = await this.getSession(sessionId);
        if (sessionData) {
          sessions.push({ sessionId, data: sessionData });
        } else {
          // Clean up invalid session ID
          await redis.sRem(userSessionsKey, sessionId);
        }
      }

      return sessions;
    } catch (error) {
      logger.error('Failed to get user sessions:', error);
      return [];
    }
  }

  /**
   * Force logout user from all devices
   */
  async destroyAllUserSessions(userId: string): Promise<number> {
    try {
      const redis = getRedisClient();
      const userSessionsKey = this.getUserSessionsKey(userId);
      const sessionIds = await redis.sMembers(userSessionsKey);

      let destroyedCount = 0;
      for (const sessionId of sessionIds) {
        const success = await this.destroySession(sessionId);
        if (success) destroyedCount++;
      }

      // Clean up user sessions set
      await redis.del(userSessionsKey);

      logger.info(`Destroyed ${destroyedCount} sessions for user ${userId}`);
      return destroyedCount;
    } catch (error) {
      logger.error('Failed to destroy all user sessions:', error);
      return 0;
    }
  }

  /**
   * Force logout user from other devices (keep current session)
   */
  async destroyOtherUserSessions(userId: string, currentSessionId: string): Promise<number> {
    try {
      const redis = getRedisClient();
      const userSessionsKey = this.getUserSessionsKey(userId);
      const sessionIds = await redis.sMembers(userSessionsKey);

      let destroyedCount = 0;
      for (const sessionId of sessionIds) {
        if (sessionId !== currentSessionId) {
          const success = await this.destroySession(sessionId);
          if (success) destroyedCount++;
        }
      }

      logger.info(`Destroyed ${destroyedCount} other sessions for user ${userId}`);
      return destroyedCount;
    } catch (error) {
      logger.error('Failed to destroy other user sessions:', error);
      return 0;
    }
  }

  /**
   * Extend session TTL
   */
  async extendSession(sessionId: string, ttl?: number): Promise<boolean> {
    try {
      const redis = getRedisClient();
      const sessionKey = this.getSessionKey(sessionId);
      const extendTtl = ttl || this.DEFAULT_TTL;
      
      const result = await redis.expire(sessionKey, extendTtl);
      return result;
    } catch (error) {
      logger.error('Failed to extend session:', error);
      return false;
    }
  }

  /**
   * Clean up expired sessions (maintenance task)
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const redis = getRedisClient();
      let cleanedCount = 0;

      // Get all user session keys
      const userSessionKeys = await redis.keys(`${this.USER_SESSIONS_PREFIX}*`);

      for (const userSessionKey of userSessionKeys) {
        const sessionIds = await redis.sMembers(userSessionKey);
        
        for (const sessionId of sessionIds) {
          const sessionKey = this.getSessionKey(sessionId);
          const exists = await redis.exists(sessionKey);
          
          if (!exists) {
            // Remove expired session from user sessions set
            await redis.sRem(userSessionKey, sessionId);
            cleanedCount++;
          }
        }

        // Remove empty user session sets
        const remainingSessions = await redis.sCard(userSessionKey);
        if (remainingSessions === 0) {
          await redis.del(userSessionKey);
        }
      }

      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} expired sessions`);
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired sessions:', error);
      return 0;
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<{
    totalSessions: number;
    totalUsers: number;
    averageSessionsPerUser: number;
  }> {
    try {
      const redis = getRedisClient();
      
      const sessionKeys = await redis.keys(`${this.SESSION_PREFIX}*`);
      const userSessionKeys = await redis.keys(`${this.USER_SESSIONS_PREFIX}*`);
      
      const totalSessions = sessionKeys.length;
      const totalUsers = userSessionKeys.length;
      const averageSessionsPerUser = totalUsers > 0 ? totalSessions / totalUsers : 0;

      return {
        totalSessions,
        totalUsers,
        averageSessionsPerUser: Math.round(averageSessionsPerUser * 100) / 100
      };
    } catch (error) {
      logger.error('Failed to get session stats:', error);
      return { totalSessions: 0, totalUsers: 0, averageSessionsPerUser: 0 };
    }
  }

  // Private helper methods
  private generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private getSessionKey(sessionId: string): string {
    return `${this.SESSION_PREFIX}${sessionId}`;
  }

  private getUserSessionsKey(userId: string): string {
    return `${this.USER_SESSIONS_PREFIX}${userId}`;
  }

  private async updateLastActivity(sessionId: string, sessionData: SessionData): Promise<void> {
    try {
      const redis = getRedisClient();
      const sessionKey = this.getSessionKey(sessionId);
      
      // Only update if more than 1 minute has passed to avoid too frequent updates
      const now = Date.now();
      if (now - sessionData.lastActivity > 60000) {
        sessionData.lastActivity = now;
        const ttl = await redis.ttl(sessionKey);
        if (ttl > 0) {
          await redis.setEx(sessionKey, ttl, JSON.stringify(sessionData));
        }
      }
    } catch (error) {
      logger.error('Failed to update last activity:', error);
    }
  }
}

export const sessionService = new SessionService();
export default sessionService;