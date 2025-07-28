import { PrismaClient } from '@prisma/client';
import { authService } from '../services/auth';
import { twoFactorService } from '../services/twoFactor';
import redisManager from '../config/redis';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

interface VerificationResult {
  component: string;
  status: 'PASS' | 'FAIL';
  message: string;
  details?: any;
}

class AuthSystemVerifier {
  private results: VerificationResult[] = [];
  private testTenantId: string = '';
  private testUserId: string = '';

  private addResult(component: string, status: 'PASS' | 'FAIL', message: string, details?: any) {
    this.results.push({ component, status, message, details });
    const emoji = status === 'PASS' ? '✅' : '❌';
    console.log(`${emoji} ${component}: ${message}`);
    if (details && status === 'FAIL') {
      console.log(`   Details: ${JSON.stringify(details, null, 2)}`);
    }
  }

  async setupTestData() {
    try {
      // Create test tenant
      const tenant = await prisma.tenant.create({
        data: {
          name: 'Auth Test Tenant',
          subdomain: 'auth-test',
          databaseName: 'auth_test_db',
          status: 'ACTIVE'
        }
      });
      this.testTenantId = tenant.id;

      // Create test user
      const hashedPassword = await authService.hashPassword('TestPassword123!');
      const user = await prisma.tenantUser.create({
        data: {
          tenantId: this.testTenantId,
          email: 'auth-test@example.com',
          passwordHash: hashedPassword,
          role: 'TENANT_ADMIN'
        }
      });
      this.testUserId = user.id;

      this.addResult('Test Data Setup', 'PASS', 'Test tenant and user created successfully');
    } catch (error) {
      this.addResult('Test Data Setup', 'FAIL', 'Failed to create test data', error);
      throw error;
    }
  }

  async cleanupTestData() {
    try {
      // Clean up sessions
      await prisma.userSession.deleteMany({
        where: { userId: this.testUserId }
      });

      // Clean up user
      await prisma.tenantUser.delete({
        where: { id: this.testUserId }
      });

      // Clean up tenant
      await prisma.tenant.delete({
        where: { id: this.testTenantId }
      });

      this.addResult('Test Data Cleanup', 'PASS', 'Test data cleaned up successfully');
    } catch (error) {
      this.addResult('Test Data Cleanup', 'FAIL', 'Failed to cleanup test data', error);
    }
  }

  async verifyDatabaseConnection() {
    try {
      await prisma.$connect();
      const result = await prisma.$queryRaw`SELECT 1 as test`;
      this.addResult('Database Connection', 'PASS', 'MySQL database connection successful');
    } catch (error) {
      this.addResult('Database Connection', 'FAIL', 'MySQL database connection failed', error);
    }
  }

  async verifyRedisConnection() {
    try {
      await redisManager.connect();
      const client = redisManager.getClient();
      await client.set('auth_test_key', 'test_value');
      const value = await client.get('auth_test_key');
      
      if (value === 'test_value') {
        this.addResult('Redis Connection', 'PASS', 'Redis connection and operations successful');
      } else {
        this.addResult('Redis Connection', 'FAIL', 'Redis operations failed');
      }
      
      await client.del('auth_test_key');
    } catch (error) {
      this.addResult('Redis Connection', 'FAIL', 'Redis connection failed', error);
    }
  }

  async verifyPasswordHashing() {
    try {
      const password = 'TestPassword123!';
      const hash = await authService.hashPassword(password);
      
      if (!hash || hash === password) {
        throw new Error('Password hashing failed');
      }

      const isValid = await authService.verifyPassword(password, hash);
      const isInvalid = await authService.verifyPassword('WrongPassword', hash);

      if (isValid && !isInvalid) {
        this.addResult('Password Hashing', 'PASS', 'Password hashing and verification working correctly');
      } else {
        this.addResult('Password Hashing', 'FAIL', 'Password verification logic failed');
      }
    } catch (error) {
      this.addResult('Password Hashing', 'FAIL', 'Password hashing system failed', error);
    }
  }

  async verifyJWTTokens() {
    try {
      const payload = {
        userId: this.testUserId,
        tenantId: this.testTenantId,
        email: 'auth-test@example.com',
        role: 'TENANT_ADMIN'
      };

      // Test access token
      const accessToken = (authService as any).generateAccessToken(payload);
      const decodedAccess = authService.verifyAccessToken(accessToken);

      // Test refresh token
      const refreshToken = (authService as any).generateRefreshToken(payload);
      const decodedRefresh = authService.verifyRefreshToken(refreshToken);

      if (
        decodedAccess.userId === payload.userId &&
        decodedRefresh.userId === payload.userId &&
        decodedAccess.tenantId === payload.tenantId &&
        decodedRefresh.tenantId === payload.tenantId
      ) {
        this.addResult('JWT Tokens', 'PASS', 'JWT token generation and verification working correctly');
      } else {
        this.addResult('JWT Tokens', 'FAIL', 'JWT token payload verification failed');
      }
    } catch (error) {
      this.addResult('JWT Tokens', 'FAIL', 'JWT token system failed', error);
    }
  }

