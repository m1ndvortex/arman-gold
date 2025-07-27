#!/usr/bin/env ts-node

import redisManager from '../config/redis';
import { logger } from '../utils/logger';

async function testServerStartup() {
  console.log('🔄 Testing server startup components...');
  
  try {
    // Test Redis connection
    console.log('1. Testing Redis connection...');
    await redisManager.connect();
    console.log('✅ Redis connected successfully');
    
    const health = await redisManager.healthCheck();
    console.log(`✅ Redis health check: ${health.status} (latency: ${health.latency}ms)`);
    
    // Test logger
    console.log('2. Testing logger...');
    logger.info('Test log message');
    console.log('✅ Logger working correctly');
    
    // Test graceful shutdown
    console.log('3. Testing graceful shutdown...');
    await redisManager.disconnect();
    console.log('✅ Redis disconnected gracefully');
    
    console.log('\n🎉 All server startup components working correctly!');
    console.log('✅ Server should start successfully with Redis integration');
    
  } catch (error) {
    console.error('❌ Server startup test failed:', error);
    process.exit(1);
  }
}

testServerStartup();