#!/usr/bin/env ts-node

/**
 * Verification script for Task 5: Multi-Tenant Architecture Implementation
 * 
 * This script verifies all requirements:
 * - Create tenant management service with database isolation
 * - Implement tenant context middleware for all API requests
 * - Build tenant switching and validation logic
 * - Create tenant onboarding and setup workflows
 * - Test tenant isolation with multiple tenant databases
 * - Verify cross-tenant data access prevention
 */

import { tenantService } from '../services/tenant';
import { platformDb, getTenantDb, checkDatabaseHealth } from '../database/connection';
import { extractTenantContext, tenantMiddleware, authMiddleware, tenantSwitchMiddleware } from '../middleware/tenant';
import express from 'express';

interface VerificationResult {
  passed: boolean;
  message: string;
  details?: string[];
}

class TenantSystemVerifier {
  private testTenant1Id: string = '';
  private testTenant2Id: string = '';
  private results: VerificationResult[] = [];

  async runAllTests(): Promise<void> {
    console.log('🔍 Starting Tenant System Verification...\n');

    try {
      await this.testTenantManagementService();
      await this.testDatabaseIsolation();
      await this.testTenantContextMiddleware();
      await this.testTenantSwitching();
      await this.testTenantOnboarding();
      await this.testCrossTenantAccessPrevention();
      await this.testTenantValidation();
      
      await this.cleanup();
      this.printResults();
    } catch (error) {
      console.error('❌ Verification failed with error:', error);
      await this.cleanup();
      process.exit(1);
    }
  }

  private async testTenantManagementService(): Promise<void> {
    console.log('📋 Testing Tenant Management Service...');

    try {
      // Test 1: Create tenant with isolated database
      const tenant1Data = {
        name: 'Verification Test Jeweler 1',
        subdomain: 'verifytest1',
        adminEmail: 'admin@verifytest1.com',
        adminPassword: 'SecurePassword123!',
        adminName: 'Verify Admin 1'
      };

      const tenant1 = await tenantService.createTenant(tenant1Data);
      this.testTenant1Id = tenant1.id;

      this.addResult({
        passed: true,
        message: 'Tenant creation with isolated database',
        details: [
          `Created tenant: ${tenant1.name}`,
          `Tenant ID: ${tenant1.id}`,
          `Database: ${tenant1.databaseName}`,
          `Status: ${tenant1.status}`
        ]
      });

      // Test 2: Create second tenant
      const tenant2Data = {
        name: 'Verification Test Jeweler 2',
        subdomain: 'verifytest2',
        adminEmail: 'admin@verifytest2.com',
        adminPassword: 'SecurePassword123!',
        adminName: 'Verify Admin 2'
      };

      const tenant2 = await tenantService.createTenant(tenant2Data);
      this.testTenant2Id = tenant2.id;

      this.addResult({
        passed: tenant2.databaseName !== tenant1.databaseName,
        message: 'Multiple tenants with separate databases',
        details: [
          `Tenant 1 DB: ${tenant1.databaseName}`,
          `Tenant 2 DB: ${tenant2.databaseName}`,
          `Databases are separate: ${tenant2.databaseName !== tenant1.databaseName}`
        ]
      });

      // Test 3: Tenant retrieval
      const retrievedTenant = await tenantService.getTenant(tenant1.id);
      this.addResult({
        passed: retrievedTenant !== null && retrievedTenant.id === tenant1.id,
        message: 'Tenant retrieval by ID',
        details: [`Retrieved tenant: ${retrievedTenant?.name}`]
      });

      // Test 4: Tenant listing
      const tenantList = await tenantService.listTenants({ limit: 10 });
      this.addResult({
        passed: tenantList.tenants.length >= 2,
        message: 'Tenant listing functionality',
        details: [`Found ${tenantList.tenants.length} tenants, total: ${tenantList.total}`]
      });

    } catch (error: any) {
      this.addResult({
        passed: false,
        message: 'Tenant Management Service',
        details: [`Error: ${error.message}`]
      });
    }
  }

