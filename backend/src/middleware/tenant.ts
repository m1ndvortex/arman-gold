import { Request, Response, NextFunction } from 'express';
import { getTenantDb, platformDb } from '../database/connection';
import { tenantService } from '../services/tenant';
import jwt from 'jsonwebtoken';

// Extend Express Request interface to include tenant context
declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      tenantDb?: any; // PrismaClient type
      userId?: string;
      userRole?: string;
      tenantInfo?: {
        id: string;
        name: string;
        subdomain: string;
        status: string;
      };
    }
  }
}

export interface TenantContext {
  id: string;
  name: string;
  subdomain: string;
  databaseName: string;
  status: string;
}

export interface UserContext {
  id: string;
  email: string;
  role: string;
  tenantId: string;
}

/**
 * Extract tenant information from request
 * Supports multiple methods: subdomain, header, JWT token
 */
export async function extractTenantContext(req: Request): Promise<TenantContext | null> {
  let tenantIdentifier: string | null = null;

  // Method 1: Extract from subdomain (e.g., tenant1.jeweler.com)
  const host = req.get('host');
  if (host && host.includes('.')) {
    const subdomain = host.split('.')[0];
    if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
      tenantIdentifier = subdomain;
    }
  }

  // Method 2: Extract from X-Tenant-ID header
  if (!tenantIdentifier) {
    tenantIdentifier = req.get('X-Tenant-ID') || null;
  }

  // Method 3: Extract from JWT token
  if (!tenantIdentifier) {
    const authHeader = req.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        tenantIdentifier = decoded.tenantId;
      } catch (error) {
        // Token invalid, continue without tenant context
      }
    }
  }

  if (!tenantIdentifier) {
    return null;
  }

  // Look up tenant by subdomain or ID
  try {
    const tenant = await platformDb.tenant.findFirst({
      where: {
        OR: [
          { subdomain: tenantIdentifier },
          { id: tenantIdentifier }
        ]
      }
    });

    return tenant;
  } catch (error) {
    console.error('Error fetching tenant context:', error);
    return null;
  }
}

/**
 * Middleware to extract and validate tenant context
 */
export const tenantMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantContext = await extractTenantContext(req);

    if (!tenantContext) {
      res.status(400).json({
        error: 'TENANT_REQUIRED',
        message: 'Tenant context is required. Please provide tenant information via subdomain, X-Tenant-ID header, or JWT token.',
        code: 'TENANT_REQUIRED'
      });
      return;
    }

    // Validate tenant using the service
    const validation = await tenantService.validateTenant(tenantContext.id);
    
    if (!validation.isValid) {
      const statusCode = validation.error?.includes('suspended') ? 403 : 
                        validation.error?.includes('cancelled') ? 403 : 
                        validation.error?.includes('not found') ? 404 : 500;
      
      res.status(statusCode).json({
        error: validation.error?.toUpperCase().replace(/\s+/g, '_') || 'TENANT_INVALID',
        message: validation.error || 'Tenant validation failed',
        code: validation.error?.toUpperCase().replace(/\s+/g, '_') || 'TENANT_INVALID'
      });
      return;
    }

    // Get tenant database connection
    const tenantDb = await getTenantDb(tenantContext.id);

    // Add tenant context to request
    req.tenantId = tenantContext.id;
    req.tenantDb = tenantDb;
    req.tenantInfo = {
      id: validation.tenant!.id,
      name: validation.tenant!.name,
      subdomain: validation.tenant!.subdomain,
      status: validation.tenant!.status
    };

    next();
  } catch (error) {
    console.error('Tenant middleware error:', error);
    res.status(500).json({
      error: 'TENANT_ERROR',
      message: 'Failed to establish tenant context',
      code: 'TENANT_ERROR'
    });
  }
};

/**
 * Middleware to extract user context from JWT token
 */
export const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'AUTH_REQUIRED',
        message: 'Authentication token is required'
      });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

    // Validate user exists and is active
    const user = await platformDb.tenantUser.findUnique({
      where: { id: decoded.userId },
      include: { tenant: true }
    });

    if (!user || !user.isActive) {
      res.status(401).json({
        error: 'USER_INVALID',
        message: 'User account is invalid or inactive'
      });
      return;
    }

    // Add user context to request
    req.userId = user.id;
    req.userRole = user.role;

    // If tenant context not already set, set it from user
    if (!req.tenantId) {
      req.tenantId = user.tenantId;
      req.tenantDb = await getTenantDb(user.tenantId);
    }

    // Verify user belongs to the requested tenant
    if (req.tenantId && req.tenantId !== user.tenantId) {
      res.status(403).json({
        error: 'TENANT_MISMATCH',
        message: 'User does not belong to the requested tenant'
      });
      return;
    }

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: 'TOKEN_INVALID',
        message: 'Invalid authentication token'
      });
      return;
    }

    console.error('Auth middleware error:', error);
    res.status(500).json({
      error: 'AUTH_ERROR',
      message: 'Authentication failed'
    });
  }
};

