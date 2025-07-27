# Redis Integration Documentation

## Overview

This document describes the Redis integration implemented for the Jeweler SaaS Platform. Redis is used for session management, caching, and rate limiting to improve performance and scalability.

## Components

### 1. Redis Configuration (`src/config/redis.ts`)

The Redis manager provides:
- Connection management with automatic reconnection
- Health monitoring
- Graceful shutdown handling
- Error handling and logging

**Key Features:**
- Singleton pattern for connection management
- Configurable connection parameters via environment variables
- Automatic reconnection with exponential backoff
- Connection health checks

**Environment Variables:**
```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=optional_password
REDIS_DB=0
```

### 2. Session Management (`src/services/session.ts`)

Comprehensive session management with Redis storage:

**Features:**
- Secure session creation with unique session IDs
- Multi-device session tracking
- Session expiration and renewal
- Force logout capabilities
- Device information tracking
- Two-factor authentication support

**Key Methods:**
- `createSession()` - Create new user session
- `getSession()` - Retrieve session data
- `updateSession()` - Update session information
- `destroySession()` - End single session
- `destroyAllUserSessions()` - Force logout from all devices
- `getUserSessions()` - Get all user sessions
- `extendSession()` - Extend session TTL

**Session Data Structure:**
```typescript
interface SessionData {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
  deviceInfo?: {
    userAgent: string;
    ip: string;
    deviceId: string;
  };
  loginTime: number;
  lastActivity: number;
  twoFactorVerified?: boolean;
}
```

### 3. Caching Service (`src/services/cache.ts`)

High-performance caching for frequently accessed data:

**Features:**
- Generic cache operations (get, set, delete)
- Namespace support for tenant isolation
- TTL (Time To Live) management
- Cache invalidation patterns
- Specialized caching for different data types
- Counter operations (increment/decrement)
- Cache statistics

**Specialized Cache Methods:**
- `setKPIData()` / `getKPIData()` - Dashboard KPI caching
- `setCustomerData()` / `getCustomerData()` - Customer information
- `setProductData()` / `getProductData()` - Product/inventory data
- `setGoldPrice()` / `getGoldPrice()` - Gold price caching
- `setInvoiceData()` / `getInvoiceData()` - Invoice caching
- `setUserPermissions()` / `getUserPermissions()` - Permission caching

**Cache Patterns:**
- `getOrSet()` - Cache-aside pattern implementation
- `invalidatePattern()` - Pattern-based cache invalidation
- `invalidateTenantCache()` - Tenant-specific cache clearing

### 4. Rate Limiting (`src/middleware/rateLimiter.ts`)

Redis-based rate limiting for API protection:

**Features:**
- Sliding window rate limiting
- Configurable limits per endpoint
- Custom key generation (IP, user, tenant-based)
- Rate limit headers in responses
- Multiple rate limiting tiers
- Automatic cleanup of expired limits

**Pre-configured Rate Limiters:**
- `apiRateLimiter` - General API protection (100 requests/15 minutes)
- `authRateLimiter` - Authentication protection (5 attempts/15 minutes)
- `passwordResetRateLimiter` - Password reset protection (3 attempts/hour)
- `invoiceRateLimiter` - Invoice creation limits (10/minute)
- `uploadRateLimiter` - File upload limits (20/minute)

**Rate Limit Response Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 2024-01-01T12:00:00.000Z
X-RateLimit-Window: 900000
Retry-After: 300
```

## Usage Examples

### Session Management

```typescript
import sessionService from './services/session';

// Create session
const sessionId = await sessionService.createSession({
  userId: 'user-123',
  tenantId: 'tenant-456',
  email: 'user@example.com',
  role: 'admin',
  deviceInfo: {
    userAgent: req.headers['user-agent'],
    ip: req.ip,
    deviceId: 'device-789'
  }
});

// Get session
const session = await sessionService.getSession(sessionId);

// Update session
await sessionService.updateSession(sessionId, {
  twoFactorVerified: true
});

// Destroy session
await sessionService.destroySession(sessionId);
```

### Caching

```typescript
import cacheService from './services/cache';

