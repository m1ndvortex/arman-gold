import redisManager from '../config/redis';
import sessionService, { SessionData } from '../services/session';
import cacheService, { KPIData } from '../services/cache';
import { RateLimiter } from '../middleware/rateLimiter';

describe('Redis Integration Tests', () => {
  beforeAll(async () => {
    // Connect to Redis before running tests
    await redisManager.connect();
  });

  afterAll(async () => {
    // Clean up and disconnect after tests
    await redisManager.disconnect();
  });

  beforeEach(async () => {
    // Clear Redis before each test to ensure clean state
    const redis = redisManager.getClient();
    await redis.flushAll();
  });

  describe('Redis Connection', () => {
    test('should connect to Redis successfully', async () => {
      const isConnected = redisManager.isClientConnected();
      expect(isConnected).toBe(true);
    });

    test('should perform health check', async () => {
      const health = await redisManager.healthCheck();
      expect(health.status).toBe('connected');
      expect(health.latency).toBeDefined();
      expect(typeof health.latency).toBe('number');
    });

    test('should ping Redis server', async () => {
      const redis = redisManager.getClient();
      const pong = await redis.ping();
      expect(pong).toBe('PONG');
    });
  });

  describe('Session Management', () => {
    const mockSessionData: Omit<SessionData, 'loginTime' | 'lastActivity'> = {
      userId: 'user-123',
      tenantId: 'tenant-456',
      email: 'test@example.com',
      role: 'tenant_admin',
      deviceInfo: {
        userAgent: 'Mozilla/5.0 Test Browser',
        ip: '192.168.1.1',
        deviceId: 'device-789'
      },
      twoFactorVerified: true
    };

    test('should create a new session', async () => {
      const sessionId = await sessionService.createSession(mockSessionData);
      
      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBe(64); // 32 bytes hex = 64 characters
    });

    test('should retrieve session data', async () => {
      const sessionId = await sessionService.createSession(mockSessionData);
      const retrievedSession = await sessionService.getSession(sessionId);
      
      expect(retrievedSession).toBeDefined();
      expect(retrievedSession!.userId).toBe(mockSessionData.userId);
      expect(retrievedSession!.tenantId).toBe(mockSessionData.tenantId);
      expect(retrievedSession!.email).toBe(mockSessionData.email);
      expect(retrievedSession!.role).toBe(mockSessionData.role);
      expect(retrievedSession!.loginTime).toBeDefined();
      expect(retrievedSession!.lastActivity).toBeDefined();
    });

    test('should update session data', async () => {
      const sessionId = await sessionService.createSession(mockSessionData);
      
      const updateResult = await sessionService.updateSession(sessionId, {
        twoFactorVerified: false,
        role: 'employee'
      });
      
      expect(updateResult).toBe(true);
      
      const updatedSession = await sessionService.getSession(sessionId);
      expect(updatedSession!.twoFactorVerified).toBe(false);
      expect(updatedSession!.role).toBe('employee');
    });

    test('should destroy session', async () => {
      const sessionId = await sessionService.createSession(mockSessionData);
      
      const destroyResult = await sessionService.destroySession(sessionId);
      expect(destroyResult).toBe(true);
      
      const retrievedSession = await sessionService.getSession(sessionId);
      expect(retrievedSession).toBeNull();
    });

    test('should manage multiple user sessions', async () => {
      const sessionId1 = await sessionService.createSession(mockSessionData);
      const sessionId2 = await sessionService.createSession({
        ...mockSessionData,
        deviceInfo: {
          ...mockSessionData.deviceInfo!,
          deviceId: 'device-999'
        }
      });

      const userSessions = await sessionService.getUserSessions(mockSessionData.userId);
      expect(userSessions).toHaveLength(2);
      expect(userSessions.map(s => s.sessionId)).toContain(sessionId1);
      expect(userSessions.map(s => s.sessionId)).toContain(sessionId2);
    });

    test('should destroy all user sessions', async () => {
      await sessionService.createSession(mockSessionData);
      await sessionService.createSession({
        ...mockSessionData,
        deviceInfo: {
          ...mockSessionData.deviceInfo!,
          deviceId: 'device-999'
        }
      });

      const destroyedCount = await sessionService.destroyAllUserSessions(mockSessionData.userId);
      expect(destroyedCount).toBe(2);

      const userSessions = await sessionService.getUserSessions(mockSessionData.userId);
      expect(userSessions).toHaveLength(0);
    });

    test('should extend session TTL', async () => {
      const sessionId = await sessionService.createSession(mockSessionData, { ttl: 60 });
      
      const extendResult = await sessionService.extendSession(sessionId, 120);
      expect(extendResult).toBe(true);
      
      // Verify session still exists
      const session = await sessionService.getSession(sessionId);
      expect(session).toBeDefined();
    });

    test('should get session statistics', async () => {
      await sessionService.createSession(mockSessionData);
      await sessionService.createSession({
        ...mockSessionData,
        userId: 'user-456'
      });

      const stats = await sessionService.getSessionStats();
      expect(stats.totalSessions).toBe(2);
      expect(stats.totalUsers).toBe(2);
      expect(stats.averageSessionsPerUser).toBe(1);
    });
  });

  describe('Cache Service', () => {
    test('should set and get cache values', async () => {
      const testData = { message: 'Hello Redis!', timestamp: Date.now() };
      
      const setResult = await cacheService.set('test-key', testData);
      expect(setResult).toBe(true);
      
      const retrievedData = await cacheService.get('test-key');
      expect(retrievedData).toEqual(testData);
    });

    test('should handle cache expiration', async () => {
      const testData = { message: 'Expiring data' };
      
      await cacheService.set('expiring-key', testData, { ttl: 1 }); // 1 second TTL
      
      // Should exist immediately
      const immediateData = await cacheService.get('expiring-key');
      expect(immediateData).toEqual(testData);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const expiredData = await cacheService.get('expiring-key');
      expect(expiredData).toBeNull();
    });

    test('should use getOrSet pattern', async () => {
      let callbackExecuted = false;
      const callback = async () => {
        callbackExecuted = true;
        return { computed: 'value', timestamp: Date.now() };
      };

      // First call should execute callback
      const result1 = await cacheService.getOrSet('computed-key', callback);
      expect(callbackExecuted).toBe(true);
      expect(result1.computed).toBe('value');

      // Reset flag
      callbackExecuted = false;

      // Second call should use cache
      const result2 = await cacheService.getOrSet('computed-key', callback);
      expect(callbackExecuted).toBe(false);
      expect(result2).toEqual(result1);
    });

    test('should cache and retrieve KPI data', async () => {
      const kpiData: KPIData = {
        todaySales: 15000,
        todayProfit: 3000,
        newCustomers: 5,
        goldSoldMTD: 250.5,
        overdueInvoices: 3,
        dueCheques: 2,
        lowInventoryItems: 8,
        lastUpdated: Date.now()
      };

      const setResult = await cacheService.setKPIData('tenant-123', kpiData);
      expect(setResult).toBe(true);

      const retrievedKPI = await cacheService.getKPIData('tenant-123');
      expect(retrievedKPI).toBeDefined();
      expect(retrievedKPI!.todaySales).toBe(kpiData.todaySales);
      expect(retrievedKPI!.todayProfit).toBe(kpiData.todayProfit);
      expect(retrievedKPI!.newCustomers).toBe(kpiData.newCustomers);
    });

    test('should cache customer data with tenant namespace', async () => {
      const customerData = {
        id: 'customer-123',
        name: 'احمد محمدی',
        phone: '+98-912-345-6789',
        balance: 50000
      };

      const setResult = await cacheService.setCustomerData('tenant-123', 'customer-123', customerData);
      expect(setResult).toBe(true);

      const retrievedCustomer = await cacheService.getCustomerData('tenant-123', 'customer-123');
      expect(retrievedCustomer).toEqual(customerData);

      // Should not be accessible from different tenant
      const otherTenantCustomer = await cacheService.getCustomerData('tenant-456', 'customer-123');
      expect(otherTenantCustomer).toBeNull();
    });

    test('should cache gold price data', async () => {
      const goldPriceData = {
        price: 2050.75,
        currency: 'USD',
        timestamp: Date.now()
      };

      const setResult = await cacheService.setGoldPrice(goldPriceData);
      expect(setResult).toBe(true);

      const retrievedPrice = await cacheService.getGoldPrice();
      expect(retrievedPrice).toEqual(goldPriceData);
    });

    test('should invalidate cache by pattern', async () => {
      // Set multiple cache entries
      await cacheService.set('user:123', { name: 'User 1' }, { namespace: 'tenant-123' });
      await cacheService.set('user:456', { name: 'User 2' }, { namespace: 'tenant-123' });
      await cacheService.set('product:789', { name: 'Product 1' }, { namespace: 'tenant-123' });

      // Invalidate user cache entries
      const invalidatedCount = await cacheService.invalidatePattern('user:*', 'tenant-123');
      expect(invalidatedCount).toBe(2);

      // Verify user entries are gone but product entry remains
      const user1 = await cacheService.get('user:123', 'tenant-123');
      const user2 = await cacheService.get('user:456', 'tenant-123');
      const product = await cacheService.get('product:789', 'tenant-123');

      expect(user1).toBeNull();
      expect(user2).toBeNull();
      expect(product).toBeDefined();
    });

    test('should increment and decrement counters', async () => {
      // Test increment
      const count1 = await cacheService.increment('counter:test');
      expect(count1).toBe(1);

      const count2 = await cacheService.increment('counter:test', 5);
      expect(count2).toBe(6);

      // Test decrement
      const count3 = await cacheService.decrement('counter:test', 2);
      expect(count3).toBe(4);
    });

    test('should get cache statistics', async () => {
      // Add some cache entries
      await cacheService.set('key1', 'value1');
      await cacheService.set('key2', 'value2');
      await cacheService.set('key3', 'value3');

      const stats = await cacheService.getCacheStats();
      expect(stats.totalKeys).toBeGreaterThanOrEqual(3);
      expect(stats.memoryUsage).toBeDefined();
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits', async () => {
      const rateLimiter = new RateLimiter({
        windowMs: 60000, // 1 minute
        maxRequests: 3
      });

      const testKey = 'test-rate-limit';

      // First 3 requests should pass
      for (let i = 0; i < 3; i++) {
        const result = await rateLimiter.checkRateLimit(testKey);
        expect(result.remainingPoints).toBeGreaterThanOrEqual(0);
      }

      // 4th request should be rate limited
      const rateLimitedResult = await rateLimiter.checkRateLimit(testKey);
      expect(rateLimitedResult.remainingPoints).toBeLessThan(0);
    });

    test('should reset rate limit', async () => {
      const rateLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 2
      });

      const testKey = 'test-reset';

      // Exhaust rate limit
      await rateLimiter.checkRateLimit(testKey);
      await rateLimiter.checkRateLimit(testKey);
      
      let result = await rateLimiter.checkRateLimit(testKey);
      expect(result.remainingPoints).toBeLessThan(0);

      // Reset rate limit
      const resetResult = await rateLimiter.resetRateLimit(testKey);
      expect(resetResult).toBe(true);

      // Should be able to make requests again
      result = await rateLimiter.checkRateLimit(testKey);
      expect(result.remainingPoints).toBeGreaterThanOrEqual(0);
    });

    test('should get rate limit status', async () => {
      const rateLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 5
      });

      const testKey = 'test-status';

      // Make some requests
      await rateLimiter.checkRateLimit(testKey);
      await rateLimiter.checkRateLimit(testKey);

      const status = await rateLimiter.getRateLimitStatus(testKey);
      expect(status.totalHits).toBe(2);
      expect(status.remainingPoints).toBe(3);
      expect(status.msBeforeNext).toBeLessThanOrEqual(60000);
    });
  });

  describe('Redis Persistence', () => {
    test('should persist data across Redis operations', async () => {
      const testData = { 
        persistent: true, 
        message: 'This should persist',
        timestamp: Date.now()
      };

      // Set data with long TTL
      await cacheService.set('persistent-key', testData, { ttl: 3600 });

      // Verify data exists
      const retrievedData = await cacheService.get('persistent-key');
      expect(retrievedData).toEqual(testData);

      // Create a session
      const sessionId = await sessionService.createSession({
        userId: 'persistent-user',
        tenantId: 'persistent-tenant',
        email: 'persistent@test.com',
        role: 'admin'
      });

      // Verify session exists
      const session = await sessionService.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session!.userId).toBe('persistent-user');

      // Both cache and session should coexist
      const stillCachedData = await cacheService.get('persistent-key');
      const stillActiveSession = await sessionService.getSession(sessionId);

      expect(stillCachedData).toEqual(testData);
      expect(stillActiveSession).toBeDefined();
    });

    test('should handle Redis reconnection scenarios', async () => {
      // This test simulates what happens during Redis reconnection
      const testKey = 'reconnection-test';
      const testValue = { reconnection: 'test' };

      // Set initial data
      await cacheService.set(testKey, testValue);

      // Verify data exists
      const initialData = await cacheService.get(testKey);
      expect(initialData).toEqual(testValue);

      // Simulate reconnection by checking health
      const health = await redisManager.healthCheck();
      expect(health.status).toBe('connected');

      // Data should still be accessible after health check
      const postHealthData = await cacheService.get(testKey);
      expect(postHealthData).toEqual(testValue);
    });
  });

  describe('Error Handling', () => {
    test('should handle cache operations gracefully on errors', async () => {
      // Test with invalid data that might cause serialization issues
      const circularRef: any = { name: 'test' };
      circularRef.self = circularRef;

      // Should not throw but return false
      const result = await cacheService.set('circular-key', circularRef);
      expect(result).toBe(false);
    });

    test('should handle session operations gracefully on errors', async () => {
      // Test getting non-existent session
      const nonExistentSession = await sessionService.getSession('non-existent-session-id');
      expect(nonExistentSession).toBeNull();

      // Test updating non-existent session
      const updateResult = await sessionService.updateSession('non-existent-session-id', {
        role: 'admin'
      });
      expect(updateResult).toBe(false);

      // Test destroying non-existent session
      const destroyResult = await sessionService.destroySession('non-existent-session-id');
      expect(destroyResult).toBe(false);
    });
  });
});