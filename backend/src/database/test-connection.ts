import { platformDb, getTenantDb, checkDatabaseHealth, generateTenantDatabaseName, createTenantDatabase } from './connection';
import { initializeTenantDatabase, verifyTenantDatabaseSchema } from './tenant-migrations';

/**
 * Test database connections and schema creation
 */
async function testDatabaseConnections() {
  console.log('🔍 Testing database connections and schema...\n');

  try {
    // Test 1: Platform database connection
    console.log('1. Testing platform database connection...');
    await platformDb.$queryRaw`SELECT 1 as test`;
    console.log('✅ Platform database connection successful\n');

    // Test 2: Check platform database schema
    console.log('2. Checking platform database schema...');
    const tenantCount = await platformDb.tenant.count();
    console.log(`✅ Platform database schema verified. Found ${tenantCount} tenants\n`);

    // Test 3: Create a test tenant
    console.log('3. Creating test tenant...');
    const testTenantId = `test-tenant-${Date.now()}`;
    const testDatabaseName = generateTenantDatabaseName('Test Jeweler', testTenantId);
    
    const testTenant = await platformDb.tenant.create({
      data: {
        id: testTenantId,
        name: 'Test Jeweler Store',
        subdomain: `test-${Date.now()}`,
        databaseName: testDatabaseName,
        status: 'TRIAL'
      }
    });
    console.log(`✅ Test tenant created: ${testTenant.name} (${testTenant.databaseName})\n`);

    // Test 4: Initialize tenant database
    console.log('4. Initializing tenant database...');
    await initializeTenantDatabase(testTenantId, testDatabaseName);
    console.log('✅ Tenant database initialized successfully\n');

    // Test 5: Test tenant database connection
    console.log('5. Testing tenant database connection...');
    const tenantDb = await getTenantDb(testTenantId);
    await tenantDb.$queryRaw`SELECT 1 as test`;
    console.log('✅ Tenant database connection successful\n');

    // Test 6: Verify tenant database schema
    console.log('6. Verifying tenant database schema...');
    const schemaValid = await verifyTenantDatabaseSchema(testTenantId);
    if (schemaValid) {
      console.log('✅ Tenant database schema verification passed\n');
    } else {
      throw new Error('Tenant database schema verification failed');
    }

    // Test 7: Test basic CRUD operations
    console.log('7. Testing basic CRUD operations...');
    
    // Create a test customer
    const testCustomer = await tenantDb.customer.create({
      data: {
        name: 'Test Customer',
        phone: '+98-912-345-6789',
        email: 'test@example.com',
        creditLimit: 1000000
      }
    });
    console.log(`✅ Created test customer: ${testCustomer.name} (ID: ${testCustomer.id})`);

    // Create a test product
    const testProduct = await tenantDb.product.create({
      data: {
        name: 'Test Gold Ring',
        category: 'FINISHED_JEWELRY',
        weight: 5.5,
        purity: 18,
        currentStock: 10,
        minimumStock: 2,
        unitPrice: 2500000
      }
    });
    console.log(`✅ Created test product: ${testProduct.name} (ID: ${testProduct.id})`);

    // Create a test invoice
    const testInvoice = await tenantDb.invoice.create({
      data: {
        invoiceNumber: `INV-${Date.now()}`,
        customerId: testCustomer.id,
        type: 'SALE',
        subtotal: 2500000,
        totalAmount: 2500000,
        createdBy: 'test-user',
        items: {
          create: {
            productId: testProduct.id,
            quantity: 1,
            unitPrice: 2500000,
            lineTotal: 2500000
          }
        }
      },
      include: {
        items: true
      }
    });
    console.log(`✅ Created test invoice: ${testInvoice.invoiceNumber} (ID: ${testInvoice.id})`);

    // Test chart of accounts
    const testAccount = await tenantDb.chartOfAccounts.create({
      data: {
        accountCode: '1001',
        accountName: 'Cash in Hand',
        accountType: 'ASSET'
      }
    });
    console.log(`✅ Created test account: ${testAccount.accountName} (${testAccount.accountCode})`);

    console.log('✅ All CRUD operations successful\n');

    // Test 8: Health check
    console.log('8. Running health check...');
    const healthStatus = await checkDatabaseHealth();
    console.log('Health Status:', healthStatus);
    
    if (healthStatus.platform && healthStatus.tenants[testTenantId]) {
      console.log('✅ Health check passed\n');
    } else {
      throw new Error('Health check failed');
    }

    // Test 9: Clean up test data
    console.log('9. Cleaning up test data...');
    await platformDb.tenant.delete({
      where: { id: testTenantId }
    });
    
    // Drop test database
    await platformDb.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${testDatabaseName}\``);
    console.log('✅ Test data cleaned up\n');

    console.log('🎉 All database tests passed successfully!');
    
  } catch (error) {
    console.error('❌ Database test failed:', error);
    throw error;
  }
}

