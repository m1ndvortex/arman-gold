import { Router, Request, Response } from 'express';
import { tenantService } from '../services/tenant';
import { authMiddleware, requireRole, optionalTenantMiddleware, tenantSwitchMiddleware } from '../middleware/tenant';
const { body, param, query, validationResult } = require('express-validator');

const router = Router();

/**
 * Validation middleware
 */
const handleValidationErrors = (req: Request, res: Response, next: any): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Invalid input data',
      details: errors.array(),
      code: 'VALIDATION_ERROR'
    });
    return;
  }
  next();
};

/**
 * Create a new tenant (Super Admin only)
 * POST /api/tenants
 */
router.post('/',
  [
    body('name').isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
    body('subdomain').isLength({ min: 3, max: 50 }).matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/).withMessage('Invalid subdomain format'),
    body('adminEmail').isEmail().withMessage('Valid email is required'),
    body('adminPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('adminName').optional().isLength({ min: 1, max: 100 }).withMessage('Admin name must be between 1 and 100 characters')
  ],
  handleValidationErrors,
  optionalTenantMiddleware,
  authMiddleware,
  requireRole(['SUPER_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenant = await tenantService.createTenant({
        name: req.body.name,
        subdomain: req.body.subdomain,
        adminEmail: req.body.adminEmail,
        adminPassword: req.body.adminPassword,
        adminName: req.body.adminName
      });

      res.status(201).json({
        success: true,
        data: tenant,
        message: 'Tenant created successfully'
      });
    } catch (error: any) {
      console.error('Create tenant error:', error);
      res.status(400).json({
        error: 'TENANT_CREATION_FAILED',
        message: error.message || 'Failed to create tenant',
        code: 'TENANT_CREATION_FAILED'
      });
    }
  }
);

/**
 * Get tenant information
 * GET /api/tenants/:identifier
 */
router.get('/:identifier',
  [
    param('identifier').notEmpty().withMessage('Tenant identifier is required')
  ],
  handleValidationErrors,
  optionalTenantMiddleware,
  authMiddleware,
  requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenant = await tenantService.getTenant(req.params.identifier);

      if (!tenant) {
        res.status(404).json({
          error: 'TENANT_NOT_FOUND',
          message: 'Tenant not found',
          code: 'TENANT_NOT_FOUND'
        });
        return;
      }

      // Non-super admins can only view their own tenant
      if (req.userRole !== 'SUPER_ADMIN' && req.tenantId !== tenant.id) {
        res.status(403).json({
          error: 'ACCESS_DENIED',
          message: 'Access denied to tenant information',
          code: 'ACCESS_DENIED'
        });
        return;
      }

      res.json({
        success: true,
        data: tenant
      });
    } catch (error: any) {
      console.error('Get tenant error:', error);
      res.status(500).json({
        error: 'TENANT_FETCH_FAILED',
        message: 'Failed to fetch tenant information',
        code: 'TENANT_FETCH_FAILED'
      });
    }
  }
);

/**
 * List all tenants (Super Admin only)
 * GET /api/tenants
 */
router.get('/',
  [
    query('status').optional().isIn(['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED']).withMessage('Invalid status'),
    query('search').optional().isLength({ min: 1, max: 100 }).withMessage('Search term must be between 1 and 100 characters'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative')
  ],
  handleValidationErrors,
  optionalTenantMiddleware,
  authMiddleware,
  requireRole(['SUPER_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const filters = {
        status: req.query.status as string,
        search: req.query.search as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
      };

      const result = await tenantService.listTenants(filters);

      res.json({
        success: true,
        data: result.tenants,
        pagination: {
          total: result.total,
          limit: filters.limit || 50,
          offset: filters.offset || 0
        }
      });
    } catch (error: any) {
      console.error('List tenants error:', error);
      res.status(500).json({
        error: 'TENANT_LIST_FAILED',
        message: 'Failed to list tenants',
        code: 'TENANT_LIST_FAILED'
      });
    }
  }
);

/**
 * Update tenant information
 * PUT /api/tenants/:tenantId
 */
router.put('/:tenantId',
  [
    param('tenantId').notEmpty().withMessage('Tenant ID is required'),
    body('name').optional().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
    body('status').optional().isIn(['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED']).withMessage('Invalid status')
  ],
  handleValidationErrors,
  optionalTenantMiddleware,
  authMiddleware,
  requireRole(['SUPER_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const updates: any = {};
      if (req.body.name) updates.name = req.body.name;
      if (req.body.status) updates.status = req.body.status;

      const tenant = await tenantService.updateTenant(req.params.tenantId, updates);

      res.json({
        success: true,
        data: tenant,
        message: 'Tenant updated successfully'
      });
    } catch (error: any) {
      console.error('Update tenant error:', error);
      res.status(400).json({
        error: 'TENANT_UPDATE_FAILED',
        message: error.message || 'Failed to update tenant',
        code: 'TENANT_UPDATE_FAILED'
      });
    }
  }
);

