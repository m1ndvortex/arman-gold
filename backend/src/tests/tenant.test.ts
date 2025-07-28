import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { tenantService } from '../services/tenant';
import { platformDb, getTenantDb, closeTenantDb } from '../database/connection';
import { initializeTenantDatabase } from '../database/tenant-migrations';

describe('Tenant Management System', () => {
  let testTenant1Id: string;
  let testTenant2Id: string;
  let testTenant1: any;
  let testTenant2: any;

  beforeAll(async () => {
    // Ensure platform database is connected
    await platformDb.$connect();
  });

  afterAll(async () => {
    // Cleanup test tenants
    if (testTenant1Id) {
      try {
        await tenantService.deleteTenant(testTenant1Id, `DELETE_TENANT_${testTenant1Id}`);
      } catch (error) {
        console.warn('Failed to cleanup test tenant 1:', error);
      }
    }

    if (testTenant2Id) {
      try {
        await tenantService.deleteTenant(testTenant2Id, `DELETE_TENANT_${testTenant2Id}`);
      } catch (error) {
        console.warn('Failed to cleanup test tenant 2:', error);
      }
    }

    await platformDb.$disconnect();
  });

  describe('Tenant Creation and Management', () => {
    test('should create a new tenant with isolated database', async () => {
      const tenantData = {
        name: 'Test Jeweler 1',
        subdomain: 'testjeweler1',
        adminEmail: 'admin@testjeweler1.com',
        adminPassword: 'SecurePassword123!',
        adminName: 'Test Admin'
      };

      testTenant1 = await tenantService.createTenant(tenantData);
      testTenant1Id = testTenant1.id;

      expect(testTenant1).toBeDefined();
      expect(testTenant1.name).toBe(tenantData.name);
      expect(testTenant1.subdomain).toBe(tenantData.subdomain);
      expect(testTenant1.status).toBe('TRIAL');
      expect(testTenant1.databaseName).toContain('tenant_');

      // Verify tenant exists in platform database
      const dbTenant = await platformDb.tenant.findUnique({
        where: { id: testTenant1.id }
      });
      expect(dbTenant).toBeDefined();
      expect(dbTenant!.name).toBe(tenantData.name);

      // Verify admin user was created
      const adminUser = await platformDb.tenantUser.findFirst({
        where: {
          tenantId: testTenant1.id,
          email: tenantData.adminEmail,
          role: 'TENANT_ADMIN'
        }
      });
      expect(adminUser).toBeDefined();
      expect(adminUser!.email).toBe(tenantData.adminEmail);
    });

    test('should create a second tenant with different database', async () => {
      const tenantData = {
        name: 'Test Jeweler 2',
        subdomain: 'testjeweler2',
        adminEmail: 'admin@testjeweler2.com',
        adminPassword: 'SecurePassword123!',
        adminName: 'Test Admin 2'
      };

      testTenant2 = await tenantService.createTenant(tenantData);
      testTenant2Id = testTenant2.id;

      expect(testTenant2).toBeDefined();
      expect(testTenant2.name).toBe(tenantData.name);
      expect(testTenant2.subdomain).toBe(tenantData.subdomain);
      expect(testTenant2.databaseName).not.toBe(testTenant1.databaseName);
    });

    test('should reject duplicate subdomain', async () => {
      const tenantData = {
        name: 'Duplicate Subdomain Test',
        subdomain: 'testjeweler1', // Same as first tenant
        adminEmail: 'admin@duplicate.com',
        adminPassword: 'SecurePassword123!'
      };

      await expect(tenantService.createTenant(tenantData))
        .rejects.toThrow('Subdomain \'testjeweler1\' is already taken');
    });

    test('should reject invalid subdomain format', async () => {
      const tenantData = {
        name: 'Invalid Subdomain Test',
        subdomain: 'Invalid_Subdomain!', // Invalid characters
        adminEmail: 'admin@invalid.com',
        adminPassword: 'SecurePassword123!'
      };

      await expect(tenantService.createTenant(tenantData))
        .rejects.toThrow('Subdomain must be at least 3 characters long');
    });
  });

  describe('Tenant Retrieval and Validation', () => {
    test('should retrieve tenant by ID', async () => {
      const tenant = await tenantService.getTenant(testTenant1Id);
      
      expect(tenant).toBeDefined();
      expect(tenant!.id).toBe(testTenant1Id);
      expect(tenant!.name).toBe('Test Jeweler 1');
      expect(tenant!.subdomain).toBe('testjeweler1');
    });

    test('should retrieve tenant by subdomain', async () => {
      const tenant = await tenantService.getTenant('testjeweler1');
      
      expect(tenant).toBeDefined();
      expect(tenant!.id).toBe(testTenant1Id);
      expect(tenant!.name).toBe('Test Jeweler 1');
    });

    test('should return null for non-existent tenant', async () => {
      const tenant = await tenantService.getTenant('nonexistent');
      expect(tenant).toBeNull();
    });

    test('should validate active tenant', async () => {
      const validation = await tenantService.validateTenant(testTenant1Id);
      
      expect(validation.isValid).toBe(true);
      expect(validation.tenant).toBeDefined();
      expect(validation.error).toBeUndefined();
    });

    test('should reject suspended tenant', async () => {
      // Suspend the tenant
      await tenantService.updateTenant(testTenant1Id, { status: 'SUSPENDED' });
      
      const validation = await tenantService.validateTenant(testTenant1Id);
      
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('suspended');
      
      // Restore tenant status
      await tenantService.updateTenant(testTenant1Id, { status: 'TRIAL' });
    });
  });

  describe('Tenant Database Isolation', () => {
    test('should have separate databases for different tenants', async () => {
      const tenant1Db = await getTenantDb(testTenant1Id);
      const tenant2Db = await getTenantDb(testTenant2Id);

      // Create test customer in tenant 1
      const customer1 = await tenant1Db.customer.create({
        data: {
          name: 'Customer in Tenant 1',
          email: 'customer1@tenant1.com'
        }
      });

      // Create test customer in tenant 2
      const customer2 = await tenant2Db.customer.create({
        data: {
          name: 'Customer in Tenant 2',
          email: 'customer2@tenant2.com'
        }
      });

      // Verify customers exist in their respective databases
      const foundCustomer1 = await tenant1Db.customer.findUnique({
        where: { id: customer1.id }
      });
      expect(foundCustomer1).toBeDefined();
      expect(foundCustomer1!.name).toBe('Customer in Tenant 1');

      const foundCustomer2 = await tenant2Db.customer.findUnique({
        where: { id: customer2.id }
      });
      expect(foundCustomer2).toBeDefined();
      expect(foundCustomer2!.name).toBe('Customer in Tenant 2');

      // Verify cross-tenant isolation - customer1 should not exist in tenant2 database
      const crossTenantCustomer1 = await tenant2Db.customer.findUnique({
        where: { id: customer1.id }
      });
      expect(crossTenantCustomer1).toBeNull();

      // Verify cross-tenant isolation - customer2 should not exist in tenant1 database
      const crossTenantCustomer2 = await tenant1Db.customer.findUnique({
        where: { id: customer2.id }
      });
      expect(crossTenantCustomer2).toBeNull();

      // Cleanup
      await tenant1Db.customer.delete({ where: { id: customer1.id } });
      await tenant2Db.customer.delete({ where: { id: customer2.id } });
    });

    test('should prevent cross-tenant data access using service method', async () => {
      const isolationTest = await tenantService.testTenantIsolation(testTenant1Id, testTenant2Id);
      
      expect(isolationTest.isolated).toBe(true);
      expect(isolationTest.details).toContain('✅ Tenant isolation working');
      expect(isolationTest.details.some(detail => detail.includes('ISOLATION BREACH'))).toBe(false);
    });
  });

  describe('Tenant Context Switching', () => {
    let adminUserId: string;

    beforeEach(async () => {
      // Get admin user for testing
      const adminUser = await platformDb.tenantUser.findFirst({
        where: {
          tenantId: testTenant1Id,
          role: 'TENANT_ADMIN'
        }
      });
      adminUserId = adminUser!.id;
    });

    test('should allow switching to accessible tenant', async () => {
      const switchResult = await tenantService.switchTenantContext(adminUserId, testTenant1Id);
      
      expect(switchResult.success).toBe(true);
      expect(switchResult.tenantId).toBe(testTenant1Id);
      expect(switchResult.error).toBeUndefined();
    });

    test('should reject switching to inaccessible tenant', async () => {
      const switchResult = await tenantService.switchTenantContext(adminUserId, testTenant2Id);
      
      expect(switchResult.success).toBe(false);
      expect(switchResult.error).toContain('does not have access');
    });

    test('should reject switching with invalid user', async () => {
      const switchResult = await tenantService.switchTenantContext('invalid-user-id', testTenant1Id);
      
      expect(switchResult.success).toBe(false);
      expect(switchResult.error).toContain('does not have access');
    });
  });

  describe('Tenant Health and Management', () => {
    test('should report healthy tenant status', async () => {
      const health = await tenantService.getTenantHealth(testTenant1Id);
      
      expect(health.healthy).toBe(true);
      expect(health.details.databaseConnectable).toBe(true);
      expect(health.details.schemaValid).toBe(true);
      expect(health.details.recordCount).toBeGreaterThanOrEqual(0);
    });

    test('should list tenants with filtering', async () => {
      const result = await tenantService.listTenants({
        status: 'TRIAL',
        limit: 10,
        offset: 0
      });
      
      expect(result.tenants).toBeDefined();
      expect(result.total).toBeGreaterThanOrEqual(2);
      expect(result.tenants.some(t => t.id === testTenant1Id)).toBe(true);
      expect(result.tenants.some(t => t.id === testTenant2Id)).toBe(true);
    });

    test('should update tenant information', async () => {
      const updatedTenant = await tenantService.updateTenant(testTenant1Id, {
        name: 'Updated Test Jeweler 1',
        status: 'ACTIVE'
      });
      
      expect(updatedTenant.name).toBe('Updated Test Jeweler 1');
      expect(updatedTenant.status).toBe('ACTIVE');
      
      // Verify in database
      const dbTenant = await platformDb.tenant.findUnique({
        where: { id: testTenant1Id }
      });
      expect(dbTenant!.name).toBe('Updated Test Jeweler 1');
      expect(dbTenant!.status).toBe('ACTIVE');
    });
  });

  describe('Tenant Default Data Initialization', () => {
    test('should initialize default chart of accounts', async () => {
      const tenantDb = await getTenantDb(testTenant1Id);
      
      const accounts = await tenantDb.chartOfAccounts.findMany();
      expect(accounts.length).toBeGreaterThan(0);
      
      // Check for specific default accounts
      const cashAccount = accounts.find(acc => acc.accountCode === '1000');
      expect(cashAccount).toBeDefined();
      expect(cashAccount!.accountName).toBe('نقد و بانک');
      expect(cashAccount!.accountType).toBe('ASSET');
      
      const revenueAccount = accounts.find(acc => acc.accountCode === '4000');
      expect(revenueAccount).toBeDefined();
      expect(revenueAccount!.accountName).toBe('درآمد فروش');
      expect(revenueAccount!.accountType).toBe('REVENUE');
    });

    test('should initialize default system settings', async () => {
      const tenantDb = await getTenantDb(testTenant1Id);
      
      const settings = await tenantDb.systemSettings.findMany();
      expect(settings.length).toBeGreaterThan(0);
      
      // Check for specific default settings
      const businessName = settings.find(s => s.key === 'business_name');
      expect(businessName).toBeDefined();
      expect(businessName!.value).toBe('طلافروشی');
      
      const currency = settings.find(s => s.key === 'currency');
      expect(currency).toBeDefined();
      expect(currency!.value).toBe('IRR');
      
      const vatRate = settings.find(s => s.key === 'vat_rate');
      expect(vatRate).toBeDefined();
      expect(vatRate!.value).toBe('9');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle database connection errors gracefully', async () => {
      // Test with non-existent tenant
      const validation = await tenantService.validateTenant('non-existent-tenant');
      expect(validation.isValid).toBe(false);
      expect(validation.error).toBe('Tenant not found');
    });

    test('should handle invalid tenant deletion confirmation', async () => {
      await expect(tenantService.deleteTenant(testTenant1Id, 'invalid-confirmation'))
        .rejects.toThrow('Invalid confirmation string');
    });

    test('should handle tenant creation with missing required fields', async () => {
      const invalidTenantData = {
        name: '',
        subdomain: 'test',
        adminEmail: 'invalid-email',
        adminPassword: '123'
      };

      await expect(tenantService.createTenant(invalidTenantData as any))
        .rejects.toThrow();
    });
  });
});

describe('Tenant Middleware Integration', () => {
  // These tests would require setting up Express app and testing middleware
  // For now, we'll focus on the service layer tests above
  
  test.skip('should extract tenant context from subdomain', async () => {
    // TODO: Implement middleware integration tests
  });

  test.skip('should extract tenant context from header', async () => {
    // TODO: Implement middleware integration tests
  });

  test.skip('should extract tenant context from JWT token', async () => {
    // TODO: Implement middleware integration tests
  });
});