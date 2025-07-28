import { PrismaClient } from '@prisma/client';
import { authService } from '../services/auth';
import { twoFactorService } from '../services/twoFactor';
import redisManager from '../config/redis';

const prisma = new PrismaClient();

describe('Authentication System Tests', () => {
  let testTenantId: string;
  let testUserId: string;
  const testEmail = 'test@example.com';
  const testPassword = 'TestPassword123!';

  beforeAll(async () => {
    // Connect to Redis
    await redisManager.connect();

    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Tenant',
        subdomain: 'test-tenant',
        databaseName: 'test_tenant_db',
        status: 'ACTIVE'
      }
    });
    testTenantId = tenant.id;

    // Create test user
    const hashedPassword = await authService.hashPassword(testPassword);
    const user = await prisma.tenantUser.create({
      data: {
        tenantId: testTenantId,
        email: testEmail,
        passwordHash: hashedPassword,
        role: 'TENANT_ADMIN'
      }
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.userSession.deleteMany({
      where: { userId: testUserId }
    });
    
    await prisma.tenantUser.delete({
      where: { id: testUserId }
    });
    
    await prisma.tenant.delete({
      where: { id: testTenantId }
    });

    // Disconnect from databases
    await prisma.$disconnect();
    await redisManager.disconnect();
  });

  beforeEach(async () => {
    // Clear Redis cache before each test
    const client = redisManager.getClient();
    await client.flushAll();
  });

  describe('Password Hashing and Verification', () => {
    test('should hash password correctly', async () => {
      const password = 'TestPassword123!';
      const hash = await authService.hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50);
    });

    test('should verify password correctly', async () => {
      const password = 'TestPassword123!';
      const hash = await authService.hashPassword(password);
      
      const isValid = await authService.verifyPassword(password, hash);
      expect(isValid).toBe(true);
      
      const isInvalid = await authService.verifyPassword('WrongPassword', hash);
      expect(isInvalid).toBe(false);
    });
  });

  describe('JWT Token Generation and Verification', () => {
    test('should generate and verify access token', () => {
      const payload = {
        userId: testUserId,
        tenantId: testTenantId,
        email: testEmail,
        role: 'TENANT_ADMIN'
      };

      const token = (authService as any).generateAccessToken(payload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const decoded = authService.verifyAccessToken(token);
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.tenantId).toBe(payload.tenantId);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.role).toBe(payload.role);
    });

    test('should generate and verify refresh token', () => {
      const payload = {
        userId: testUserId,
        tenantId: testTenantId,
        email: testEmail,
        role: 'TENANT_ADMIN'
      };

      const token = (authService as any).generateRefreshToken(payload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const decoded = authService.verifyRefreshToken(token);
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.tenantId).toBe(payload.tenantId);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.role).toBe(payload.role);
    });

    test('should reject invalid tokens', () => {
      expect(() => {
        authService.verifyAccessToken('invalid-token');
      }).toThrow('Invalid or expired access token');

      expect(() => {
        authService.verifyRefreshToken('invalid-token');
      }).toThrow('Invalid or expired refresh token');
    });
  });

  describe('User Authentication', () => {
    test('should login user with valid credentials', async () => {
      const result = await authService.login({
        email: testEmail,
        password: testPassword,
        tenantId: testTenantId,
        deviceInfo: 'Test Device',
        ipAddress: '127.0.0.1'
      });

      expect(result).toBeDefined();
      expect(result.user.id).toBe(testUserId);
      expect(result.user.email).toBe(testEmail);
      expect(result.user.tenantId).toBe(testTenantId);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.expiresIn).toBe(15 * 60); // 15 minutes
    });

    test('should reject login with invalid credentials', async () => {
      await expect(authService.login({
        email: testEmail,
        password: 'WrongPassword',
        tenantId: testTenantId
      })).rejects.toThrow('Invalid credentials');

      await expect(authService.login({
        email: 'wrong@example.com',
        password: testPassword,
        tenantId: testTenantId
      })).rejects.toThrow('Invalid credentials');
    });

    test('should reject login with wrong tenant', async () => {
      await expect(authService.login({
        email: testEmail,
        password: testPassword,
        tenantId: 'wrong-tenant-id'
      })).rejects.toThrow('Invalid credentials');
    });
  });

  describe('Token Refresh', () => {
    test('should refresh tokens successfully', async () => {
      // First login
      const loginResult = await authService.login({
        email: testEmail,
        password: testPassword,
        tenantId: testTenantId
      });

      // Then refresh
      const refreshResult = await authService.refreshToken(loginResult.refreshToken);

      expect(refreshResult).toBeDefined();
      expect(refreshResult.accessToken).toBeDefined();
      expect(refreshResult.refreshToken).toBeDefined();
      expect(refreshResult.expiresIn).toBe(15 * 60);
      
      // New tokens should be different
      expect(refreshResult.accessToken).not.toBe(loginResult.accessToken);
      expect(refreshResult.refreshToken).not.toBe(loginResult.refreshToken);
    });

    test('should reject invalid refresh token', async () => {
      await expect(authService.refreshToken('invalid-refresh-token'))
        .rejects.toThrow('Invalid or expired refresh token');
    });
  });

  describe('User Sessions', () => {
    test('should create and track user sessions', async () => {
      const loginResult = await authService.login({
        email: testEmail,
        password: testPassword,
        tenantId: testTenantId,
        deviceInfo: 'Test Device',
        ipAddress: '127.0.0.1'
      });

      const sessions = await authService.getUserSessions(testUserId);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].deviceInfo).toBe('Test Device');
      expect(sessions[0].ipAddress).toBe('127.0.0.1');
    });

    test('should logout and remove session', async () => {
      const loginResult = await authService.login({
        email: testEmail,
        password: testPassword,
        tenantId: testTenantId
      });

      await authService.logout(testUserId, loginResult.refreshToken);

      const sessions = await authService.getUserSessions(testUserId);
      expect(sessions).toHaveLength(0);
    });

    test('should force logout from all devices', async () => {
      // Create multiple sessions
      await authService.login({
        email: testEmail,
        password: testPassword,
        tenantId: testTenantId,
        deviceInfo: 'Device 1'
      });

      await authService.login({
        email: testEmail,
        password: testPassword,
        tenantId: testTenantId,
        deviceInfo: 'Device 2'
      });

      let sessions = await authService.getUserSessions(testUserId);
      expect(sessions).toHaveLength(2);

      await authService.forceLogoutAllDevices(testUserId);

      sessions = await authService.getUserSessions(testUserId);
      expect(sessions).toHaveLength(0);
    });
  });

  describe('Two-Factor Authentication', () => {
    test('should setup 2FA for user', async () => {
      const setup = await twoFactorService.setupTwoFactor(testUserId, testEmail);

      expect(setup).toBeDefined();
      expect(setup.secret).toBeDefined();
      expect(setup.qrCodeUrl).toBeDefined();
      expect(setup.backupCodes).toHaveLength(10);
      expect(setup.backupCodes[0]).toHaveLength(8);
    });

    test('should verify 2FA setup', async () => {
      await twoFactorService.setupTwoFactor(testUserId, testEmail);
      
      // In a real test, you would generate a valid TOTP token
      // For this test, we'll mock the verification
      const mockVerify = jest.spyOn(twoFactorService as any, 'verifyTwoFactorToken');
      mockVerify.mockResolvedValue({ isValid: true });

      const isValid = await twoFactorService.verifyTwoFactorSetup(testUserId, '123456');
      expect(isValid).toBe(true);

      mockVerify.mockRestore();
    });

    test('should check 2FA status', async () => {
      let isEnabled = await twoFactorService.isTwoFactorEnabled(testUserId);
      expect(isEnabled).toBe(false);

      // Enable 2FA
      await prisma.tenantUser.update({
        where: { id: testUserId },
        data: { twoFactorEnabled: true }
      });

      isEnabled = await twoFactorService.isTwoFactorEnabled(testUserId);
      expect(isEnabled).toBe(true);
    });

    test('should disable 2FA', async () => {
      // Enable 2FA first
      await prisma.tenantUser.update({
        where: { id: testUserId },
        data: { twoFactorEnabled: true, twoFactorSecret: 'test-secret' }
      });

      await twoFactorService.disableTwoFactor(testUserId);

      const user = await prisma.tenantUser.findUnique({
        where: { id: testUserId }
      });

      expect(user?.twoFactorEnabled).toBe(false);
      expect(user?.twoFactorSecret).toBeNull();
    });
  });

  describe('Session Cleanup', () => {
    test('should cleanup expired sessions', async () => {
      // Create a session with past expiration
      await prisma.userSession.create({
        data: {
          userId: testUserId,
          sessionToken: 'expired-token',
          expiresAt: new Date(Date.now() - 1000 * 60 * 60) // 1 hour ago
        }
      });

      // Create a valid session
      await prisma.userSession.create({
        data: {
          userId: testUserId,
          sessionToken: 'valid-token',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60) // 1 hour from now
        }
      });

      let sessions = await authService.getUserSessions(testUserId);
      expect(sessions).toHaveLength(2);

      await authService.cleanupExpiredSessions();

      sessions = await authService.getUserSessions(testUserId);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionToken).toBe('valid-token');
    });
  });
});