/**
 * Validate tenant access
 * POST /api/tenants/:identifier/validate
 */
router.post('/:identifier/validate',
  [
    param('identifier').notEmpty().withMessage('Tenant identifier is required')
  ],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const validation = await tenantService.validateTenant(req.params.identifier);

      res.json({
        success: true,
        data: {
          isValid: validation.isValid,
          tenant: validation.tenant,
          error: validation.error
        }
      });
    } catch (error: any) {
      console.error('Validate tenant error:', error);
      res.status(500).json({
        error: 'TENANT_VALIDATION_FAILED',
        message: 'Failed to validate tenant',
        code: 'TENANT_VALIDATION_FAILED'
      });
    }
  }
);

/**
 * Switch tenant context
 * POST /api/tenants/:tenantId/switch
 */
router.post('/:tenantId/switch',
  [
    param('tenantId').notEmpty().withMessage('Tenant ID is required')
  ],
  handleValidationErrors,
  authMiddleware,
  tenantSwitchMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const switchResult = await tenantService.switchTenantContext(req.userId!, req.params.tenantId);

      if (!switchResult.success) {
        res.status(403).json({
          error: 'TENANT_SWITCH_FAILED',
          message: switchResult.error || 'Failed to switch tenant context',
          code: 'TENANT_SWITCH_FAILED'
        });
        return;
      }

      res.json({
        success: true,
        data: {
          tenantId: switchResult.tenantId,
          tenantInfo: req.tenantInfo
        },
        message: 'Tenant context switched successfully'
      });
    } catch (error: any) {
      console.error('Switch tenant error:', error);
      res.status(500).json({
        error: 'TENANT_SWITCH_ERROR',
        message: 'Failed to switch tenant context',
        code: 'TENANT_SWITCH_ERROR'
      });
    }
  }
);

/**
 * Test tenant isolation
 * POST /api/tenants/:tenantId1/test-isolation/:tenantId2
 */
router.post('/:tenantId1/test-isolation/:tenantId2',
  [
    param('tenantId1').notEmpty().withMessage('First tenant ID is required'),
    param('tenantId2').notEmpty().withMessage('Second tenant ID is required')
  ],
  handleValidationErrors,
  optionalTenantMiddleware,
  authMiddleware,
  requireRole(['SUPER_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const isolationTest = await tenantService.testTenantIsolation(
        req.params.tenantId1,
        req.params.tenantId2
      );

      res.json({
        success: true,
        data: {
          isolated: isolationTest.isolated,
          details: isolationTest.details
        },
        message: isolationTest.isolated ? 'Tenant isolation is working correctly' : 'Tenant isolation issues detected'
      });
    } catch (error: any) {
      console.error('Test tenant isolation error:', error);
      res.status(500).json({
        error: 'ISOLATION_TEST_FAILED',
        message: 'Failed to test tenant isolation',
        code: 'ISOLATION_TEST_FAILED'
      });
    }
  }
);

/**
 * Get tenant health status
 * GET /api/tenants/:tenantId/health
 */
router.get('/:tenantId/health',
  [
    param('tenantId').notEmpty().withMessage('Tenant ID is required')
  ],
  handleValidationErrors,
  optionalTenantMiddleware,
  authMiddleware,
  requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Non-super admins can only check their own tenant health
      if (req.userRole !== 'SUPER_ADMIN' && req.tenantId !== req.params.tenantId) {
        res.status(403).json({
          error: 'ACCESS_DENIED',
          message: 'Access denied to tenant health information',
          code: 'ACCESS_DENIED'
        });
        return;
      }

      const health = await tenantService.getTenantHealth(req.params.tenantId);

      res.json({
        success: true,
        data: health,
        message: health.healthy ? 'Tenant is healthy' : 'Tenant health issues detected'
      });
    } catch (error: any) {
      console.error('Get tenant health error:', error);
      res.status(500).json({
        error: 'TENANT_HEALTH_CHECK_FAILED',
        message: 'Failed to check tenant health',
        code: 'TENANT_HEALTH_CHECK_FAILED'
      });
    }
  }
);

/**
 * Delete tenant (Super Admin only, requires confirmation)
 * DELETE /api/tenants/:tenantId
 */
router.delete('/:tenantId',
  [
    param('tenantId').notEmpty().withMessage('Tenant ID is required'),
    body('confirmation').notEmpty().withMessage('Confirmation string is required')
  ],
  handleValidationErrors,
  optionalTenantMiddleware,
  authMiddleware,
  requireRole(['SUPER_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      await tenantService.deleteTenant(req.params.tenantId, req.body.confirmation);

      res.json({
        success: true,
        message: 'Tenant deleted successfully'
      });
    } catch (error: any) {
      console.error('Delete tenant error:', error);
      res.status(400).json({
        error: 'TENANT_DELETION_FAILED',
        message: error.message || 'Failed to delete tenant',
        code: 'TENANT_DELETION_FAILED'
      });
    }
  }
);

export default router;