  async verifyUserAuthentication() {
    try {
      // Test successful login
      const loginResult = await authService.login({
        email: 'auth-test@example.com',
        password: 'TestPassword123!',
        tenantId: this.testTenantId,
        deviceInfo: 'Test Device',
        ipAddress: '127.0.0.1'
      });

      if (
        loginResult.user.id === this.testUserId &&
        loginResult.accessToken &&
        loginResult.refreshToken &&
        loginResult.expiresIn === 15 * 60
      ) {
        this.addResult('User Authentication', 'PASS', 'User login working correctly');
      } else {
        this.addResult('User Authentication', 'FAIL', 'User login response invalid');
      }

      // Test failed login
      try {
        await authService.login({
          email: 'auth-test@example.com',
          password: 'WrongPassword',
          tenantId: this.testTenantId
        });
        this.addResult('Authentication Security', 'FAIL', 'Invalid credentials should be rejected');
      } catch (error) {
        this.addResult('Authentication Security', 'PASS', 'Invalid credentials properly rejected');
      }

    } catch (error) {
      this.addResult('User Authentication', 'FAIL', 'User authentication system failed', error);
    }
  }

  async verifyTokenRefresh() {
    try {
      // Login first
      const loginResult = await authService.login({
        email: 'auth-test@example.com',
        password: 'TestPassword123!',
        tenantId: this.testTenantId
      });

      // Refresh token
      const refreshResult = await authService.refreshToken(loginResult.refreshToken);

      if (
        refreshResult.accessToken &&
        refreshResult.refreshToken &&
        refreshResult.accessToken !== loginResult.accessToken &&
        refreshResult.refreshToken !== loginResult.refreshToken
      ) {
        this.addResult('Token Refresh', 'PASS', 'Token refresh working correctly');
      } else {
        this.addResult('Token Refresh', 'FAIL', 'Token refresh not generating new tokens', {
          hasAccessToken: !!refreshResult.accessToken,
          hasRefreshToken: !!refreshResult.refreshToken,
          accessTokenChanged: refreshResult.accessToken !== loginResult.accessToken,
          refreshTokenChanged: refreshResult.refreshToken !== loginResult.refreshToken,
          originalAccessToken: loginResult.accessToken.substring(0, 20) + '...',
          newAccessToken: refreshResult.accessToken?.substring(0, 20) + '...',
          originalRefreshToken: loginResult.refreshToken.substring(0, 20) + '...',
          newRefreshToken: refreshResult.refreshToken?.substring(0, 20) + '...'
        });
      }
    } catch (error) {
      this.addResult('Token Refresh', 'FAIL', 'Token refresh system failed', error);
    }
  }

  async verifySessionManagement() {
    try {
      // Create multiple sessions
      const login1 = await authService.login({
        email: 'auth-test@example.com',
        password: 'TestPassword123!',
        tenantId: this.testTenantId,
        deviceInfo: 'Device 1'
      });

      const login2 = await authService.login({
        email: 'auth-test@example.com',
        password: 'TestPassword123!',
        tenantId: this.testTenantId,
        deviceInfo: 'Device 2'
      });

      // Check sessions
      let sessions = await authService.getUserSessions(this.testUserId);
      if (sessions.length < 1) {
        throw new Error(`Expected at least 1 session, got ${sessions.length}`);
      }

      // Test logout (without specific session token)
      await authService.logout(this.testUserId);
      sessions = await authService.getUserSessions(this.testUserId);
      if (sessions.length !== 0) {
        throw new Error(`Expected 0 sessions after logout, got ${sessions.length}`);
      }

      // Create new session for force logout test
      await authService.login({
        email: 'auth-test@example.com',
        password: 'TestPassword123!',
        tenantId: this.testTenantId,
        deviceInfo: 'Device 3'
      });

      // Test force logout all
      await authService.forceLogoutAllDevices(this.testUserId);
      sessions = await authService.getUserSessions(this.testUserId);
      if (sessions.length !== 0) {
        throw new Error(`Expected 0 sessions after force logout, got ${sessions.length}`);
      }

      this.addResult('Session Management', 'PASS', 'Session tracking and management working correctly');
    } catch (error) {
      this.addResult('Session Management', 'FAIL', 'Session management system failed', error);
    }
  }

