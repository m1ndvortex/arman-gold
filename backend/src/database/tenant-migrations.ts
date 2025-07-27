import { PrismaClient } from '@prisma/client';
import { platformDb, createTenantDatabase, getTenantDb } from './connection';

/**
 * SQL script for creating tenant-specific tables
 * This includes all business logic tables that are isolated per tenant
 */
const TENANT_SCHEMA_SQL = `
-- Tenant-specific business tables

CREATE TABLE IF NOT EXISTS customers (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    name VARCHAR(191) NOT NULL,
    phone VARCHAR(191) NULL,
    email VARCHAR(191) NULL,
    address TEXT NULL,
    tax_id VARCHAR(191) NULL,
    credit_limit DECIMAL(15, 2) NOT NULL DEFAULT 0,
    current_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    customer_group VARCHAR(191) NULL,
    tags TEXT NULL,
    birth_date DATE NULL,
    anniversary_date DATE NULL,
    communication_prefs TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_ledger (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    customer_id VARCHAR(191) NOT NULL,
    type ENUM('DEBIT', 'CREDIT') NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(191) NOT NULL DEFAULT 'IRR',
    description VARCHAR(191) NOT NULL,
    reference_type VARCHAR(191) NULL,
    reference_id VARCHAR(191) NULL,
    balance DECIMAL(15, 2) NOT NULL,
    entry_date DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    name VARCHAR(191) NOT NULL,
    category ENUM('RAW_GOLD', 'FINISHED_JEWELRY', 'COINS', 'STONES') NOT NULL,
    barcode VARCHAR(191) NULL UNIQUE,
    weight DECIMAL(10, 4) NULL,
    purity DECIMAL(5, 2) NULL,
    current_stock INTEGER NOT NULL DEFAULT 0,
    minimum_stock INTEGER NOT NULL DEFAULT 0,
    unit_price DECIMAL(15, 2) NOT NULL,
    supplier VARCHAR(191) NULL,
    location VARCHAR(191) NULL,
    description TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_stock_movement DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bom_components (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    parent_product_id VARCHAR(191) NOT NULL,
    component_id VARCHAR(191) NOT NULL,
    quantity DECIMAL(10, 4) NOT NULL,
    wastage_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY unique_parent_component (parent_product_id, component_id),
    FOREIGN KEY (parent_product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (component_id) REFERENCES products(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stock_movements (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    product_id VARCHAR(191) NOT NULL,
    type ENUM('IN', 'OUT', 'ADJUSTMENT') NOT NULL,
    quantity INTEGER NOT NULL,
    reason VARCHAR(191) NOT NULL,
    reference_type VARCHAR(191) NULL,
    reference_id VARCHAR(191) NULL,
    notes TEXT NULL,
    created_by VARCHAR(191) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoices (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    invoice_number VARCHAR(191) NOT NULL UNIQUE,
    customer_id VARCHAR(191) NULL,
    type ENUM('SALE', 'PURCHASE', 'TRADE') NOT NULL,
    subtotal DECIMAL(15, 2) NOT NULL,
    tax_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(15, 2) NOT NULL,
    gold_price DECIMAL(15, 2) NULL,
    manufacturing_fee DECIMAL(15, 2) NULL,
    profit_margin DECIMAL(5, 2) NULL,
    status ENUM('DRAFT', 'SENT', 'PAID', 'CANCELLED', 'OVERDUE') NOT NULL DEFAULT 'DRAFT',
    notes TEXT NULL,
    attachments TEXT NULL,
    is_recurring BOOLEAN NOT NULL DEFAULT false,
    recurring_schedule TEXT NULL,
    due_date DATE NULL,
    paid_at DATETIME(3) NULL,
    created_by VARCHAR(191) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoice_items (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    invoice_id VARCHAR(191) NOT NULL,
    product_id VARCHAR(191) NOT NULL,
    quantity DECIMAL(10, 4) NOT NULL,
    weight DECIMAL(10, 4) NULL,
    unit_price DECIMAL(15, 2) NOT NULL,
    gold_price DECIMAL(15, 2) NULL,
    manufacturing_fee DECIMAL(15, 2) NULL,
    line_total DECIMAL(15, 2) NOT NULL,
    notes TEXT NULL,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    invoice_id VARCHAR(191) NOT NULL,
    type ENUM('CASH', 'CARD', 'CHEQUE', 'CREDIT', 'BANK_TRANSFER') NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(191) NOT NULL DEFAULT 'IRR',
    reference VARCHAR(191) NULL,
    status ENUM('PENDING', 'CLEARED', 'BOUNCED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    due_date DATE NULL,
    cleared_at DATETIME(3) NULL,
    notes TEXT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    account_code VARCHAR(191) NOT NULL UNIQUE,
    account_name VARCHAR(191) NOT NULL,
    account_type ENUM('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE') NOT NULL,
    parent_account_id VARCHAR(191) NULL,
    current_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    currency VARCHAR(191) NOT NULL DEFAULT 'IRR',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY (parent_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS journal_entries (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    entry_number VARCHAR(191) NOT NULL UNIQUE,
    description VARCHAR(191) NOT NULL,
    entry_date DATE NOT NULL,
    reference_type VARCHAR(191) NULL,
    reference_id VARCHAR(191) NULL,
    total_debit DECIMAL(15, 2) NOT NULL,
    total_credit DECIMAL(15, 2) NOT NULL,
    status ENUM('DRAFT', 'POSTED', 'LOCKED') NOT NULL DEFAULT 'DRAFT',
    cost_center VARCHAR(191) NULL,
    created_by VARCHAR(191) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS journal_line_items (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    journal_entry_id VARCHAR(191) NOT NULL,
    account_id VARCHAR(191) NOT NULL,
    debit_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    credit_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    description VARCHAR(191) NOT NULL,
    cost_center VARCHAR(191) NULL,
    FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bank_accounts (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    account_name VARCHAR(191) NOT NULL,
    account_number VARCHAR(191) NOT NULL,
    bank_name VARCHAR(191) NOT NULL,
    currency VARCHAR(191) NOT NULL DEFAULT 'IRR',
    current_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bank_statements (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    bank_account_id VARCHAR(191) NOT NULL,
    transaction_date DATE NOT NULL,
    description VARCHAR(191) NOT NULL,
    debit_amount DECIMAL(15, 2) NULL,
    credit_amount DECIMAL(15, 2) NULL,
    balance DECIMAL(15, 2) NOT NULL,
    reference VARCHAR(191) NULL,
    is_reconciled BOOLEAN NOT NULL DEFAULT false,
    reconciled_with VARCHAR(191) NULL,
    imported_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_settings (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    \`key\` VARCHAR(191) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description VARCHAR(191) NULL,
    updated_by VARCHAR(191) NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    user_id VARCHAR(191) NOT NULL,
    action VARCHAR(191) NOT NULL,
    entity_type VARCHAR(191) NOT NULL,
    entity_id VARCHAR(191) NULL,
    old_values TEXT NULL,
    new_values TEXT NULL,
    ip_address VARCHAR(191) NULL,
    user_agent VARCHAR(191) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create indexes for better performance
CREATE INDEX idx_customer_ledger_customer_id ON customer_ledger(customer_id);
CREATE INDEX idx_customer_ledger_entry_date ON customer_ledger(entry_date);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_created_at ON stock_movements(created_at);
CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_created_at ON invoices(created_at);
CREATE INDEX idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX idx_invoice_items_product_id ON invoice_items(product_id);
CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_journal_entries_entry_date ON journal_entries(entry_date);
CREATE INDEX idx_journal_entries_status ON journal_entries(status);
CREATE INDEX idx_journal_line_items_journal_entry_id ON journal_line_items(journal_entry_id);
CREATE INDEX idx_journal_line_items_account_id ON journal_line_items(account_id);
CREATE INDEX idx_bank_statements_bank_account_id ON bank_statements(bank_account_id);
CREATE INDEX idx_bank_statements_transaction_date ON bank_statements(transaction_date);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
`;