// Basic caching
await cacheService.set('key', data, { ttl: 300 });
const cachedData = await cacheService.get('key');

// KPI caching
await cacheService.setKPIData('tenant-123', {
  todaySales: 15000,
  todayProfit: 3000,
  newCustomers: 5,
  goldSoldMTD: 250.5,
  overdueInvoices: 3,
  dueCheques: 2,
  lowInventoryItems: 8,
  lastUpdated: Date.now()
});

// Cache-aside pattern
const result = await cacheService.getOrSet('expensive-operation', async () => {
  return await performExpensiveOperation();
}, { ttl: 600 });
```

### Rate Limiting

```typescript
import { createRateLimiter } from './middleware/rateLimiter';

// Custom rate limiter
const customLimiter = createRateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 10,
  keyGenerator: (req) => `custom:${req.user.id}`,
  message: 'Too many requests from this user'
});

// Apply to routes
app.use('/api/custom', customLimiter);
```

## Testing

### Running Redis Tests

```bash
# Start Redis container
docker-compose up -d redis

# Run comprehensive Redis integration tests
npm run redis:test

# Test server startup with Redis
npx ts-node src/scripts/test-server-startup.ts
```

### Test Coverage

The Redis integration includes comprehensive tests for:

1. **Connection Management**
   - Redis connection establishment
   - Health checks and monitoring
   - Graceful disconnection
   - Error handling

2. **Session Management**
   - Session creation and retrieval
   - Session updates and expiration
   - Multi-device session handling
   - Session destruction and cleanup

3. **Caching Operations**
   - Basic cache operations (get/set/delete)
   - TTL and expiration handling
   - Namespace isolation
   - Pattern-based invalidation
   - Counter operations

4. **Rate Limiting**
   - Rate limit enforcement
   - Window-based limiting
   - Rate limit reset functionality
   - Custom key generation

5. **Persistence and Reliability**
   - Data persistence across operations
   - Error handling and recovery
   - Connection resilience

## Performance Considerations

### Connection Pooling
- Single Redis connection per application instance
- Connection reuse across all operations
- Automatic reconnection on failures

### Memory Management
- Configurable TTL for all cached data
- Automatic cleanup of expired sessions
- Pattern-based cache invalidation for bulk operations

### Monitoring
- Built-in health checks
- Cache statistics and metrics
- Session statistics tracking
- Rate limit monitoring

## Security Features

### Session Security
- Cryptographically secure session ID generation (32 bytes)
- Session data encryption in transit
- Automatic session expiration
- Device tracking and anomaly detection

### Rate Limiting Security
- IP-based rate limiting for anonymous requests
- User-based rate limiting for authenticated requests
- Tenant-based rate limiting for multi-tenant isolation
- Configurable rate limits per endpoint type

### Data Isolation
- Tenant-based cache namespacing
- Session isolation between tenants
- Secure cache key generation

## Maintenance

### Regular Tasks
- Session cleanup (automated)
- Cache statistics monitoring
- Rate limit statistics review
- Redis memory usage monitoring

### Troubleshooting
- Health check endpoints available
- Comprehensive logging for all operations
- Error handling with fallback mechanisms
- Connection retry logic with exponential backoff

## Configuration

### Environment Variables
```env
# Redis Connection
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=optional_password
REDIS_DB=0

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Session Management
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Logging
LOG_LEVEL=info
```

### Docker Configuration
Redis is configured in `docker-compose.yml`:
```yaml
redis:
  image: redis:7.0-alpine
  container_name: jeweler_redis
  restart: unless-stopped
  ports:
    - "${REDIS_PORT:-6379}:6379"
  volumes:
    - redis_data:/data
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    timeout: 10s
    retries: 5
```

## Integration with Application

The Redis integration is automatically initialized when the server starts:

1. Redis connection established during server startup
2. Health checks integrated into application health endpoint
3. Rate limiting applied to all API routes
4. Session management available for authentication middleware
5. Caching services available throughout the application
6. Graceful shutdown handling for clean disconnection

This comprehensive Redis integration provides the foundation for scalable session management, high-performance caching, and robust rate limiting required for the multi-tenant Jeweler SaaS Platform.