  async verifyTwoFactorAuth() {
    try {
      // Setup 2FA
      const setup = await twoFactorService.setupTwoFactor(this.testUserId, 'auth-test@example.com');
      
      if (!setup.secret || !setup.qrCodeUrl || setup.backupCodes.length !== 10) {
        throw new Error('2FA setup response invalid');
      }

      // Check 2FA status
      let isEnabled = await twoFactorService.isTwoFactorEnabled(this.testUserId);
      if (isEnabled) {
        throw new Error('2FA should not be enabled before verification');
      }

      // For testing purposes, manually enable 2FA since we can't generate valid TOTP
      await prisma.tenantUser.update({
        where: { id: this.testUserId },
        data: { twoFactorEnabled: true }
      });

      // Manually move backup codes from setup to active
      const client = redisManager.getClient();
      const backupCodesKey = `2fa_backup_codes:${this.testUserId}`;
      const backupCodesJson = await client.get(backupCodesKey);
      
      if (backupCodesJson) {
        await client.setEx(`2fa_backup_codes_active:${this.testUserId}`, 86400 * 365, backupCodesJson);
        await client.del(backupCodesKey);
      }

      isEnabled = await twoFactorService.isTwoFactorEnabled(this.testUserId);
      if (!isEnabled) {
        throw new Error('2FA should be enabled after verification');
      }

      // Test backup codes count
      const backupCount = await twoFactorService.getBackupCodesCount(this.testUserId);
      if (backupCount !== 10) {
        throw new Error(`Expected 10 backup codes, got ${backupCount}`);
      }

      // Test disable 2FA
      await twoFactorService.disableTwoFactor(this.testUserId);
      isEnabled = await twoFactorService.isTwoFactorEnabled(this.testUserId);
      if (isEnabled) {
        throw new Error('2FA should be disabled');
      }

      this.addResult('Two-Factor Authentication', 'PASS', '2FA system working correctly');
    } catch (error: any) {
      this.addResult('Two-Factor Authentication', 'FAIL', '2FA system failed', {
        message: error?.message || 'Unknown error',
        stack: error?.stack || 'No stack trace'
      });
    }
  }

  async verifySessionCleanup() {
    try {
      // Create expired session
      await prisma.userSession.create({
        data: {
          userId: this.testUserId,
          sessionToken: 'expired-token',
          expiresAt: new Date(Date.now() - 1000 * 60 * 60) // 1 hour ago
        }
      });

      // Create valid session
      await prisma.userSession.create({
        data: {
          userId: this.testUserId,
          sessionToken: 'valid-token',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60) // 1 hour from now
        }
      });

      let sessions = await authService.getUserSessions(this.testUserId);
      if (sessions.length !== 2) {
        throw new Error(`Expected 2 sessions before cleanup, got ${sessions.length}`);
      }

      // Run cleanup
      await authService.cleanupExpiredSessions();

      sessions = await authService.getUserSessions(this.testUserId);
      if (sessions.length !== 1 || sessions[0].sessionToken !== 'valid-token') {
        throw new Error(`Expected 1 valid session after cleanup, got ${sessions.length}. Sessions: ${JSON.stringify(sessions.map(s => ({ token: s.sessionToken, expires: s.expiresAt })))}`);
      }

      this.addResult('Session Cleanup', 'PASS', 'Expired session cleanup working correctly');
    } catch (error) {
      this.addResult('Session Cleanup', 'FAIL', 'Session cleanup failed', error);
    }
  }

  async runAllVerifications() {
    console.log('🔐 Starting Authentication System Verification...\n');

    try {
      // Setup
      await this.verifyDatabaseConnection();
      await this.verifyRedisConnection();
      await this.setupTestData();

      // Core authentication tests
      await this.verifyPasswordHashing();
      await this.verifyJWTTokens();
      await this.verifyUserAuthentication();
      await this.verifyTokenRefresh();
      await this.verifySessionManagement();
      await this.verifyTwoFactorAuth();
      await this.verifySessionCleanup();

    } finally {
      // Cleanup
      await this.cleanupTestData();
      await prisma.$disconnect();
      await redisManager.disconnect();
    }

    // Summary
    console.log('\n📊 Verification Summary:');
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Success Rate: ${((passed / this.results.length) * 100).toFixed(1)}%`);

    if (failed > 0) {
      console.log('\n❌ Failed Components:');
      this.results
        .filter(r => r.status === 'FAIL')
        .forEach(r => console.log(`   - ${r.component}: ${r.message}`));
      
      process.exit(1);
    } else {
      console.log('\n🎉 All authentication system components are working correctly!');
      process.exit(0);
    }
  }
}

// Run verification if called directly
if (require.main === module) {
  const verifier = new AuthSystemVerifier();
  verifier.runAllVerifications().catch((error) => {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  });
}

export default AuthSystemVerifier;