/**
 * Create and initialize a new tenant database with schema
 */
export async function initializeTenantDatabase(tenantId: string, databaseName: string): Promise<void> {
  try {
    console.log(`Initializing tenant database: ${databaseName}`);

    // Create the database
    await createTenantDatabase(tenantId, databaseName);

    // Get tenant database connection
    const tenantDb = await getTenantDb(tenantId);

    // Execute the schema creation SQL
    const sqlStatements = TENANT_SCHEMA_SQL.split(';').filter(stmt => stmt.trim());
    
    for (const statement of sqlStatements) {
      if (statement.trim()) {
        await tenantDb.$executeRawUnsafe(statement);
      }
    }

    console.log(`Successfully initialized tenant database: ${databaseName}`);
  } catch (error) {
    console.error(`Failed to initialize tenant database ${databaseName}:`, error);
    throw error;
  }
}

/**
 * Migrate an existing tenant database to the latest schema
 */
export async function migrateTenantDatabase(tenantId: string): Promise<void> {
  try {
    console.log(`Migrating tenant database for tenant: ${tenantId}`);

    const tenantDb = await getTenantDb(tenantId);

    // Check if migration tracking table exists
    await tenantDb.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS _tenant_migrations (
        id VARCHAR(191) NOT NULL PRIMARY KEY,
        migration_name VARCHAR(191) NOT NULL,
        applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    // Check if initial schema migration has been applied
    const existingMigration = await tenantDb.$queryRawUnsafe(`
      SELECT * FROM _tenant_migrations WHERE migration_name = 'initial_schema'
    `);

    if (!existingMigration || (existingMigration as any[]).length === 0) {
      // Apply initial schema
      const sqlStatements = TENANT_SCHEMA_SQL.split(';').filter(stmt => stmt.trim());
      
      for (const statement of sqlStatements) {
        if (statement.trim()) {
          await tenantDb.$executeRawUnsafe(statement);
        }
      }

      // Record migration
      await tenantDb.$executeRawUnsafe(`
        INSERT INTO _tenant_migrations (id, migration_name) 
        VALUES ('${Date.now()}', 'initial_schema')
      `);

      console.log(`Applied initial schema migration for tenant: ${tenantId}`);
    } else {
      console.log(`Tenant database already up to date: ${tenantId}`);
    }
  } catch (error) {
    console.error(`Failed to migrate tenant database for ${tenantId}:`, error);
    throw error;
  }
}

/**
 * Get all tenants and ensure their databases are properly migrated
 */
export async function migrateAllTenantDatabases(): Promise<void> {
  try {
    console.log('Starting migration for all tenant databases...');

    const tenants = await platformDb.tenant.findMany({
      where: {
        status: {
          in: ['ACTIVE', 'TRIAL']
        }
      }
    });

    for (const tenant of tenants) {
      try {
        await migrateTenantDatabase(tenant.id);
        console.log(`✓ Migrated tenant database: ${tenant.name} (${tenant.databaseName})`);
      } catch (error) {
        console.error(`✗ Failed to migrate tenant database: ${tenant.name} (${tenant.databaseName})`, error);
      }
    }

    console.log(`Completed migration for ${tenants.length} tenant databases`);
  } catch (error) {
    console.error('Failed to migrate tenant databases:', error);
    throw error;
  }
}

/**
 * Verify tenant database schema integrity
 */
export async function verifyTenantDatabaseSchema(tenantId: string): Promise<boolean> {
  try {
    const tenantDb = await getTenantDb(tenantId);

    // Check if all required tables exist
    const requiredTables = [
      'customers', 'customer_ledger', 'products', 'bom_components',
      'stock_movements', 'invoices', 'invoice_items', 'payments',
      'chart_of_accounts', 'journal_entries', 'journal_line_items',
      'bank_accounts', 'bank_statements', 'system_settings', 'audit_logs'
    ];

    for (const tableName of requiredTables) {
      const result = await tenantDb.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM information_schema.tables 
        WHERE table_schema = DATABASE() AND table_name = '${tableName}'
      `);

      if ((result as any[])[0].count === 0) {
        console.error(`Missing table in tenant database: ${tableName}`);
        return false;
      }
    }

    console.log(`✓ Tenant database schema verification passed for tenant: ${tenantId}`);
    return true;
  } catch (error) {
    console.error(`Tenant database schema verification failed for ${tenantId}:`, error);
    return false;
  }
}