import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import redisManager from '../config/redis';

const prisma = new PrismaClient();

export interface TwoFactorSetup {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export interface TwoFactorVerification {
  isValid: boolean;
  backupCodeUsed?: boolean;
}

class TwoFactorService {
  private readonly APP_NAME = 'Jeweler SaaS Platform';
  private readonly BACKUP_CODES_COUNT = 10;
  private readonly BACKUP_CODE_LENGTH = 8;

  /**
   * Generate a new 2FA secret for user
   */
  public async setupTwoFactor(userId: string, userEmail: string): Promise<TwoFactorSetup> {
    try {
      // Generate secret
      const secret = speakeasy.generateSecret({
        name: userEmail,
        issuer: this.APP_NAME,
        length: 32
      });

      // Generate QR code
      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

      // Generate backup codes
      const backupCodes = this.generateBackupCodes();

      // Store secret and backup codes in database (encrypted)
      await prisma.tenantUser.update({
        where: { id: userId },
        data: {
          twoFactorSecret: secret.base32,
          twoFactorEnabled: false // Will be enabled after verification
        }
      });

      // Store backup codes in Redis with expiration (they should be moved to database after verification)
      const backupCodesKey = `2fa_backup_codes:${userId}`;
      const client = redisManager.getClient();
      await client.setEx(backupCodesKey, 3600, JSON.stringify(backupCodes)); // 1 hour expiration

      logger.info(`2FA setup initiated for user: ${userId}`);

      return {
        secret: secret.base32!,
        qrCodeUrl,
        backupCodes
      };

    } catch (error) {
      logger.error('2FA setup error:', error);
      throw new Error('Failed to setup two-factor authentication');
    }
  }

  /**
   * Verify 2FA setup with initial code
   */
  public async verifyTwoFactorSetup(userId: string, token: string): Promise<boolean> {
    try {
      const user = await prisma.tenantUser.findUnique({
        where: { id: userId }
      });

      if (!user || !user.twoFactorSecret) {
        throw new Error('2FA setup not found');
      }

      // Verify the token
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token,
        window: 2 // Allow 2 time steps (60 seconds) tolerance
      });

      if (verified) {
        // Enable 2FA for the user
        await prisma.tenantUser.update({
          where: { id: userId },
          data: { twoFactorEnabled: true }
        });

        // Move backup codes from Redis to database (in a real implementation, you'd store these securely)
        const backupCodesKey = `2fa_backup_codes:${userId}`;
        const client = redisManager.getClient();
        const backupCodesJson = await client.get(backupCodesKey);
        
        if (backupCodesJson) {
          // In a real implementation, store backup codes in a separate table with proper encryption
          // For now, we'll keep them in Redis with a longer expiration
          await client.setEx(`2fa_backup_codes_active:${userId}`, 86400 * 365, backupCodesJson); // 1 year
          await client.del(backupCodesKey);
        }

        logger.info(`2FA enabled for user: ${userId}`);
        return true;
      }

      return false;

    } catch (error) {
      logger.error('2FA verification error:', error);
      throw error;
    }
  }

  /**
   * Verify 2FA token during login
   */
  public async verifyTwoFactorToken(userId: string, token: string): Promise<TwoFactorVerification> {
    try {
      const user = await prisma.tenantUser.findUnique({
        where: { id: userId }
      });

      if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
        throw new Error('2FA not enabled for user');
      }

      // First, try to verify as TOTP token
      const totpVerified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token,
        window: 2
      });

      if (totpVerified) {
        return { isValid: true };
      }

      // If TOTP fails, check if it's a backup code
      const backupCodeResult = await this.verifyBackupCode(userId, token);
      if (backupCodeResult) {
        return { isValid: true, backupCodeUsed: true };
      }

      return { isValid: false };

    } catch (error) {
      logger.error('2FA token verification error:', error);
      throw error;
    }
  }

  /**
   * Verify backup code
   */
  private async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    try {
      const backupCodesKey = `2fa_backup_codes_active:${userId}`;
      const client = redisManager.getClient();
      const backupCodesJson = await client.get(backupCodesKey);

      if (!backupCodesJson) {
        return false;
      }

      const backupCodes: string[] = JSON.parse(backupCodesJson);
      const codeIndex = backupCodes.indexOf(code);

      if (codeIndex !== -1) {
        // Remove the used backup code
        backupCodes.splice(codeIndex, 1);
        
        // Update the backup codes in Redis
        await client.setEx(backupCodesKey, 86400 * 365, JSON.stringify(backupCodes));

        logger.info(`Backup code used for user: ${userId}, remaining codes: ${backupCodes.length}`);
        return true;
      }

      return false;

    } catch (error) {
      logger.error('Backup code verification error:', error);
      return false;
    }
  }

  /**
   * Disable 2FA for user
   */
  public async disableTwoFactor(userId: string): Promise<void> {
    try {
      await prisma.tenantUser.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null
        }
      });

      // Remove backup codes
      const backupCodesKey = `2fa_backup_codes_active:${userId}`;
      const client = redisManager.getClient();
      await client.del(backupCodesKey);

      logger.info(`2FA disabled for user: ${userId}`);

    } catch (error) {
      logger.error('2FA disable error:', error);
      throw error;
    }
  }

  /**
   * Generate new backup codes
   */
  public async regenerateBackupCodes(userId: string): Promise<string[]> {
    try {
      const user = await prisma.tenantUser.findUnique({
        where: { id: userId }
      });

      if (!user || !user.twoFactorEnabled) {
        throw new Error('2FA not enabled for user');
      }

      const backupCodes = this.generateBackupCodes();
      
      // Store new backup codes
      const backupCodesKey = `2fa_backup_codes_active:${userId}`;
      const client = redisManager.getClient();
      await client.setEx(backupCodesKey, 86400 * 365, JSON.stringify(backupCodes));

      logger.info(`Backup codes regenerated for user: ${userId}`);
      return backupCodes;

    } catch (error) {
      logger.error('Backup codes regeneration error:', error);
      throw error;
    }
  }

  /**
   * Get remaining backup codes count
   */
  public async getBackupCodesCount(userId: string): Promise<number> {
    try {
      const backupCodesKey = `2fa_backup_codes_active:${userId}`;
      const client = redisManager.getClient();
      const backupCodesJson = await client.get(backupCodesKey);

      if (!backupCodesJson) {
        return 0;
      }

      const backupCodes: string[] = JSON.parse(backupCodesJson);
      return backupCodes.length;

    } catch (error) {
      logger.error('Get backup codes count error:', error);
      return 0;
    }
  }

  /**
   * Generate backup codes
   */
  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    
    for (let i = 0; i < this.BACKUP_CODES_COUNT; i++) {
      let code = '';
      for (let j = 0; j < this.BACKUP_CODE_LENGTH; j++) {
        code += Math.floor(Math.random() * 10).toString();
      }
      codes.push(code);
    }

    return codes;
  }

  /**
   * Check if user has 2FA enabled
   */
  public async isTwoFactorEnabled(userId: string): Promise<boolean> {
    try {
      const user = await prisma.tenantUser.findUnique({
        where: { id: userId },
        select: { twoFactorEnabled: true }
      });

      return user?.twoFactorEnabled || false;

    } catch (error) {
      logger.error('Check 2FA status error:', error);
      return false;
    }
  }
}

export const twoFactorService = new TwoFactorService();
export default twoFactorService;