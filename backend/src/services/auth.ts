import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import redisManager from '../config/redis';

const prisma = new PrismaClient();

export interface TokenPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
    role: string;
    tenantId: string;
    twoFactorEnabled: boolean;
  };
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
  tenantId: string;
  deviceInfo?: string;
  ipAddress?: string;
  twoFactorCode?: string;
}

export interface RefreshTokenResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

class AuthService {
  private readonly JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
  private readonly JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
  private readonly ACCESS_TOKEN_EXPIRES_IN = '15m';
  private readonly REFRESH_TOKEN_EXPIRES_IN = '7d';
  private readonly SALT_ROUNDS = 12;

  /**
   * Generate JWT access token
   */
  private generateAccessToken(payload: TokenPayload): string {
    return jwt.sign({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      jti: Math.random().toString(36).substr(2, 9) // Add unique identifier
    }, this.JWT_SECRET, {
      expiresIn: this.ACCESS_TOKEN_EXPIRES_IN,
      issuer: 'jeweler-saas',
      audience: 'jeweler-client'
    });
  }

  /**
   * Generate JWT refresh token
   */
  private generateRefreshToken(payload: TokenPayload): string {
    return jwt.sign({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      jti: Math.random().toString(36).substr(2, 9) // Add unique identifier
    }, this.JWT_REFRESH_SECRET, {
      expiresIn: this.REFRESH_TOKEN_EXPIRES_IN,
      issuer: 'jeweler-saas',
      audience: 'jeweler-client'
    });
  }

