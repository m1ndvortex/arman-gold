import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  namespace?: string; // Cache namespace for organization
}

export interface KPIData {
  todaySales: number;
  todayProfit: number;
  newCustomers: number;
  goldSoldMTD: number; // Month to date
  overdueInvoices: number;
  dueCheques: number;
  lowInventoryItems: number;
  lastUpdated: number;
}

class CacheService {
  private readonly DEFAULT_TTL = 300; // 5 minutes
  private readonly KPI_TTL = 60; // 1 minute for KPIs
  private readonly LONG_TTL = 3600; // 1 hour for less frequently changing data

  /**
   * Generic cache set method
   */
  async set(key: string, value: any, options: CacheOptions = {}): Promise<boolean> {
    try {
      const redis = getRedisClient();
      const cacheKey = this.buildKey(key, options.namespace);
      const ttl = options.ttl || this.DEFAULT_TTL;
      
      const serializedValue = JSON.stringify(value);
      await redis.setEx(cacheKey, ttl, serializedValue);
      
      logger.debug(`Cache set: ${cacheKey} (TTL: ${ttl}s)`);
      return true;
    } catch (error) {
      logger.error('Cache set failed:', error);
      return false;
    }
  }

  /**
   * Generic cache get method
   */
  async get<T>(key: string, namespace?: string): Promise<T | null> {
    try {
      const redis = getRedisClient();
      const cacheKey = this.buildKey(key, namespace);
      
      const cachedValue = await redis.get(cacheKey);
      if (!cachedValue) {
        return null;
      }

      logger.debug(`Cache hit: ${cacheKey}`);
      return JSON.parse(cachedValue) as T;
    } catch (error) {
      logger.error('Cache get failed:', error);
      return null;
    }
  }

  /**
   * Delete cache entry
   */
  async delete(key: string, namespace?: string): Promise<boolean> {
    try {
      const redis = getRedisClient();
      const cacheKey = this.buildKey(key, namespace);
      
      const result = await redis.del(cacheKey);
      logger.debug(`Cache delete: ${cacheKey}`);
      return result > 0;
    } catch (error) {
      logger.error('Cache delete failed:', error);
      return false;
    }
  }

  /**
   * Check if cache key exists
   */
  async exists(key: string, namespace?: string): Promise<boolean> {
    try {
      const redis = getRedisClient();
      const cacheKey = this.buildKey(key, namespace);
      
      const result = await redis.exists(cacheKey);
      return result > 0;
    } catch (error) {
      logger.error('Cache exists check failed:', error);
      return false;
    }
  }

  /**
   * Get or set pattern - if cache miss, execute callback and cache result
   */
  async getOrSet<T>(
    key: string,
    callback: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    try {
      // Try to get from cache first
      const cached = await this.get<T>(key, options.namespace);
      if (cached !== null) {
        return cached;
      }

      // Cache miss - execute callback
      logger.debug(`Cache miss: ${key}, executing callback`);
      const result = await callback();
      
      // Cache the result
      await this.set(key, result, options);
      
      return result;
    } catch (error) {
      logger.error('Cache getOrSet failed:', error);
      throw error;
    }
  }

  /**
   * Cache KPI data for dashboard
   */
  async setKPIData(tenantId: string, kpiData: KPIData): Promise<boolean> {
    const key = `kpi:${tenantId}`;
    const dataWithTimestamp = {
      ...kpiData,
      lastUpdated: Date.now()
    };
    
    return this.set(key, dataWithTimestamp, { ttl: this.KPI_TTL });
  }

  /**
   * Get cached KPI data
   */
  async getKPIData(tenantId: string): Promise<KPIData | null> {
    const key = `kpi:${tenantId}`;
    return this.get<KPIData>(key);
  }

  /**
   * Cache customer data
   */
  async setCustomerData(tenantId: string, customerId: string, customerData: any): Promise<boolean> {
    const key = `customer:${customerId}`;
    return this.set(key, customerData, { 
      ttl: this.LONG_TTL, 
      namespace: tenantId 
    });
  }

  /**
   * Get cached customer data
   */
  async getCustomerData(tenantId: string, customerId: string): Promise<any | null> {
    const key = `customer:${customerId}`;
    return this.get(key, tenantId);
  }

  /**
   * Cache product/inventory data
   */
  async setProductData(tenantId: string, productId: string, productData: any): Promise<boolean> {
    const key = `product:${productId}`;
    return this.set(key, productData, { 
      ttl: this.LONG_TTL, 
      namespace: tenantId 
    });
  }

  /**
   * Get cached product data
   */
  async getProductData(tenantId: string, productId: string): Promise<any | null> {
    const key = `product:${productId}`;
    return this.get(key, tenantId);
  }

  /**
   * Cache gold price data
   */
  async setGoldPrice(priceData: { price: number; currency: string; timestamp: number }): Promise<boolean> {
    const key = 'gold_price:current';
    return this.set(key, priceData, { ttl: 300 }); // 5 minutes TTL for gold prices
  }

