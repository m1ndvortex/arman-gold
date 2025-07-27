import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
  connectTimeout?: number;
  lazyConnect?: boolean;
}

class RedisManager {
  private client: RedisClientType | null = null;
  private config: RedisConfig;
  private isConnected: boolean = false;

  constructor() {
    this.config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      connectTimeout: 10000,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    };
  }

  async connect(): Promise<RedisClientType> {
    if (this.client && this.isConnected) {
      return this.client;
    }

    try {
      this.client = createClient({
        socket: {
          host: this.config.host,
          port: this.config.port,
          connectTimeout: this.config.connectTimeout,
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              logger.error('Redis connection failed after 10 retries');
              return new Error('Redis connection failed');
            }
            return Math.min(retries * 50, 500);
          }
        },
        password: this.config.password,
        database: this.config.db
      });

      this.client.on('error', (err) => {
        logger.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        logger.info('Redis client ready');
      });

      this.client.on('end', () => {
        logger.info('Redis client disconnected');
        this.isConnected = false;
      });

      await this.client.connect();
      
      // Test the connection
      await this.client.ping();
      logger.info(`Redis connected successfully to ${this.config.host}:${this.config.port}`);
      
      return this.client;
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw new Error(`Redis connection failed: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      try {
        await this.client.quit();
        this.isConnected = false;
        logger.info('Redis client disconnected gracefully');
      } catch (error) {
        logger.error('Error disconnecting Redis client:', error);
      }
    }
  }

  getClient(): RedisClientType {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client not connected. Call connect() first.');
    }
    return this.client;
  }

  isClientConnected(): boolean {
    return this.isConnected && this.client !== null;
  }

  async healthCheck(): Promise<{ status: string; latency?: number }> {
    try {
      if (!this.isClientConnected()) {
        return { status: 'disconnected' };
      }

      const start = Date.now();
      await this.client!.ping();
      const latency = Date.now() - start;

      return { status: 'connected', latency };
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return { status: 'error' };
    }
  }
}

// Create singleton instance
export const redisManager = new RedisManager();
export const getRedisClient = () => redisManager.getClient();
export default redisManager;