  /**
   * Verify JWT access token
   */
  public verifyAccessToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, this.JWT_SECRET, {
        issuer: 'jeweler-saas',
        audience: 'jeweler-client'
      }) as TokenPayload;
    } catch (error) {
      logger.error('Access token verification failed:', error);
      throw new Error('Invalid or expired access token');
    }
  }

  /**
   * Verify JWT refresh token
   */
  public verifyRefreshToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, this.JWT_REFRESH_SECRET, {
        issuer: 'jeweler-saas',
        audience: 'jeweler-client'
      }) as TokenPayload;
    } catch (error) {
      logger.error('Refresh token verification failed:', error);
      throw new Error('Invalid or expired refresh token');
    }
  }

  /**
   * Hash password using bcrypt
   */
  public async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  /**
   * Verify password against hash
   */
  public async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Create user session in database
   */
  private async createUserSession(
    userId: string,
    sessionToken: string,
    deviceInfo?: string,
    ipAddress?: string
  ): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    // Create a shorter session identifier by hashing the token with timestamp
    const crypto = require('crypto');
    const sessionId = crypto.createHash('sha256').update(sessionToken + Date.now().toString()).digest('hex');

    await prisma.userSession.create({
      data: {
        userId,
        sessionToken: sessionId,
        deviceInfo,
        ipAddress,
        expiresAt
      }
    });
  }

  /**
   * Store refresh token in Redis with expiration
   */
  private async storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const key = `refresh_token:${userId}`;
    const expirationSeconds = 7 * 24 * 60 * 60; // 7 days
    
    const client = redisManager.getClient();
    await client.setEx(key, expirationSeconds, refreshToken);
  }

  /**
   * Validate refresh token from Redis
   */
  private async validateStoredRefreshToken(userId: string, refreshToken: string): Promise<boolean> {
    const key = `refresh_token:${userId}`;
    const client = redisManager.getClient();
    const storedToken = await client.get(key);
    
    return storedToken === refreshToken;
  }

  /**
   * Remove refresh token from Redis
   */
  private async removeRefreshToken(userId: string): Promise<void> {
    const key = `refresh_token:${userId}`;
    const client = redisManager.getClient();
    await client.del(key);
  }

  /**
   * Authenticate user and generate tokens
   */
  public async login(credentials: LoginCredentials): Promise<AuthResult> {
    const { email, password, tenantId, deviceInfo, ipAddress, twoFactorCode } = credentials;

    try {
      // Find user by email and tenant
      const user = await prisma.tenantUser.findUnique({
        where: {
          tenantId_email: {
            tenantId,
            email
          }
        },
        include: {
          tenant: true
        }
      });

      if (!user || !user.isActive) {
        logger.warn(`Login attempt failed: User not found or inactive - ${email}`);
        throw new Error('Invalid credentials');
      }

      // Verify password
      const isPasswordValid = await this.verifyPassword(password, user.passwordHash);
      if (!isPasswordValid) {
        logger.warn(`Login attempt failed: Invalid password - ${email}`);
        throw new Error('Invalid credentials');
      }

      // Check 2FA if enabled
      if (user.twoFactorEnabled) {
        if (!twoFactorCode) {
          throw new Error('Two-factor authentication code required');
        }
        
        const isValidTwoFactor = await this.verifyTwoFactorCode(user.id, twoFactorCode);
        if (!isValidTwoFactor) {
          logger.warn(`Login attempt failed: Invalid 2FA code - ${email}`);
          throw new Error('Invalid two-factor authentication code');
        }
      }

      // Generate tokens
      const tokenPayload: TokenPayload = {
        userId: user.id,
        tenantId: user.tenantId,
        email: user.email,
        role: user.role
      };

      const accessToken = this.generateAccessToken(tokenPayload);
      const refreshToken = this.generateRefreshToken(tokenPayload);

      // Store refresh token in Redis
      await this.storeRefreshToken(user.id, refreshToken);

      // Create session record
      await this.createUserSession(user.id, refreshToken, deviceInfo, ipAddress);

      // Update last login time
      await prisma.tenantUser.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      });

      logger.info(`User logged in successfully: ${email} (${user.id})`);

      return {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          twoFactorEnabled: user.twoFactorEnabled
        },
        accessToken,
        refreshToken,
        expiresIn: 15 * 60 // 15 minutes in seconds
      };

    } catch (error) {
      logger.error('Login error:', error);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  public async refreshToken(refreshToken: string): Promise<RefreshTokenResult> {
    try {
      // Verify refresh token
      const payload = this.verifyRefreshToken(refreshToken);

      // Validate stored refresh token
      const isValidStored = await this.validateStoredRefreshToken(payload.userId, refreshToken);
      if (!isValidStored) {
        throw new Error('Invalid refresh token');
      }

      // Check if user still exists and is active
      const user = await prisma.tenantUser.findUnique({
        where: { id: payload.userId }
      });

      if (!user || !user.isActive) {
        throw new Error('User not found or inactive');
      }

      // Generate new tokens
      const newTokenPayload: TokenPayload = {
        userId: user.id,
        tenantId: user.tenantId,
        email: user.email,
        role: user.role
      };

      const newAccessToken = this.generateAccessToken(newTokenPayload);
      const newRefreshToken = this.generateRefreshToken(newTokenPayload);

      // Update stored refresh token
      await this.storeRefreshToken(user.id, newRefreshToken);

      // Update session record
      const crypto = require('crypto');
      const oldSessionId = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const newSessionId = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
      
      await prisma.userSession.updateMany({
        where: {
          userId: user.id,
          sessionToken: oldSessionId
        },
        data: {
          sessionToken: newSessionId
        }
      });

      logger.info(`Token refreshed for user: ${user.email} (${user.id})`);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: 15 * 60 // 15 minutes in seconds
      };

    } catch (error) {
      logger.error('Token refresh error:', error);
      throw error;
    }
  }

  /**
   * Logout user and invalidate tokens
   */
  public async logout(userId: string, sessionToken?: string): Promise<void> {
    try {
      // Remove refresh token from Redis
      await this.removeRefreshToken(userId);

      // Remove session from database
      if (sessionToken) {
        const crypto = require('crypto');
        const sessionId = crypto.createHash('sha256').update(sessionToken).digest('hex');
        
        await prisma.userSession.deleteMany({
          where: {
            userId,
            sessionToken: sessionId
          }
        });
      } else {
        // Remove all sessions for user
        await prisma.userSession.deleteMany({
          where: { userId }
        });
      }

      logger.info(`User logged out: ${userId}`);

    } catch (error) {
      logger.error('Logout error:', error);
      throw error;
    }
  }

  /**
   * Force logout from all devices
   */
  public async forceLogoutAllDevices(userId: string): Promise<void> {
    try {
      // Remove all refresh tokens from Redis
      await this.removeRefreshToken(userId);

      // Remove all sessions from database
      await prisma.userSession.deleteMany({
        where: { userId }
      });

      logger.info(`Force logout all devices for user: ${userId}`);

    } catch (error) {
      logger.error('Force logout error:', error);
      throw error;
    }
  }

  /**
   * Get user sessions (for device tracking)
   */
  public async getUserSessions(userId: string) {
    return prisma.userSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Verify two-factor authentication code
   */
  private async verifyTwoFactorCode(userId: string, code: string): Promise<boolean> {
    const { twoFactorService } = await import('./twoFactor');
    const result = await twoFactorService.verifyTwoFactorToken(userId, code);
    return result.isValid;
  }

  /**
   * Clean up expired sessions
   */
  public async cleanupExpiredSessions(): Promise<void> {
    try {
      const result = await prisma.userSession.deleteMany({
        where: {
          expiresAt: {
            lt: new Date()
          }
        }
      });

      logger.info(`Cleaned up ${result.count} expired sessions`);
    } catch (error) {
      logger.error('Session cleanup error:', error);
    }
  }
}

export const authService = new AuthService();
export default authService;