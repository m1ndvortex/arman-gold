import { PrismaClient } from '@prisma/client';
import { platformDb, getTenantDb, generateTenantDatabaseName, createTenantDatabase } from './connection';
import { initializeTenantDatabase } from './tenant-migrations';
import bcrypt from 'bcryptjs';

/**
 * Seed platform database with initial data
 */
export async function seedPlatformDatabase() {
  console.log('🌱 Seeding platform database...');

  try {
    // Create demo tenants
    const demoTenants = [
      {
        id: 'demo-tenant-1',
        name: 'طلافروشی طلای نو',
        subdomain: 'talanou',
        status: 'ACTIVE' as const
      },
      {
        id: 'demo-tenant-2', 
        name: 'جواهرات آریا',
        subdomain: 'arya-jewelry',
        status: 'TRIAL' as const
      }
    ];

    for (const tenantData of demoTenants) {
      const databaseName = generateTenantDatabaseName(tenantData.name, tenantData.id);
      
      // Check if tenant already exists
      const existingTenant = await platformDb.tenant.findUnique({
        where: { id: tenantData.id }
      });

      if (!existingTenant) {
        const tenant = await platformDb.tenant.create({
          data: {
            ...tenantData,
            databaseName
          }
        });
        console.log(`✅ Created tenant: ${tenant.name} (${tenant.subdomain})`);

        // Create tenant admin user
        const hashedPassword = await bcrypt.hash('admin123', 12);
        const adminUser = await platformDb.tenantUser.create({
          data: {
            tenantId: tenant.id,
            email: `admin@${tenant.subdomain}.com`,
            passwordHash: hashedPassword,
            role: 'TENANT_ADMIN'
          }
        });
        console.log(`✅ Created admin user: ${adminUser.email}`);

        // Create employee user
        const employeeUser = await platformDb.tenantUser.create({
          data: {
            tenantId: tenant.id,
            email: `employee@${tenant.subdomain}.com`,
            passwordHash: hashedPassword,
            role: 'EMPLOYEE'
          }
        });
        console.log(`✅ Created employee user: ${employeeUser.email}`);

        // Initialize tenant database
        await initializeTenantDatabase(tenant.id, databaseName);
        console.log(`✅ Initialized tenant database: ${databaseName}`);
      } else {
        console.log(`⏭️  Tenant already exists: ${tenantData.name}`);
      }
    }

    console.log('✅ Platform database seeding completed\n');
  } catch (error) {
    console.error('❌ Platform database seeding failed:', error);
    throw error;
  }
}

/**
 * Seed tenant database with sample business data
 */