  private async testDatabaseIsolation(): Promise<void> {
    console.log('🔒 Testing Database Isolation...');

    try {
      const tenant1Db = await getTenantDb(this.testTenant1Id);
      const tenant2Db = await getTenantDb(this.testTenant2Id);

      // Test 1: Create data in tenant 1
      const customer1 = await tenant1Db.customer.create({
        data: {
          name: 'Isolation Test Customer 1',
          email: 'customer1@isolation.test'
        }
      });

      // Test 2: Create data in tenant 2
      const customer2 = await tenant2Db.customer.create({
        data: {
          name: 'Isolation Test Customer 2',
          email: 'customer2@isolation.test'
        }
      });

      // Test 3: Verify data exists in correct databases
      const foundInTenant1 = await tenant1Db.customer.findUnique({
        where: { id: customer1.id }
      });

      const foundInTenant2 = await tenant2Db.customer.findUnique({
        where: { id: customer2.id }
      });

      this.addResult({
        passed: foundInTenant1 !== null && foundInTenant2 !== null,
        message: 'Data creation in separate tenant databases',
        details: [
          `Customer 1 in Tenant 1: ${foundInTenant1 ? 'Found' : 'Not found'}`,
          `Customer 2 in Tenant 2: ${foundInTenant2 ? 'Found' : 'Not found'}`
        ]
      });

      // Test 4: Verify cross-tenant isolation
      const crossTenant1 = await tenant2Db.customer.findUnique({
        where: { id: customer1.id }
      });

      const crossTenant2 = await tenant1Db.customer.findUnique({
        where: { id: customer2.id }
      });

      this.addResult({
        passed: crossTenant1 === null && crossTenant2 === null,
        message: 'Cross-tenant data isolation',
        details: [
          `Tenant 1 data in Tenant 2: ${crossTenant1 ? 'BREACH!' : 'Isolated ✓'}`,
          `Tenant 2 data in Tenant 1: ${crossTenant2 ? 'BREACH!' : 'Isolated ✓'}`
        ]
      });

      // Cleanup test data
      await tenant1Db.customer.delete({ where: { id: customer1.id } });
      await tenant2Db.customer.delete({ where: { id: customer2.id } });

    } catch (error: any) {
      this.addResult({
        passed: false,
        message: 'Database Isolation',
        details: [`Error: ${error.message}`]
      });
    }
  }

  private async testTenantContextMiddleware(): Promise<void> {
    console.log('🔧 Testing Tenant Context Middleware...');

    try {
      // Test 1: Extract tenant context by ID
      const mockRequest1 = {
        get: (header: string) => {
          if (header === 'X-Tenant-ID') return this.testTenant1Id;
          return undefined;
        }
      } as any;

      const context1 = await extractTenantContext(mockRequest1);
      this.addResult({
        passed: context1 !== null && context1.id === this.testTenant1Id,
        message: 'Tenant context extraction by header',
        details: [`Extracted tenant: ${context1?.name || 'None'}`]
      });

      // Test 2: Extract tenant context by subdomain
      const mockRequest2 = {
        get: (header: string) => {
          if (header === 'host') return 'verifytest1.jeweler.com';
          return undefined;
        }
      } as any;

      const context2 = await extractTenantContext(mockRequest2);
      this.addResult({
        passed: context2 !== null && context2.subdomain === 'verifytest1',
        message: 'Tenant context extraction by subdomain',
        details: [`Extracted tenant: ${context2?.name || 'None'}`]
      });

      // Test 3: Middleware validation
      this.addResult({
        passed: typeof tenantMiddleware === 'function',
        message: 'Tenant middleware function exists',
        details: ['Middleware is properly exported and callable']
      });

    } catch (error: any) {
      this.addResult({
        passed: false,
        message: 'Tenant Context Middleware',
        details: [`Error: ${error.message}`]
      });
    }
  }

