#!/usr/bin/env ts-node

import redisManager from '../config/redis';
import sessionService from '../services/session';
import cacheService from '../services/cache';
import { RateLimiter } from '../middleware/rateLimiter';
import { logger } from '../utils/logger';

async function testRedisConnection() {
  console.log('🔄 Testing Redis connection...');
  
  try {
    await redisManager.connect();
    console.log('✅ Redis connected successfully');
    
    const health = await redisManager.healthCheck();
    console.log(`✅ Redis health check: ${health.status} (latency: ${health.latency}ms)`);
    
    return true;
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
    return false;
  }
}

async function testSessionManagement() {
  console.log('\n🔄 Testing session management...');
  
  try {
    // Create a test session
    const sessionData = {
      userId: 'test-user-123',
      tenantId: 'test-tenant-456',
      email: 'test@example.com',
      role: 'admin' as const,
      deviceInfo: {
        userAgent: 'Test Browser',
        ip: '127.0.0.1',
        deviceId: 'test-device'
      }
    };

    const sessionId = await sessionService.createSession(sessionData);
    console.log(`✅ Session created: ${sessionId}`);

    // Retrieve session
    const retrievedSession = await sessionService.getSession(sessionId);
    if (retrievedSession && retrievedSession.userId === sessionData.userId) {
      console.log('✅ Session retrieved successfully');
    } else {
      throw new Error('Session retrieval failed');
    }

    // Update session
    const updateResult = await sessionService.updateSession(sessionId, {
      twoFactorVerified: true
    });
    if (updateResult) {
      console.log('✅ Session updated successfully');
    } else {
      throw new Error('Session update failed');
    }

    // Get user sessions
    const userSessions = await sessionService.getUserSessions(sessionData.userId);
    if (userSessions.length === 1) {
      console.log('✅ User sessions retrieved successfully');
    } else {
      throw new Error('User sessions retrieval failed');
    }

    // Destroy session
    const destroyResult = await sessionService.destroySession(sessionId);
    if (destroyResult) {
      console.log('✅ Session destroyed successfully');
    } else {
      throw new Error('Session destruction failed');
    }

    return true;
  } catch (error) {
    console.error('❌ Session management test failed:', error);
    return false;
  }
}

async function testCaching() {
  console.log('\n🔄 Testing caching functionality...');
  
  try {
    // Test basic cache operations
    const testData = { message: 'Hello Redis Cache!', timestamp: Date.now() };
    
    const setResult = await cacheService.set('test-cache-key', testData);
    if (!setResult) {
      throw new Error('Cache set failed');
    }
    console.log('✅ Cache set operation successful');

    const retrievedData = await cacheService.get('test-cache-key');
    if (JSON.stringify(retrievedData) === JSON.stringify(testData)) {
      console.log('✅ Cache get operation successful');
    } else {
      throw new Error('Cache get failed - data mismatch');
    }

    // Test KPI caching
    const kpiData = {
      todaySales: 15000,
      todayProfit: 3000,
      newCustomers: 5,
      goldSoldMTD: 250.5,
      overdueInvoices: 3,
      dueCheques: 2,
      lowInventoryItems: 8,
      lastUpdated: Date.now()
    };

    const kpiSetResult = await cacheService.setKPIData('test-tenant', kpiData);
    if (!kpiSetResult) {
      throw new Error('KPI cache set failed');
    }
    console.log('✅ KPI cache set successful');

    const retrievedKPI = await cacheService.getKPIData('test-tenant');
    if (retrievedKPI && retrievedKPI.todaySales === kpiData.todaySales) {
      console.log('✅ KPI cache get successful');
    } else {
      throw new Error('KPI cache get failed');
    }

    // Test cache expiration
    await cacheService.set('expiring-key', { test: 'data' }, { ttl: 1 });
    console.log('✅ Cache with TTL set');

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const expiredData = await cacheService.get('expiring-key');
    if (expiredData === null) {
      console.log('✅ Cache expiration working correctly');
    } else {
      throw new Error('Cache expiration failed');
    }

    // Test getOrSet pattern
    let callbackExecuted = false;
    const computedResult = await cacheService.getOrSet('computed-key', async () => {
      callbackExecuted = true;
      return { computed: 'value', timestamp: Date.now() };
    });

    if (callbackExecuted && computedResult.computed === 'value') {
      console.log('✅ Cache getOrSet pattern working (callback executed)');
    } else {
      throw new Error('Cache getOrSet pattern failed');
    }

    // Second call should use cache
    callbackExecuted = false;
    const cachedResult = await cacheService.getOrSet('computed-key', async () => {
      callbackExecuted = true;
      return { computed: 'different', timestamp: Date.now() };
    });

    if (!callbackExecuted && cachedResult.computed === 'value') {
      console.log('✅ Cache getOrSet pattern working (cache hit)');
    } else {
      throw new Error('Cache getOrSet pattern failed on cache hit');
    }

    return true;
  } catch (error) {
    console.error('❌ Caching test failed:', error);
    return false;
  }
}