/**
 * Test multi-tenant isolation
 */
async function testMultiTenantIsolation() {
  console.log('🔒 Testing multi-tenant isolation...\n');

  const tenant1Id = `tenant1-${Date.now()}`;
  const tenant2Id = `tenant2-${Date.now()}`;
  const db1Name = generateTenantDatabaseName('Tenant 1', tenant1Id);
  const db2Name = generateTenantDatabaseName('Tenant 2', tenant2Id);

  try {
    // Create two test tenants
    const tenant1 = await platformDb.tenant.create({
      data: {
        id: tenant1Id,
        name: 'Tenant 1 Jeweler',
        subdomain: `tenant1-${Date.now()}`,
        databaseName: db1Name,
        status: 'ACTIVE'
      }
    });

    const tenant2 = await platformDb.tenant.create({
      data: {
        id: tenant2Id,
        name: 'Tenant 2 Jeweler',
        subdomain: `tenant2-${Date.now()}`,
        databaseName: db2Name,
        status: 'ACTIVE'
      }
    });

    // Initialize both tenant databases
    await initializeTenantDatabase(tenant1Id, db1Name);
    await initializeTenantDatabase(tenant2Id, db2Name);

    // Get connections to both tenant databases
    const tenant1Db = await getTenantDb(tenant1Id);
    const tenant2Db = await getTenantDb(tenant2Id);

    // Create customers in each tenant
    const customer1 = await tenant1Db.customer.create({
      data: {
        name: 'Customer in Tenant 1',
        email: 'customer1@tenant1.com'
      }
    });

    const customer2 = await tenant2Db.customer.create({
      data: {
        name: 'Customer in Tenant 2',
        email: 'customer2@tenant2.com'
      }
    });

    // Verify isolation - tenant 1 should not see tenant 2's data
    const tenant1Customers = await tenant1Db.customer.findMany();
    const tenant2Customers = await tenant2Db.customer.findMany();

    if (tenant1Customers.length === 1 && tenant1Customers[0].id === customer1.id) {
      console.log('✅ Tenant 1 isolation verified - can only see own data');
    } else {
      throw new Error('Tenant 1 isolation failed');
    }

    if (tenant2Customers.length === 1 && tenant2Customers[0].id === customer2.id) {
      console.log('✅ Tenant 2 isolation verified - can only see own data');
    } else {
      throw new Error('Tenant 2 isolation failed');
    }

    // Clean up
    await platformDb.tenant.delete({ where: { id: tenant1Id } });
    await platformDb.tenant.delete({ where: { id: tenant2Id } });
    await platformDb.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${db1Name}\``);
    await platformDb.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${db2Name}\``);

    console.log('✅ Multi-tenant isolation test passed\n');

  } catch (error) {
    console.error('❌ Multi-tenant isolation test failed:', error);
    throw error;
  }
}

// Main test function
async function runAllTests() {
  try {
    await testDatabaseConnections();
    await testMultiTenantIsolation();
    
    console.log('\n🎉 All database tests completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database tests failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests();
}

export { testDatabaseConnections, testMultiTenantIsolation };