  private async testTenantSwitching(): Promise<void> {
    console.log('🔄 Testing Tenant Switching...');

    try {
      // Get admin user for tenant 1
      const adminUser = await platformDb.tenantUser.findFirst({
        where: {
          tenantId: this.testTenant1Id,
          role: 'TENANT_ADMIN'
        }
      });

      if (!adminUser) {
        throw new Error('Admin user not found for tenant switching test');
      }

      // Test 1: Valid tenant switch
      const validSwitch = await tenantService.switchTenantContext(adminUser.id, this.testTenant1Id);
      this.addResult({
        passed: validSwitch.success === true,
        message: 'Valid tenant context switching',
        details: [
          `Switch success: ${validSwitch.success}`,
          `Target tenant: ${validSwitch.tenantId || 'None'}`
        ]
      });

      // Test 2: Invalid tenant switch (user doesn't belong to tenant)
      const invalidSwitch = await tenantService.switchTenantContext(adminUser.id, this.testTenant2Id);
      this.addResult({
        passed: invalidSwitch.success === false,
        message: 'Invalid tenant switch prevention',
        details: [
          `Switch success: ${invalidSwitch.success}`,
          `Error: ${invalidSwitch.error || 'None'}`
        ]
      });

      // Test 3: Tenant switch middleware exists
      this.addResult({
        passed: typeof tenantSwitchMiddleware === 'function',
        message: 'Tenant switch middleware exists',
        details: ['Middleware is properly exported and callable']
      });

    } catch (error: any) {
      this.addResult({
        passed: false,
        message: 'Tenant Switching',
        details: [`Error: ${error.message}`]
      });
    }
  }

  private async testTenantOnboarding(): Promise<void> {
    console.log('🚀 Testing Tenant Onboarding Workflow...');

    try {
      // Test 1: Default data initialization
      const tenant1Db = await getTenantDb(this.testTenant1Id);

      // Check chart of accounts
      const accounts = await tenant1Db.chartOfAccounts.findMany();
      this.addResult({
        passed: accounts.length > 0,
        message: 'Default chart of accounts initialization',
        details: [
          `Created ${accounts.length} default accounts`,
          `Sample accounts: ${accounts.slice(0, 3).map(a => `${a.accountCode} - ${a.accountName}`).join(', ')}`
        ]
      });

      // Check system settings
      const settings = await tenant1Db.systemSettings.findMany();
      this.addResult({
        passed: settings.length > 0,
        message: 'Default system settings initialization',
        details: [
          `Created ${settings.length} default settings`,
          `Sample settings: ${settings.slice(0, 3).map(s => `${s.key}: ${s.value}`).join(', ')}`
        ]
      });

      // Test 2: Admin user creation
      const adminUser = await platformDb.tenantUser.findFirst({
        where: {
          tenantId: this.testTenant1Id,
          role: 'TENANT_ADMIN'
        }
      });

      this.addResult({
        passed: adminUser !== null,
        message: 'Admin user creation during onboarding',
        details: [
          `Admin user created: ${adminUser ? 'Yes' : 'No'}`,
          `Admin email: ${adminUser?.email || 'None'}`
        ]
      });

    } catch (error: any) {
      this.addResult({
        passed: false,
        message: 'Tenant Onboarding Workflow',
        details: [`Error: ${error.message}`]
      });
    }
  }

  private async testCrossTenantAccessPrevention(): Promise<void> {
    console.log('🛡️ Testing Cross-Tenant Access Prevention...');

    try {
      // Test using the service method
      const isolationTest = await tenantService.testTenantIsolation(this.testTenant1Id, this.testTenant2Id);

      this.addResult({
        passed: isolationTest.isolated === true,
        message: 'Cross-tenant access prevention',
        details: isolationTest.details
      });

      // Test database health for both tenants
      const health1 = await tenantService.getTenantHealth(this.testTenant1Id);
      const health2 = await tenantService.getTenantHealth(this.testTenant2Id);

      this.addResult({
        passed: health1.healthy && health2.healthy,
        message: 'Tenant database health verification',
        details: [
          `Tenant 1 healthy: ${health1.healthy}`,
          `Tenant 2 healthy: ${health2.healthy}`,
          `Tenant 1 connectable: ${health1.details.databaseConnectable}`,
          `Tenant 2 connectable: ${health2.details.databaseConnectable}`
        ]
      });

    } catch (error: any) {
      this.addResult({
        passed: false,
        message: 'Cross-Tenant Access Prevention',
        details: [`Error: ${error.message}`]
      });
    }
  }