export async function seedTenantDatabase(tenantId: string) {
  console.log(`🌱 Seeding tenant database: ${tenantId}...`);

  try {
    const tenantDb = await getTenantDb(tenantId);

    // 1. Seed Chart of Accounts
    const accounts = [
      // Assets
      { code: '1001', name: 'نقد در صندوق', type: 'ASSET' as const },
      { code: '1002', name: 'حساب جاری بانک', type: 'ASSET' as const },
      { code: '1003', name: 'موجودی طلا', type: 'ASSET' as const },
      { code: '1004', name: 'موجودی جواهرات', type: 'ASSET' as const },
      { code: '1005', name: 'حسابهای دریافتنی', type: 'ASSET' as const },
      
      // Liabilities
      { code: '2001', name: 'حسابهای پرداختنی', type: 'LIABILITY' as const },
      { code: '2002', name: 'مالیات بر ارزش افزوده', type: 'LIABILITY' as const },
      
      // Equity
      { code: '3001', name: 'سرمایه', type: 'EQUITY' as const },
      { code: '3002', name: 'سود انباشته', type: 'EQUITY' as const },
      
      // Revenue
      { code: '4001', name: 'فروش طلا', type: 'REVENUE' as const },
      { code: '4002', name: 'فروش جواهرات', type: 'REVENUE' as const },
      { code: '4003', name: 'درآمد ساخت', type: 'REVENUE' as const },
      
      // Expenses
      { code: '5001', name: 'خرید طلا', type: 'EXPENSE' as const },
      { code: '5002', name: 'هزینه ساخت', type: 'EXPENSE' as const },
      { code: '5003', name: 'هزینه اجاره', type: 'EXPENSE' as const },
      { code: '5004', name: 'حقوق و دستمزد', type: 'EXPENSE' as const }
    ];

    for (const account of accounts) {
      await tenantDb.chartOfAccounts.upsert({
        where: { accountCode: account.code },
        update: {},
        create: {
          accountCode: account.code,
          accountName: account.name,
          accountType: account.type
        }
      });
    }
    console.log(`✅ Created ${accounts.length} chart of accounts`);

    // 2. Seed Customers
    const customers = [
      {
        name: 'احمد رضایی',
        phone: '09121234567',
        email: 'ahmad.rezaei@email.com',
        address: 'تهران، خیابان ولیعصر، پلاک 123',
        creditLimit: 50000000,
        customerGroup: 'VIP'
      },
      {
        name: 'فاطمه احمدی',
        phone: '09129876543',
        email: 'fatemeh.ahmadi@email.com',
        address: 'اصفهان، خیابان چهارباغ، پلاک 456',
        creditLimit: 20000000,
        customerGroup: 'عادی'
      },
      {
        name: 'محمد کریمی',
        phone: '09135555555',
        email: 'mohammad.karimi@email.com',
        address: 'شیراز، خیابان زند، پلاک 789',
        creditLimit: 30000000,
        customerGroup: 'عمده فروش'
      }
    ];

    const createdCustomers = [];
    for (const customer of customers) {
      const created = await tenantDb.customer.create({
        data: customer
      });
      createdCustomers.push(created);
    }
    console.log(`✅ Created ${customers.length} customers`);

    // 3. Seed Products
    const products = [
      {
        name: 'طلای خام 18 عیار',
        category: 'RAW_GOLD' as const,
        weight: 100.0,
        purity: 18,
        currentStock: 50,
        minimumStock: 10,
        unitPrice: 3500000,
        supplier: 'تولیدی طلای پارس'
      },
      {
        name: 'حلقه ازدواج کلاسیک',
        category: 'FINISHED_JEWELRY' as const,
        weight: 5.5,
        purity: 18,
        currentStock: 25,
        minimumStock: 5,
        unitPrice: 8500000,
        description: 'حلقه ازدواج طلای 18 عیار با طراحی کلاسیک'
      },
      {
        name: 'سکه طلا یک گرمی',
        category: 'COINS' as const,
        weight: 1.0,
        purity: 24,
        currentStock: 100,
        minimumStock: 20,
        unitPrice: 4200000
      },
      {
        name: 'الماس یک قیراط',
        category: 'STONES' as const,
        currentStock: 5,
        minimumStock: 1,
        unitPrice: 150000000,
        description: 'الماس طبیعی یک قیراط با کیفیت VS1'
      },
      {
        name: 'گردنبند طلا با نگین',
        category: 'FINISHED_JEWELRY' as const,
        weight: 12.3,
        purity: 18,
        currentStock: 15,
        minimumStock: 3,
        unitPrice: 25000000,
        description: 'گردنبند طلای 18 عیار با نگین زیرکونیا'
      }
    ];

    const createdProducts = [];
    for (const product of products) {
      const created = await tenantDb.product.create({
        data: {
          ...product,
          barcode: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        }
      });
      createdProducts.push(created);
    }
    console.log(`✅ Created ${products.length} products`);

    // 4. Seed Sample Invoices
    const sampleInvoices = [
      {
        customerId: createdCustomers[0].id,
        type: 'SALE' as const,
        items: [
          {
            productId: createdProducts[1].id, // حلقه ازدواج
            quantity: 2,
            unitPrice: 8500000
          }
        ]
      },
      {
        customerId: createdCustomers[1].id,
        type: 'SALE' as const,
        items: [
          {
            productId: createdProducts[2].id, // سکه طلا
            quantity: 5,
            unitPrice: 4200000
          }
        ]
      }
    ];

    for (let i = 0; i < sampleInvoices.length; i++) {
      const invoiceData = sampleInvoices[i];
      const subtotal = invoiceData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
      const taxAmount = subtotal * 0.09; // 9% VAT
      const totalAmount = subtotal + taxAmount;

      const invoice = await tenantDb.invoice.create({
        data: {
          invoiceNumber: `INV-${Date.now()}-${i + 1}`,
          customerId: invoiceData.customerId,
          type: invoiceData.type,
          subtotal,
          taxAmount,
          totalAmount,
          status: 'PAID',
          createdBy: 'seed-script',
          items: {
            create: invoiceData.items.map(item => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineTotal: item.quantity * item.unitPrice
            }))
          },
          payments: {
            create: {
              type: 'CASH',
              amount: totalAmount,
              status: 'CLEARED'
            }
          }
        }
      });
      
      // Update product stock
      for (const item of invoiceData.items) {
        await tenantDb.product.update({
          where: { id: item.productId },
          data: {
            currentStock: {
              decrement: item.quantity
            }
          }
        });

        // Create stock movement record
        await tenantDb.stockMovement.create({
          data: {
            productId: item.productId,
            type: 'OUT',
            quantity: -item.quantity,
            reason: 'فروش',
            referenceType: 'invoice',
            referenceId: invoice.id,
            createdBy: 'seed-script'
          }
        });
      }
    }
    console.log(`✅ Created ${sampleInvoices.length} sample invoices`);

    // 5. Seed Bank Accounts
    const bankAccounts = [
      {
        accountName: 'حساب جاری ملی',
        accountNumber: '123456789',
        bankName: 'بانک ملی ایران',
        currentBalance: 500000000
      },
      {
        accountName: 'حساب پس انداز پاسارگاد',
        accountNumber: '987654321',
        bankName: 'بانک پاسارگاد',
        currentBalance: 200000000
      }
    ];

    for (const account of bankAccounts) {
      await tenantDb.bankAccount.create({
        data: account
      });
    }
    console.log(`✅ Created ${bankAccounts.length} bank accounts`);

    // 6. Seed System Settings
    const systemSettings = [
      { key: 'business_name', value: 'طلافروشی نمونه', description: 'نام کسب و کار' },
      { key: 'vat_rate', value: '0.09', description: 'نرخ مالیات بر ارزش افزوده' },
      { key: 'gold_price_18k', value: '3500000', description: 'قیمت طلای 18 عیار (ریال)' },
      { key: 'gold_price_24k', value: '4200000', description: 'قیمت طلای 24 عیار (ریال)' },
      { key: 'manufacturing_fee_rate', value: '0.15', description: 'نرخ اجرت ساخت' },
      { key: 'profit_margin_rate', value: '0.20', description: 'نرخ سود' },
      { key: 'currency', value: 'IRR', description: 'واحد پول' },
      { key: 'invoice_prefix', value: 'INV', description: 'پیشوند شماره فاکتور' }
    ];

    for (const setting of systemSettings) {
      await tenantDb.systemSettings.upsert({
        where: { key: setting.key },
        update: { value: setting.value },
        create: {
          ...setting,
          updatedBy: 'seed-script'
        }
      });
    }
    console.log(`✅ Created ${systemSettings.length} system settings`);

    console.log(`✅ Tenant database seeding completed for: ${tenantId}\n`);
  } catch (error) {
    console.error(`❌ Tenant database seeding failed for ${tenantId}:`, error);
    throw error;
  }
}

