import { Router } from 'express';
import * as authController from '../controllers/auth';
import { authenticateToken, requireRole } from '../middleware/security';
import { apiRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// Apply rate limiting to all auth routes
router.use(apiRateLimiter);

// Public routes (no authentication required)
router.post('/login', authController.login);
router.post('/refresh', authController.refreshToken);

// Protected routes (authentication required)
router.use(authenticateToken); // Apply authentication to all routes below

router.post('/logout', authController.logout);
router.post('/logout-all', authController.forceLogoutAll);
router.get('/profile', authController.getProfile);
router.get('/sessions', authController.getUserSessions);

// Two-Factor Authentication routes
router.post('/2fa/setup', authController.setupTwoFactor);
router.post('/2fa/verify-setup', authController.verifyTwoFactorSetup);
router.post('/2fa/disable', authController.disableTwoFactor);
router.post('/2fa/regenerate-backup-codes', authController.regenerateBackupCodes);
router.get('/2fa/status', authController.getTwoFactorStatus);

export default router;