-- CreateTable
CREATE TABLE `tenants` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `subdomain` VARCHAR(191) NOT NULL,
    `database_name` VARCHAR(191) NOT NULL,
    `status` ENUM('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED') NOT NULL DEFAULT 'TRIAL',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tenants_subdomain_key`(`subdomain`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tenant_users` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'TENANT_ADMIN', 'EMPLOYEE') NOT NULL,
    `two_factor_enabled` BOOLEAN NOT NULL DEFAULT false,
    `two_factor_secret` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tenant_users_tenant_id_email_key`(`tenant_id`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `session_token` VARCHAR(191) NOT NULL,
    `device_info` VARCHAR(191) NULL,
    `ip_address` VARCHAR(191) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `user_sessions_session_token_key`(`session_token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customers` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `tax_id` VARCHAR(191) NULL,
    `credit_limit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `current_balance` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `customer_group` VARCHAR(191) NULL,
    `tags` TEXT NULL,
    `birth_date` DATE NULL,
    `anniversary_date` DATE NULL,
    `communication_prefs` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_ledger` (
    `id` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `type` ENUM('DEBIT', 'CREDIT') NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'IRR',
    `description` VARCHAR(191) NOT NULL,
    `reference_type` VARCHAR(191) NULL,
    `reference_id` VARCHAR(191) NULL,
    `balance` DECIMAL(15, 2) NOT NULL,
    `entry_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` ENUM('RAW_GOLD', 'FINISHED_JEWELRY', 'COINS', 'STONES') NOT NULL,
    `barcode` VARCHAR(191) NULL,
    `weight` DECIMAL(10, 4) NULL,
    `purity` DECIMAL(5, 2) NULL,
    `current_stock` INTEGER NOT NULL DEFAULT 0,
    `minimum_stock` INTEGER NOT NULL DEFAULT 0,
    `unit_price` DECIMAL(15, 2) NOT NULL,
    `supplier` VARCHAR(191) NULL,
    `location` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_stock_movement` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `products_barcode_key`(`barcode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bom_components` (
    `id` VARCHAR(191) NOT NULL,
    `parent_product_id` VARCHAR(191) NOT NULL,
    `component_id` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(10, 4) NOT NULL,
    `wastage_percentage` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `bom_components_parent_product_id_component_id_key`(`parent_product_id`, `component_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_movements` (
    `id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `type` ENUM('IN', 'OUT', 'ADJUSTMENT') NOT NULL,
    `quantity` INTEGER NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `reference_type` VARCHAR(191) NULL,
    `reference_id` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoices` (
    `id` VARCHAR(191) NOT NULL,
    `invoice_number` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NULL,
    `type` ENUM('SALE', 'PURCHASE', 'TRADE') NOT NULL,
    `subtotal` DECIMAL(15, 2) NOT NULL,
    `tax_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(15, 2) NOT NULL,
    `gold_price` DECIMAL(15, 2) NULL,
    `manufacturing_fee` DECIMAL(15, 2) NULL,
    `profit_margin` DECIMAL(5, 2) NULL,
    `status` ENUM('DRAFT', 'SENT', 'PAID', 'CANCELLED', 'OVERDUE') NOT NULL DEFAULT 'DRAFT',
    `notes` TEXT NULL,
    `attachments` TEXT NULL,
    `is_recurring` BOOLEAN NOT NULL DEFAULT false,
    `recurring_schedule` TEXT NULL,
    `due_date` DATE NULL,
    `paid_at` DATETIME(3) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `invoices_invoice_number_key`(`invoice_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoice_items` (
    `id` VARCHAR(191) NOT NULL,
    `invoice_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(10, 4) NOT NULL,
    `weight` DECIMAL(10, 4) NULL,
    `unit_price` DECIMAL(15, 2) NOT NULL,
    `gold_price` DECIMAL(15, 2) NULL,
    `manufacturing_fee` DECIMAL(15, 2) NULL,
    `line_total` DECIMAL(15, 2) NOT NULL,
    `notes` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` VARCHAR(191) NOT NULL,
    `invoice_id` VARCHAR(191) NOT NULL,
    `type` ENUM('CASH', 'CARD', 'CHEQUE', 'CREDIT', 'BANK_TRANSFER') NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'IRR',
    `reference` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'CLEARED', 'BOUNCED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `due_date` DATE NULL,
    `cleared_at` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chart_of_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `account_code` VARCHAR(191) NOT NULL,
    `account_name` VARCHAR(191) NOT NULL,
    `account_type` ENUM('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE') NOT NULL,
    `parent_account_id` VARCHAR(191) NULL,
    `current_balance` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'IRR',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `chart_of_accounts_account_code_key`(`account_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `journal_entries` (
    `id` VARCHAR(191) NOT NULL,
    `entry_number` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `entry_date` DATE NOT NULL,
    `reference_type` VARCHAR(191) NULL,
    `reference_id` VARCHAR(191) NULL,
    `total_debit` DECIMAL(15, 2) NOT NULL,
    `total_credit` DECIMAL(15, 2) NOT NULL,
    `status` ENUM('DRAFT', 'POSTED', 'LOCKED') NOT NULL DEFAULT 'DRAFT',
    `cost_center` VARCHAR(191) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `journal_entries_entry_number_key`(`entry_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `journal_line_items` (
    `id` VARCHAR(191) NOT NULL,
    `journal_entry_id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `debit_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `credit_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `description` VARCHAR(191) NOT NULL,
    `cost_center` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bank_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `account_name` VARCHAR(191) NOT NULL,
    `account_number` VARCHAR(191) NOT NULL,
    `bank_name` VARCHAR(191) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'IRR',
    `current_balance` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bank_statements` (
    `id` VARCHAR(191) NOT NULL,
    `bank_account_id` VARCHAR(191) NOT NULL,
    `transaction_date` DATE NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `debit_amount` DECIMAL(15, 2) NULL,
    `credit_amount` DECIMAL(15, 2) NULL,
    `balance` DECIMAL(15, 2) NOT NULL,
    `reference` VARCHAR(191) NULL,
    `is_reconciled` BOOLEAN NOT NULL DEFAULT false,
    `reconciled_with` VARCHAR(191) NULL,
    `imported_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_settings` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `description` VARCHAR(191) NULL,
    `updated_by` VARCHAR(191) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `system_settings_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `entity_type` VARCHAR(191) NOT NULL,
    `entity_id` VARCHAR(191) NULL,
    `old_values` TEXT NULL,
    `new_values` TEXT NULL,
    `ip_address` VARCHAR(191) NULL,
    `user_agent` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tenant_users` ADD CONSTRAINT `tenant_users_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_sessions` ADD CONSTRAINT `user_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `tenant_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_ledger` ADD CONSTRAINT `customer_ledger_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bom_components` ADD CONSTRAINT `bom_components_parent_product_id_fkey` FOREIGN KEY (`parent_product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bom_components` ADD CONSTRAINT `bom_components_component_id_fkey` FOREIGN KEY (`component_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chart_of_accounts` ADD CONSTRAINT `chart_of_accounts_parent_account_id_fkey` FOREIGN KEY (`parent_account_id`) REFERENCES `chart_of_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_line_items` ADD CONSTRAINT `journal_line_items_journal_entry_id_fkey` FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_line_items` ADD CONSTRAINT `journal_line_items_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `chart_of_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_statements` ADD CONSTRAINT `bank_statements_bank_account_id_fkey` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