/**
 * Seed all tenant databases
 */
export async function seedAllTenantDatabases() {
  console.log('🌱 Seeding all tenant databases...');

  try {
    const tenants = await platformDb.tenant.findMany({
      where: {
        status: {
          in: ['ACTIVE', 'TRIAL']
        }
      }
    });

    for (const tenant of tenants) {
      await seedTenantDatabase(tenant.id);
    }

    console.log(`✅ Completed seeding ${tenants.length} tenant databases`);
  } catch (error) {
    console.error('❌ Failed to seed tenant databases:', error);
    throw error;
  }
}

/**
 * Main seeding function
 */
export async function runAllSeeds() {
  console.log('🌱 Starting database seeding...\n');

  try {
    // Seed platform database
    await seedPlatformDatabase();

    // Seed all tenant databases
    await seedAllTenantDatabases();

    console.log('🎉 All database seeding completed successfully!');
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    throw error;
  }
}

/**
 * Clear all seed data (for testing)
 */
export async function clearSeedData() {
  console.log('🧹 Clearing seed data...');

  try {
    // Get all demo tenants
    const demoTenants = await platformDb.tenant.findMany({
      where: {
        id: {
          startsWith: 'demo-tenant-'
        }
      }
    });

    // Drop tenant databases and delete tenant records
    for (const tenant of demoTenants) {
      await platformDb.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${tenant.databaseName}\``);
      await platformDb.tenant.delete({
        where: { id: tenant.id }
      });
      console.log(`✅ Cleared tenant: ${tenant.name}`);
    }

    console.log('✅ Seed data cleared successfully');
  } catch (error) {
    console.error('❌ Failed to clear seed data:', error);
    throw error;
  }
}

// Run seeds if this file is executed directly
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'clear') {
    clearSeedData().then(() => process.exit(0)).catch(() => process.exit(1));
  } else {
    runAllSeeds().then(() => process.exit(0)).catch(() => process.exit(1));
  }
}