/**
 * Role-based authorization middleware
 */
export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.userRole) {
      res.status(401).json({
        error: 'AUTH_REQUIRED',
        message: 'Authentication required'
      });
      return;
    }

    if (!allowedRoles.includes(req.userRole)) {
      res.status(403).json({
        error: 'INSUFFICIENT_PERMISSIONS',
        message: 'Insufficient permissions for this operation'
      });
      return;
    }

    next();
  };
};

/**
 * Optional tenant middleware (doesn't fail if no tenant context)
 */
export const optionalTenantMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantContext = await extractTenantContext(req);

    if (tenantContext && (tenantContext.status === 'ACTIVE' || tenantContext.status === 'TRIAL')) {
      const validation = await tenantService.validateTenant(tenantContext.id);
      
      if (validation.isValid) {
        const tenantDb = await getTenantDb(tenantContext.id);
        req.tenantId = tenantContext.id;
        req.tenantDb = tenantDb;
        req.tenantInfo = {
          id: validation.tenant!.id,
          name: validation.tenant!.name,
          subdomain: validation.tenant!.subdomain,
          status: validation.tenant!.status
        };
      }
    }

    next();
  } catch (error) {
    // Continue without tenant context
    console.warn('Optional tenant middleware warning:', error);
    next();
  }
};

/**
 * Middleware to handle tenant switching for authenticated users
 */
export const tenantSwitchMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const targetTenantId = req.headers['x-switch-tenant'] as string;
    
    if (!targetTenantId) {
      next();
      return;
    }

    if (!req.userId) {
      res.status(401).json({
        error: 'AUTH_REQUIRED',
        message: 'Authentication required for tenant switching',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    // Attempt to switch tenant context
    const switchResult = await tenantService.switchTenantContext(req.userId, targetTenantId);
    
    if (!switchResult.success) {
      res.status(403).json({
        error: 'TENANT_SWITCH_FAILED',
        message: switchResult.error || 'Failed to switch tenant context',
        code: 'TENANT_SWITCH_FAILED'
      });
      return;
    }

    // Update request context with new tenant
    const tenantDb = await getTenantDb(targetTenantId);
    const tenantInfo = await tenantService.getTenant(targetTenantId);
    
    req.tenantId = targetTenantId;
    req.tenantDb = tenantDb;
    req.tenantInfo = tenantInfo ? {
      id: tenantInfo.id,
      name: tenantInfo.name,
      subdomain: tenantInfo.subdomain,
      status: tenantInfo.status
    } : undefined;

    next();
  } catch (error) {
    console.error('Tenant switch middleware error:', error);
    res.status(500).json({
      error: 'TENANT_SWITCH_ERROR',
      message: 'Failed to switch tenant context',
      code: 'TENANT_SWITCH_ERROR'
    });
  }
};

/**
 * Middleware to prevent cross-tenant data access
 */
export const tenantIsolationMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Ensure tenant context is established
    if (!req.tenantId || !req.tenantDb) {
      res.status(400).json({
        error: 'TENANT_CONTEXT_MISSING',
        message: 'Tenant context is required for this operation',
        code: 'TENANT_CONTEXT_MISSING'
      });
      return;
    }

    // Ensure user belongs to the current tenant
    if (req.userId) {
      const user = await platformDb.tenantUser.findFirst({
        where: {
          id: req.userId,
          tenantId: req.tenantId,
          isActive: true
        }
      });

      if (!user) {
        res.status(403).json({
          error: 'TENANT_ACCESS_DENIED',
          message: 'User does not have access to this tenant',
          code: 'TENANT_ACCESS_DENIED'
        });
        return;
      }
    }

    next();
  } catch (error) {
    console.error('Tenant isolation middleware error:', error);
    res.status(500).json({
      error: 'TENANT_ISOLATION_ERROR',
      message: 'Failed to verify tenant isolation',
      code: 'TENANT_ISOLATION_ERROR'
    });
  }
};