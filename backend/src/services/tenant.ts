import { PrismaClient } from '@prisma/client';
import { platformDb, getTenantDb, createTenantDatabase, generateTenantDatabaseName, closeTenantDb } from '../database/connection';
import { initializeTenantDatabase, migrateTenantDatabase, verifyTenantDatabaseSchema } from '../database/tenant-migrations';
import { createHash, randomBytes } from 'crypto';

export interface CreateTenantRequest {
  name: string;
  subdomain: string;
  adminEmail: string;
  adminPassword: string;
  adminName?: string;
}

export interface TenantInfo {
  id: string;
  name: string;
  subdomain: string;
  databaseName: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  userCount?: number;
}

export interface TenantValidationResult {
  isValid: boolean;
  tenant?: TenantInfo;
  error?: string;
}

export interface TenantSwitchResult {
  success: boolean;
  tenantId?: string;
  error?: string;
}

export class TenantService {
  /**
   * Create a new tenant with isolated database and admin user
   */
  async createTenant(request: CreateTenantRequest): Promise<TenantInfo> {
    try {
      // Validate subdomain uniqueness
      const existingTenant = await platformDb.tenant.findUnique({
        where: { subdomain: request.subdomain }
      });

      if (existingTenant) {
        throw new Error(`Subdomain '${request.subdomain}' is already taken`);
      }

      // Validate subdomain format
      if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(request.subdomain) || request.subdomain.length < 3) {
        throw new Error('Subdomain must be at least 3 characters long and contain only lowercase letters, numbers, and hyphens');
      }

      // Generate unique database name
      const tenantId = this.generateTenantId();
      const databaseName = generateTenantDatabaseName(request.name, tenantId);

      // Create tenant record in platform database
      const tenant = await platformDb.tenant.create({
        data: {
          id: tenantId,
          name: request.name,
          subdomain: request.subdomain,
          databaseName: databaseName,
          status: 'TRIAL'
        }
      });

      // Initialize tenant database with schema
      await initializeTenantDatabase(tenant.id, databaseName);

      // Create admin user for the tenant
      await this.createTenantAdminUser(tenant.id, {
        email: request.adminEmail,
        password: request.adminPassword,
        name: request.adminName || 'Admin'
      });

      // Initialize default data for the tenant
      await this.initializeTenantDefaults(tenant.id);

      console.log(`✓ Successfully created tenant: ${tenant.name} (${tenant.subdomain})`);

      return {
        id: tenant.id,
        name: tenant.name,
        subdomain: tenant.subdomain,
        databaseName: tenant.databaseName,
        status: tenant.status,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt
      };
    } catch (error) {
      console.error('Failed to create tenant:', error);
      throw error;
    }
  }

  /**
   * Get tenant information by ID or subdomain
   */
  async getTenant(identifier: string): Promise<TenantInfo | null> {
    try {
      const tenant = await platformDb.tenant.findFirst({
        where: {
          OR: [
            { id: identifier },
            { subdomain: identifier }
          ]
        },
        include: {
          _count: {
            select: { users: true }
          }
        }
      });

      if (!tenant) {
        return null;
      }

      return {
        id: tenant.id,
        name: tenant.name,
        subdomain: tenant.subdomain,
        databaseName: tenant.databaseName,
        status: tenant.status,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
        userCount: tenant._count.users
      };
    } catch (error) {
      console.error('Failed to get tenant:', error);
      throw error;
    }
  }

  /**
   * List all tenants with optional filtering
   */
  async listTenants(filters?: {
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ tenants: TenantInfo[]; total: number }> {
    try {
      const where: any = {};

      if (filters?.status) {
        where.status = filters.status;
      }

      if (filters?.search) {
        where.OR = [
          { name: { contains: filters.search } },
          { subdomain: { contains: filters.search } }
        ];
      }

      const [tenants, total] = await Promise.all([
        platformDb.tenant.findMany({
          where,
          include: {
            _count: {
              select: { users: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: filters?.limit || 50,
          skip: filters?.offset || 0
        }),
        platformDb.tenant.count({ where })
      ]);

      return {
        tenants: tenants.map(tenant => ({
          id: tenant.id,
          name: tenant.name,
          subdomain: tenant.subdomain,
          databaseName: tenant.databaseName,
          status: tenant.status,
          createdAt: tenant.createdAt,
          updatedAt: tenant.updatedAt,
          userCount: tenant._count.users
        })),
        total
      };
    } catch (error) {
      console.error('Failed to list tenants:', error);
      throw error;
    }
  }

  /**
   * Update tenant information
   */
  async updateTenant(tenantId: string, updates: {
    name?: string;
    status?: 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  }): Promise<TenantInfo> {
    try {
      const tenant = await platformDb.tenant.update({
        where: { id: tenantId },
        data: updates
      });

      return {
        id: tenant.id,
        name: tenant.name,
        subdomain: tenant.subdomain,
        databaseName: tenant.databaseName,
        status: tenant.status,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt
      };
    } catch (error) {
      console.error('Failed to update tenant:', error);
      throw error;
    }
  }

  /**
   * Validate tenant access and status
   */
  async validateTenant(identifier: string): Promise<TenantValidationResult> {
    try {
      const tenant = await this.getTenant(identifier);

      if (!tenant) {
        return {
          isValid: false,
          error: 'Tenant not found'
        };
      }

      if (tenant.status === 'SUSPENDED') {
        return {
          isValid: false,
          tenant,
          error: 'Tenant account is suspended'
        };
      }

      if (tenant.status === 'CANCELLED') {
        return {
          isValid: false,
          tenant,
          error: 'Tenant account is cancelled'
        };
      }

      // Verify database connectivity
      try {
        const tenantDb = await getTenantDb(tenant.id);
        await tenantDb.$queryRaw`SELECT 1`;
      } catch (dbError) {
        return {
          isValid: false,
          tenant,
          error: 'Tenant database is not accessible'
        };
      }

      return {
        isValid: true,
        tenant
      };
    } catch (error) {
      console.error('Failed to validate tenant:', error);
      return {
        isValid: false,
        error: 'Tenant validation failed'
      };
    }
  }

  /**
   * Switch tenant context for a user
   */
  async switchTenantContext(userId: string, targetTenantId: string): Promise<TenantSwitchResult> {
    try {
      // Verify user belongs to the target tenant
      const user = await platformDb.tenantUser.findFirst({
        where: {
          id: userId,
          tenantId: targetTenantId,
          isActive: true
        },
        include: { tenant: true }
      });

      if (!user) {
        return {
          success: false,
          error: 'User does not have access to the specified tenant'
        };
      }

      // Validate tenant status
      const validation = await this.validateTenant(targetTenantId);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.error
        };
      }

      return {
        success: true,
        tenantId: targetTenantId
      };
    } catch (error) {
      console.error('Failed to switch tenant context:', error);
      return {
        success: false,
        error: 'Tenant context switch failed'
      };
    }
  }

  /**
   * Test tenant isolation by attempting cross-tenant data access
   */
  async testTenantIsolation(tenantId1: string, tenantId2: string): Promise<{
    isolated: boolean;
    details: string[];
  }> {
    const details: string[] = [];
    let isolated = true;

    try {
      // Get both tenant databases
      const tenant1Db = await getTenantDb(tenantId1);
      const tenant2Db = await getTenantDb(tenantId2);

      // Create test data in tenant1
      const testCustomer = await tenant1Db.customer.create({
        data: {
          name: 'Test Customer for Isolation',
          email: 'test@isolation.com'
        }
      });
      details.push(`Created test customer in tenant1: ${testCustomer.id}`);

      // Try to access tenant1 data from tenant2 (should fail)
      try {
        const crossTenantCustomer = await tenant2Db.customer.findUnique({
          where: { id: testCustomer.id }
        });

        if (crossTenantCustomer) {
          isolated = false;
          details.push(`❌ ISOLATION BREACH: Found tenant1 customer in tenant2 database`);
        } else {
          details.push(`✅ Tenant isolation working: Cannot access tenant1 data from tenant2`);
        }
      } catch (error) {
        details.push(`✅ Tenant isolation working: Database error when accessing cross-tenant data`);
      }

      // Create test data in tenant2
      const testCustomer2 = await tenant2Db.customer.create({
        data: {
          name: 'Test Customer 2 for Isolation',
          email: 'test2@isolation.com'
        }
      });
      details.push(`Created test customer in tenant2: ${testCustomer2.id}`);

      // Try to access tenant2 data from tenant1 (should fail)
      try {
        const crossTenantCustomer2 = await tenant1Db.customer.findUnique({
          where: { id: testCustomer2.id }
        });

        if (crossTenantCustomer2) {
          isolated = false;
          details.push(`❌ ISOLATION BREACH: Found tenant2 customer in tenant1 database`);
        } else {
          details.push(`✅ Tenant isolation working: Cannot access tenant2 data from tenant1`);
        }
      } catch (error) {
        details.push(`✅ Tenant isolation working: Database error when accessing cross-tenant data`);
      }

      // Cleanup test data
      await tenant1Db.customer.delete({ where: { id: testCustomer.id } });
      await tenant2Db.customer.delete({ where: { id: testCustomer2.id } });
      details.push(`Cleaned up test data from both tenants`);

    } catch (error) {
      isolated = false;
      details.push(`❌ Error during isolation test: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { isolated, details };
  }

  /**
   * Delete a tenant and all associated data (use with extreme caution)
   */
  async deleteTenant(tenantId: string, confirmation: string): Promise<void> {
    if (confirmation !== `DELETE_TENANT_${tenantId}`) {
      throw new Error('Invalid confirmation string for tenant deletion');
    }

    try {
      const tenant = await platformDb.tenant.findUnique({
        where: { id: tenantId }
      });

      if (!tenant) {
        throw new Error('Tenant not found');
      }

      // Close tenant database connection
      await closeTenantDb(tenantId);

      // Drop tenant database
      await platformDb.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${tenant.databaseName}\``);

      // Delete tenant record (this will cascade delete users)
      await platformDb.tenant.delete({
        where: { id: tenantId }
      });

      console.log(`✓ Successfully deleted tenant: ${tenant.name} (${tenant.subdomain})`);
    } catch (error) {
      console.error('Failed to delete tenant:', error);
      throw error;
    }
  }

  /**
   * Get tenant database health status
   */
  async getTenantHealth(tenantId: string): Promise<{
    healthy: boolean;
    details: {
      databaseConnectable: boolean;
      schemaValid: boolean;
      recordCount: number;
    };
  }> {
    try {
      const tenant = await this.getTenant(tenantId);
      if (!tenant) {
        return {
          healthy: false,
          details: {
            databaseConnectable: false,
            schemaValid: false,
            recordCount: 0
          }
        };
      }

      let databaseConnectable = false;
      let schemaValid = false;
      let recordCount = 0;

      try {
        const tenantDb = await getTenantDb(tenantId);
        await tenantDb.$queryRaw`SELECT 1`;
        databaseConnectable = true;

        // Check schema validity
        schemaValid = await verifyTenantDatabaseSchema(tenantId);

        // Get record count
        const customerCount = await tenantDb.customer.count();
        recordCount = customerCount;
      } catch (error) {
        console.error(`Health check failed for tenant ${tenantId}:`, error);
      }

      return {
        healthy: databaseConnectable && schemaValid,
        details: {
          databaseConnectable,
          schemaValid,
          recordCount
        }
      };
    } catch (error) {
      console.error('Failed to get tenant health:', error);
      return {
        healthy: false,
        details: {
          databaseConnectable: false,
          schemaValid: false,
          recordCount: 0
        }
      };
    }
  }

  /**
   * Private helper methods
   */
  private generateTenantId(): string {
    return `tenant_${randomBytes(16).toString('hex')}`;
  }

  private async createTenantAdminUser(tenantId: string, adminData: {
    email: string;
    password: string;
    name: string;
  }): Promise<void> {
    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash(adminData.password, 12);

    await platformDb.tenantUser.create({
      data: {
        tenantId,
        email: adminData.email,
        passwordHash,
        role: 'TENANT_ADMIN'
      }
    });
  }

  private async initializeTenantDefaults(tenantId: string): Promise<void> {
    try {
      const tenantDb = await getTenantDb(tenantId);

      // Initialize default chart of accounts
      const defaultAccounts = [
        { code: '1000', name: 'نقد و بانک', type: 'ASSET' },
        { code: '1100', name: 'حساب های دریافتنی', type: 'ASSET' },
        { code: '1200', name: 'موجودی کالا', type: 'ASSET' },
        { code: '2000', name: 'حساب های پرداختنی', type: 'LIABILITY' },
        { code: '3000', name: 'سرمایه', type: 'EQUITY' },
        { code: '4000', name: 'درآمد فروش', type: 'REVENUE' },
        { code: '5000', name: 'هزینه های عملیاتی', type: 'EXPENSE' }
      ];

      for (const account of defaultAccounts) {
        await tenantDb.chartOfAccounts.create({
          data: {
            accountCode: account.code,
            accountName: account.name,
            accountType: account.type as any
          }
        });
      }

      // Initialize default system settings
      const defaultSettings = [
        { key: 'business_name', value: 'طلافروشی', description: 'نام کسب و کار' },
        { key: 'currency', value: 'IRR', description: 'واحد پول' },
        { key: 'vat_rate', value: '9', description: 'نرخ مالیات بر ارزش افزوده' },
        { key: 'gold_price_source', value: 'manual', description: 'منبع قیمت طلا' },
        { key: 'default_profit_margin', value: '10', description: 'حاشیه سود پیش فرض' }
      ];

      for (const setting of defaultSettings) {
        await tenantDb.systemSettings.create({
          data: {
            key: setting.key,
            value: setting.value,
            description: setting.description,
            updatedBy: 'system'
          }
        });
      }

      console.log(`✓ Initialized default data for tenant: ${tenantId}`);
    } catch (error) {
      console.error(`Failed to initialize tenant defaults for ${tenantId}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const tenantService = new TenantService();