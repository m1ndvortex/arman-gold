import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import redisManager from './config/redis';
import { logger } from './utils/logger';
import { apiRateLimiter } from './middleware/rateLimiter';
import { 
  securityMiddleware, 
  customSecurityHeaders, 
  requestLogger, 
  errorHandler,
  corsOptions 
} from './middleware/security';
import authRoutes from './routes/auth';
import tenantRoutes from './routes/tenant';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Security middleware
app.use(securityMiddleware);
app.use(customSecurityHeaders);
app.use(requestLogger);

// CORS configuration
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Apply rate limiting to all API routes
app.use('/api', apiRateLimiter);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const redisHealth = await redisManager.healthCheck();
    
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      service: 'jeweler-backend',
      version: '1.0.0',
      dependencies: {
        redis: redisHealth
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'Service Unavailable',
      timestamp: new Date().toISOString(),
      service: 'jeweler-backend',
      version: '1.0.0',
      error: 'Health check failed'
    });
  }
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/tenants', tenantRoutes);

// API status endpoint
app.get('/api/v1/status', (req, res) => {
  res.json({
    message: 'Jeweler SaaS Platform API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`
  });
});

// Initialize Redis connection and start server
async function startServer() {
  try {
    // Connect to Redis
    await redisManager.connect();
    logger.info('Redis connected successfully');

    // Start the server
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(`🔌 WebSocket server ready`);
      logger.info(`🔄 Redis caching and session management active`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  try {
    await redisManager.disconnect();
    logger.info('Redis disconnected');
    
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  try {
    await redisManager.disconnect();
    logger.info('Redis disconnected');
    
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Start the server
startServer();

export default app;