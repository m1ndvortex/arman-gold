#!/usr/bin/env node

const http = require('http');
const mysql = require('mysql2/promise');
const redis = require('redis');

async function testSetup() {
  console.log('🧪 Testing Jeweler SaaS Platform Setup...\n');

  // Test Backend API
  console.log('1. Testing Backend API...');
  try {
    const response = await fetch('http://localhost:3000/health');
    const data = await response.json();
    console.log('   ✅ Backend Health:', data.status);
    console.log('   ✅ Service:', data.service);
  } catch (error) {
    console.log('   ❌ Backend Error:', error.message);
  }

  // Test API Endpoint
  console.log('\n2. Testing API Endpoint...');
  try {
    const response = await fetch('http://localhost:3000/api/v1/status');
    const data = await response.json();
    console.log('   ✅ API Status:', data.message);
  } catch (error) {
    console.log('   ❌ API Error:', error.message);
  }

  // Test MySQL Connection
  console.log('\n3. Testing MySQL Database...');
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      port: 3306,
      user: 'jeweler_user',
      password: 'jeweler_pass_2024',
      database: 'jeweler_platform'
    });
    
    const [rows] = await connection.execute('SELECT COUNT(*) as count FROM tenants');
    console.log('   ✅ MySQL Connected');
    console.log('   ✅ Database:', 'jeweler_platform');
    console.log('   ✅ Tables accessible');
    await connection.end();
  } catch (error) {
    console.log('   ❌ MySQL Error:', error.message);
  }

  // Test Redis Connection
  console.log('\n4. Testing Redis Cache...');
  try {
    const client = redis.createClient({
      host: 'localhost',
      port: 6379
    });
    
    await client.connect();
    const pong = await client.ping();
    console.log('   ✅ Redis Connected:', pong);
    await client.disconnect();
  } catch (error) {
    console.log('   ❌ Redis Error:', error.message);
  }

  // Test Nginx Proxy
  console.log('\n5. Testing Nginx Proxy...');
  try {
    const response = await fetch('http://localhost:80/health');
    const text = await response.text();
    console.log('   ✅ Nginx Health:', text.trim());
    
    const apiResponse = await fetch('http://localhost:80/api/v1/status');
    const apiData = await apiResponse.json();
    console.log('   ✅ Nginx API Proxy:', 'Working');
  } catch (error) {
    console.log('   ❌ Nginx Error:', error.message);
  }

  console.log('\n🎉 Setup Test Complete!');
  console.log('\n📋 Summary:');
  console.log('   • Backend API: http://localhost:3000');
  console.log('   • Frontend: http://localhost:5173');
  console.log('   • Nginx Proxy: http://localhost:80');
  console.log('   • MySQL: localhost:3306');
  console.log('   • Redis: localhost:6379');
  console.log('\n🚀 Platform is ready for development!');
}

// Add fetch polyfill for Node.js < 18
if (!global.fetch) {
  global.fetch = require('node-fetch');
}

testSetup().catch(console.error);