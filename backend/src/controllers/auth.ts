import { Request, Response } from 'express';
import Joi from 'joi';
import { authService } from '../services/auth';
import { twoFactorService } from '../services/twoFactor';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/security';

// Validation schemas
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  tenantId: Joi.string().required(),
  twoFactorCode: Joi.string().length(6).optional(),
  deviceInfo: Joi.string().optional()
});

const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required()
});

const setupTwoFactorSchema = Joi.object({
  // No additional fields needed - user info comes from auth token
});

const verifyTwoFactorSetupSchema = Joi.object({
  token: Joi.string().length(6).required()
});

const verifyTwoFactorSchema = Joi.object({
  token: Joi.string().required() // Can be 6-digit TOTP or 8-digit backup code
});

/**
 * User login
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request body
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
      return;
    }

    const { email, password, tenantId, twoFactorCode, deviceInfo } = value;
    
    // Get client IP
    const ipAddress = req.headers['x-forwarded-for'] as string || 
                     req.headers['x-real-ip'] as string || 
                     req.connection.remoteAddress || 
                     'unknown';

    // Attempt login
    const result = await authService.login({
      email,
      password,
      tenantId,
      twoFactorCode,
      deviceInfo,
      ipAddress
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error: any) {
    logger.error('Login controller error:', error);
    
    if (error.message === 'Two-factor authentication code required') {
      res.status(401).json({
        error: 'TWO_FACTOR_REQUIRED',
        message: 'Two-factor authentication code required'
      });
      return;
    }
    
    res.status(401).json({
      error: 'LOGIN_FAILED',
      message: error.message || 'Login failed'
    });
  }
};

/**
 * Refresh access token
 */
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request body
    const { error, value } = refreshTokenSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
      return;
    }

    const { refreshToken } = value;

    // Refresh token
    const result = await authService.refreshToken(refreshToken);

    res.json({
      success: true,
      data: result
    });

  } catch (error: any) {
    logger.error('Refresh token controller error:', error);
    res.status(401).json({
      error: 'TOKEN_REFRESH_FAILED',
      message: error.message || 'Token refresh failed'
    });
  }
};

/**
 * User logout
 */
export const logout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required'
      });
      return;
    }

    const sessionToken = req.headers.authorization?.split(' ')[1]; // Get token from header

    await authService.logout(req.user.userId, sessionToken);

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error: any) {
    logger.error('Logout controller error:', error);
    res.status(500).json({
      error: 'LOGOUT_FAILED',
      message: error.message || 'Logout failed'
    });
  }
};

/**
 * Force logout from all devices
 */
export const forceLogoutAll = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required'
      });
      return;
    }

    await authService.forceLogoutAllDevices(req.user.userId);

    res.json({
      success: true,
      message: 'Logged out from all devices successfully'
    });

  } catch (error: any) {
    logger.error('Force logout controller error:', error);
    res.status(500).json({
      error: 'FORCE_LOGOUT_FAILED',
      message: error.message || 'Force logout failed'
    });
  }
};

/**
 * Get user sessions (device tracking)
 */
export const getUserSessions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required'
      });
      return;
    }

    const sessions = await authService.getUserSessions(req.user.userId);

    // Remove sensitive information
    const safeSessions = sessions.map(session => ({
      id: session.id,
      deviceInfo: session.deviceInfo,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt
    }));

    res.json({
      success: true,
      data: safeSessions
    });

  } catch (error: any) {
    logger.error('Get user sessions controller error:', error);
    res.status(500).json({
      error: 'GET_SESSIONS_FAILED',
      message: error.message || 'Failed to get user sessions'
    });
  }
};

/**
 * Setup Two-Factor Authentication
 */
export const setupTwoFactor = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required'
      });
      return;
    }

    const result = await twoFactorService.setupTwoFactor(req.user.userId, req.user.email);

    res.json({
      success: true,
      data: result
    });

  } catch (error: any) {
    logger.error('Setup 2FA controller error:', error);
    res.status(500).json({
      error: 'SETUP_TWO_FACTOR_FAILED',
      message: error.message || 'Failed to setup two-factor authentication'
    });
  }
};

/**
 * Verify Two-Factor Authentication setup
 */
export const verifyTwoFactorSetup = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required'
      });
      return;
    }

    // Validate request body
    const { error, value } = verifyTwoFactorSetupSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
      return;
    }

    const { token } = value;

    const isValid = await twoFactorService.verifyTwoFactorSetup(req.user.userId, token);

    if (isValid) {
      res.json({
        success: true,
        message: 'Two-factor authentication enabled successfully'
      });
    } else {
      res.status(400).json({
        error: 'INVALID_TOKEN',
        message: 'Invalid verification code'
      });
    }

  } catch (error: any) {
    logger.error('Verify 2FA setup controller error:', error);
    res.status(500).json({
      error: 'VERIFY_TWO_FACTOR_FAILED',
      message: error.message || 'Failed to verify two-factor authentication'
    });
  }
};

/**
 * Disable Two-Factor Authentication
 */
export const disableTwoFactor = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required'
      });
      return;
    }

    await twoFactorService.disableTwoFactor(req.user.userId);

    res.json({
      success: true,
      message: 'Two-factor authentication disabled successfully'
    });

  } catch (error: any) {
    logger.error('Disable 2FA controller error:', error);
    res.status(500).json({
      error: 'DISABLE_TWO_FACTOR_FAILED',
      message: error.message || 'Failed to disable two-factor authentication'
    });
  }
};

/**
 * Regenerate backup codes
 */
export const regenerateBackupCodes = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required'
      });
      return;
    }

    const backupCodes = await twoFactorService.regenerateBackupCodes(req.user.userId);

    res.json({
      success: true,
      data: { backupCodes }
    });

  } catch (error: any) {
    logger.error('Regenerate backup codes controller error:', error);
    res.status(500).json({
      error: 'REGENERATE_BACKUP_CODES_FAILED',
      message: error.message || 'Failed to regenerate backup codes'
    });
  }
};

/**
 * Get Two-Factor Authentication status
 */
export const getTwoFactorStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required'
      });
      return;
    }

    const isEnabled = await twoFactorService.isTwoFactorEnabled(req.user.userId);
    const backupCodesCount = isEnabled ? await twoFactorService.getBackupCodesCount(req.user.userId) : 0;

    res.json({
      success: true,
      data: {
        enabled: isEnabled,
        backupCodesCount
      }
    });

  } catch (error: any) {
    logger.error('Get 2FA status controller error:', error);
    res.status(500).json({
      error: 'GET_TWO_FACTOR_STATUS_FAILED',
      message: error.message || 'Failed to get two-factor authentication status'
    });
  }
};

/**
 * Get current user profile
 */
export const getProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required'
      });
      return;
    }

    // Return user profile (without sensitive information)
    res.json({
      success: true,
      data: {
        id: req.user.userId,
        email: req.user.email,
        role: req.user.role,
        tenantId: req.user.tenantId
      }
    });

  } catch (error: any) {
    logger.error('Get profile controller error:', error);
    res.status(500).json({
      error: 'GET_PROFILE_FAILED',
      message: error.message || 'Failed to get user profile'
    });
  }
};