  /**
   * Get cached gold price
   */
  async getGoldPrice(): Promise<{ price: number; currency: string; timestamp: number } | null> {
    const key = 'gold_price:current';
    return this.get(key);
  }

  /**
   * Cache invoice data
   */
  async setInvoiceData(tenantId: string, invoiceId: string, invoiceData: any): Promise<boolean> {
    const key = `invoice:${invoiceId}`;
    return this.set(key, invoiceData, { 
      ttl: this.DEFAULT_TTL, 
      namespace: tenantId 
    });
  }

  /**
   * Get cached invoice data
   */
  async getInvoiceData(tenantId: string, invoiceId: string): Promise<any | null> {
    const key = `invoice:${invoiceId}`;
    return this.get(key, tenantId);
  }

  /**
   * Cache user permissions for faster authorization
   */
  async setUserPermissions(userId: string, permissions: string[]): Promise<boolean> {
    const key = `permissions:${userId}`;
    return this.set(key, permissions, { ttl: this.LONG_TTL });
  }

  /**
   * Get cached user permissions
   */
  async getUserPermissions(userId: string): Promise<string[] | null> {
    const key = `permissions:${userId}`;
    return this.get<string[]>(key);
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern: string, namespace?: string): Promise<number> {
    try {
      const redis = getRedisClient();
      const searchPattern = namespace ? `${namespace}:${pattern}` : pattern;
      
      const keys = await redis.keys(searchPattern);
      if (keys.length === 0) {
        return 0;
      }

      const result = await redis.del(keys);
      logger.info(`Invalidated ${result} cache entries matching pattern: ${searchPattern}`);
      return result;
    } catch (error) {
      logger.error('Cache pattern invalidation failed:', error);
      return 0;
    }
  }

  /**
   * Invalidate all cache for a tenant
   */
  async invalidateTenantCache(tenantId: string): Promise<number> {
    return this.invalidatePattern('*', tenantId);
  }

  /**
   * Invalidate KPI cache for a tenant
   */
  async invalidateKPICache(tenantId: string): Promise<boolean> {
    const key = `kpi:${tenantId}`;
    return this.delete(key);
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    totalKeys: number;
    memoryUsage: string;
    hitRate?: number;
  }> {
    try {
      const redis = getRedisClient();
      
      // Get total number of keys
      const keys = await redis.keys('*');
      const totalKeys = keys.length;

      // Get memory usage info
      const info = await redis.info('memory');
      const memoryMatch = info.match(/used_memory_human:(.+)/);
      const memoryUsage = memoryMatch ? memoryMatch[1].trim() : 'Unknown';

      return {
        totalKeys,
        memoryUsage
      };
    } catch (error) {
      logger.error('Failed to get cache stats:', error);
      return {
        totalKeys: 0,
        memoryUsage: 'Unknown'
      };
    }
  }

  /**
   * Flush all cache (use with caution)
   */
  async flushAll(): Promise<boolean> {
    try {
      const redis = getRedisClient();
      await redis.flushAll();
      logger.warn('All cache flushed');
      return true;
    } catch (error) {
      logger.error('Cache flush failed:', error);
      return false;
    }
  }

  /**
   * Set cache with expiration at specific time
   */
  async setWithExpireAt(key: string, value: any, expireAt: Date, namespace?: string): Promise<boolean> {
    try {
      const redis = getRedisClient();
      const cacheKey = this.buildKey(key, namespace);
      const serializedValue = JSON.stringify(value);
      
      await redis.set(cacheKey, serializedValue);
      await redis.expireAt(cacheKey, Math.floor(expireAt.getTime() / 1000));
      
      logger.debug(`Cache set with expireAt: ${cacheKey}`);
      return true;
    } catch (error) {
      logger.error('Cache setWithExpireAt failed:', error);
      return false;
    }
  }

  /**
   * Increment counter in cache
   */
  async increment(key: string, by: number = 1, namespace?: string): Promise<number> {
    try {
      const redis = getRedisClient();
      const cacheKey = this.buildKey(key, namespace);
      
      const result = await redis.incrBy(cacheKey, by);
      logger.debug(`Cache increment: ${cacheKey} by ${by} = ${result}`);
      return result;
    } catch (error) {
      logger.error('Cache increment failed:', error);
      return 0;
    }
  }

  /**
   * Decrement counter in cache
   */
  async decrement(key: string, by: number = 1, namespace?: string): Promise<number> {
    try {
      const redis = getRedisClient();
      const cacheKey = this.buildKey(key, namespace);
      
      const result = await redis.decrBy(cacheKey, by);
      logger.debug(`Cache decrement: ${cacheKey} by ${by} = ${result}`);
      return result;
    } catch (error) {
      logger.error('Cache decrement failed:', error);
      return 0;
    }
  }

  // Private helper methods
  private buildKey(key: string, namespace?: string): string {
    return namespace ? `${namespace}:${key}` : key;
  }
}

export const cacheService = new CacheService();
export default cacheService;