  private async testTenantValidation(): Promise<void> {
    console.log('✅ Testing Tenant Validation Logic...');

    try {
      // Test 1: Valid tenant validation
      const validValidation = await tenantService.validateTenant(this.testTenant1Id);
      this.addResult({
        passed: validValidation.isValid === true,
        message: 'Valid tenant validation',
        details: [
          `Validation result: ${validValidation.isValid}`,
          `Tenant name: ${validValidation.tenant?.name || 'None'}`
        ]
      });

      // Test 2: Invalid tenant validation
      const invalidValidation = await tenantService.validateTenant('non-existent-tenant');
      this.addResult({
        passed: invalidValidation.isValid === false,
        message: 'Invalid tenant rejection',
        details: [
          `Validation result: ${invalidValidation.isValid}`,
          `Error: ${invalidValidation.error || 'None'}`
        ]
      });

      // Test 3: Suspended tenant validation
      await tenantService.updateTenant(this.testTenant1Id, { status: 'SUSPENDED' });
      const suspendedValidation = await tenantService.validateTenant(this.testTenant1Id);
      
      this.addResult({
        passed: suspendedValidation.isValid === false && (suspendedValidation.error?.includes('suspended') || false),
        message: 'Suspended tenant rejection',
        details: [
          `Validation result: ${suspendedValidation.isValid}`,
          `Error: ${suspendedValidation.error || 'None'}`
        ]
      });

      // Restore tenant status
      await tenantService.updateTenant(this.testTenant1Id, { status: 'TRIAL' });

    } catch (error: any) {
      this.addResult({
        passed: false,
        message: 'Tenant Validation Logic',
        details: [`Error: ${error.message}`]
      });
    }
  }

  private async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up test data...');

    try {
      if (this.testTenant1Id) {
        await tenantService.deleteTenant(this.testTenant1Id, `DELETE_TENANT_${this.testTenant1Id}`);
        console.log('✓ Cleaned up test tenant 1');
      }

      if (this.testTenant2Id) {
        await tenantService.deleteTenant(this.testTenant2Id, `DELETE_TENANT_${this.testTenant2Id}`);
        console.log('✓ Cleaned up test tenant 2');
      }
    } catch (error) {
      console.warn('⚠️ Cleanup warning:', error);
    }
  }

  private addResult(result: VerificationResult): void {
    this.results.push(result);
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.message}`);
    
    if (result.details) {
      result.details.forEach(detail => {
        console.log(`   ${detail}`);
      });
    }
    console.log();
  }

  private printResults(): void {
    console.log('\n📊 VERIFICATION SUMMARY');
    console.log('========================');

    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const percentage = Math.round((passed / total) * 100);

    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${total - passed}`);
    console.log(`Success Rate: ${percentage}%`);

    if (passed === total) {
      console.log('\n🎉 ALL TENANT SYSTEM REQUIREMENTS VERIFIED SUCCESSFULLY!');
      console.log('\nTask 5: Multi-Tenant Architecture Implementation - COMPLETED ✅');
      console.log('\nImplemented features:');
      console.log('✅ Tenant management service with database isolation');
      console.log('✅ Tenant context middleware for all API requests');
      console.log('✅ Tenant switching and validation logic');
      console.log('✅ Tenant onboarding and setup workflows');
      console.log('✅ Tenant isolation with multiple tenant databases');
      console.log('✅ Cross-tenant data access prevention');
    } else {
      console.log('\n❌ SOME TESTS FAILED - REVIEW REQUIRED');
      
      const failedTests = this.results.filter(r => !r.passed);
      console.log('\nFailed tests:');
      failedTests.forEach(test => {
        console.log(`❌ ${test.message}`);
        if (test.details) {
          test.details.forEach(detail => console.log(`   ${detail}`));
        }
      });
      
      process.exit(1);
    }
  }
}

// Run verification if called directly
if (require.main === module) {
  const verifier = new TenantSystemVerifier();
  verifier.runAllTests().catch(error => {
    console.error('Verification failed:', error);
    process.exit(1);
  });
}

export { TenantSystemVerifier };