async function testRateLimiting() {
  console.log('\n🔄 Testing rate limiting...');
  
  try {
    const rateLimiter = new RateLimiter({
      windowMs: 60000, // 1 minute
      maxRequests: 3
    });

    const testKey = 'test-rate-limit-key';

    // Test normal requests
    for (let i = 1; i <= 3; i++) {
      const result = await rateLimiter.checkRateLimit(testKey);
      if (result.remainingPoints >= 0) {
        console.log(`✅ Request ${i}/3 allowed (remaining: ${result.remainingPoints})`);
      } else {
        throw new Error(`Request ${i} should have been allowed`);
      }
    }

    // Test rate limit exceeded
    const rateLimitedResult = await rateLimiter.checkRateLimit(testKey);
    if (rateLimitedResult.remainingPoints < 0) {
      console.log('✅ Rate limit correctly enforced');
    } else {
      throw new Error('Rate limit should have been exceeded');
    }

    // Test rate limit reset
    const resetResult = await rateLimiter.resetRateLimit(testKey);
    if (resetResult) {
      console.log('✅ Rate limit reset successful');
    } else {
      throw new Error('Rate limit reset failed');
    }

    // Test after reset
    const afterResetResult = await rateLimiter.checkRateLimit(testKey);
    if (afterResetResult.remainingPoints >= 0) {
      console.log('✅ Requests allowed after rate limit reset');
    } else {
      throw new Error('Requests should be allowed after reset');
    }

    return true;
  } catch (error) {
    console.error('❌ Rate limiting test failed:', error);
    return false;
  }
}

async function testPersistence() {
  console.log('\n🔄 Testing Redis persistence...');
  
  try {
    // Set data that should persist
    const persistentData = {
      message: 'This data should persist',
      timestamp: Date.now(),
      important: true
    };

    await cacheService.set('persistent-test', persistentData, { ttl: 3600 });
    console.log('✅ Persistent data set');

    // Create a session that should persist
    const sessionId = await sessionService.createSession({
      userId: 'persistent-user',
      tenantId: 'persistent-tenant',
      email: 'persistent@test.com',
      role: 'admin'
    });
    console.log('✅ Persistent session created');

    // Verify both exist
    const cachedData = await cacheService.get('persistent-test');
    const sessionData = await sessionService.getSession(sessionId);

    if (cachedData && JSON.stringify(cachedData) === JSON.stringify(persistentData)) {
      console.log('✅ Cached data persisted correctly');
    } else {
      throw new Error('Cached data persistence failed');
    }

    if (sessionData && sessionData.userId === 'persistent-user') {
      console.log('✅ Session data persisted correctly');
    } else {
      throw new Error('Session data persistence failed');
    }

    // Clean up
    await cacheService.delete('persistent-test');
    await sessionService.destroySession(sessionId);
    console.log('✅ Cleanup completed');

    return true;
  } catch (error) {
    console.error('❌ Persistence test failed:', error);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting Redis Integration Tests\n');
  
  const tests = [
    { name: 'Redis Connection', test: testRedisConnection },
    { name: 'Session Management', test: testSessionManagement },
    { name: 'Caching', test: testCaching },
    { name: 'Rate Limiting', test: testRateLimiting },
    { name: 'Persistence', test: testPersistence }
  ];

  let passedTests = 0;
  let failedTests = 0;

  for (const { name, test } of tests) {
    try {
      const result = await test();
      if (result) {
        passedTests++;
        console.log(`\n✅ ${name} tests PASSED`);
      } else {
        failedTests++;
        console.log(`\n❌ ${name} tests FAILED`);
      }
    } catch (error) {
      failedTests++;
      console.log(`\n❌ ${name} tests FAILED with error:`, error);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`📊 Test Results: ${passedTests} passed, ${failedTests} failed`);
  
  if (failedTests === 0) {
    console.log('🎉 All Redis integration tests passed!');
  } else {
    console.log('⚠️  Some tests failed. Please check the output above.');
  }

  // Cleanup and disconnect
  try {
    await redisManager.disconnect();
    console.log('🔌 Redis connection closed');
  } catch (error) {
    console.error('Error closing Redis connection:', error);
  }

  process.exit(failedTests > 0 ? 1 : 0);
}

// Run tests if this script is executed directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('Fatal error running tests:', error);
    process.exit(1);
  });
}

export { runAllTests };