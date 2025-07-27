# Database Setup and Management

This document describes the database architecture and management for the Jeweler SaaS Platform.

## Architecture Overview

The platform uses a **multi-tenant architecture** with database-level isolation:

- **Platform Database**: Shared database containing tenant information and user management
- **Tenant Databases**: Separate database per tenant containing business data (customers, products, invoices, etc.)

## Database Stack

- **Database**: MySQL 8.0
- **ORM**: Prisma
- **Cache**: Redis 7.0
- **Migration**: Prisma Migrate

## Quick Start

### 1. Start Database Services

```bash
# Start MySQL and Redis containers
docker-compose up -d db redis
```

### 2. Run Initial Migration

```bash
cd backend
npm run db:migrate
```

### 3. Seed Sample Data

```bash
npm run db:seed
```

### 4. Test Connections

```bash
npm run db:test
```

## Database Management Commands

### Core Commands

```bash
# Run database migrations
npm run db:migrate

# Generate Prisma client
npm run db:generate

# Seed database with sample data
npm run db:seed

# Test database connections
npm run db:test

# Clear seed data
npm run db:clear

# Reset database (WARNING: destroys all data)
npm run db:reset

# Open Prisma Studio
npm run db:studio
```

### Alternative Command Interface

```bash
# Use the db script for easier management
npm run db migrate
npm run db seed
npm run db test-connection
npm run db clear-seeds
npm run db studio
```

## Multi-Tenant Database Structure

### Platform Database Tables

- `tenants` - Tenant information and configuration
- `tenant_users` - User accounts per tenant
- `user_sessions` - User session management

### Tenant Database Tables

Each tenant gets their own database with these tables:

#### Customer Management
- `customers` - Customer profiles and contact information
- `customer_ledger` - Customer transaction history and balances

#### Product & Inventory
- `products` - Product catalog with categories (gold, jewelry, coins, stones)
- `bom_components` - Bill of Materials for complex products
- `stock_movements` - Inventory movement tracking

#### Invoicing & Payments
- `invoices` - Sales, purchase, and trade invoices
- `invoice_items` - Line items for each invoice
- `payments` - Payment tracking with multiple payment types

#### Accounting
- `chart_of_accounts` - Chart of accounts structure
- `journal_entries` - Double-entry bookkeeping entries
- `journal_line_items` - Individual journal entry lines
- `bank_accounts` - Bank account management
- `bank_statements` - Bank statement import and reconciliation

#### System
- `system_settings` - Tenant-specific configuration
- `audit_logs` - Activity and change tracking

## Database Connection Management

### Platform Database Connection

```typescript
import { platformDb } from './src/database/connection';

// Access platform-level data
const tenants = await platformDb.tenant.findMany();
```

### Tenant Database Connection

```typescript
import { getTenantDb } from './src/database/connection';

// Get tenant-specific database connection
const tenantDb = await getTenantDb('tenant-id');
const customers = await tenantDb.customer.findMany();
```

### Middleware Integration

The platform includes middleware for automatic tenant context:

```typescript
// Tenant middleware extracts tenant from subdomain, header, or JWT
app.use(tenantMiddleware);

// Auth middleware validates user and sets tenant context
app.use(authMiddleware);

// Routes automatically have access to req.tenantDb
app.get('/api/customers', async (req, res) => {
  const customers = await req.tenantDb.customer.findMany();
  res.json(customers);
});
```

## Sample Data

The seeding script creates:

### Demo Tenants
- **طلافروشی طلای نو** (talanou.jeweler.com)
- **جواهرات آریا** (arya-jewelry.jeweler.com)

### Sample Business Data
- Chart of accounts (Persian accounting structure)
- Sample customers with Persian names and addresses
- Product catalog (raw gold, jewelry, coins, stones)
- Sample invoices with payments
- Bank accounts and system settings

### User Accounts
- Admin: `admin@{subdomain}.com` / `admin123`
- Employee: `employee@{subdomain}.com` / `admin123`

## Environment Configuration

### Required Environment Variables

```env
# Database
DATABASE_URL="mysql://jeweler_user:jeweler_pass_2024@localhost:3306/jeweler_platform"
PLATFORM_DATABASE_URL="mysql://jeweler_user:jeweler_pass_2024@localhost:3306/jeweler_platform"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="jeweler_jwt_secret_2024_very_secure"
JWT_REFRESH_SECRET="jeweler_refresh_secret_2024_very_secure"
```

## Development Workflow

### 1. Schema Changes

```bash
# 1. Modify prisma/schema.prisma
# 2. Create and apply migration
npm run db:migrate

# 3. Update tenant migration script if needed
# Edit src/database/tenant-migrations.ts

# 4. Test with existing tenants
npm run db:test
```

### 2. Adding New Tenants

```typescript
import { platformDb, generateTenantDatabaseName, initializeTenantDatabase } from './src/database/connection';

// Create new tenant
const tenant = await platformDb.tenant.create({
  data: {
    name: 'New Jeweler Store',
    subdomain: 'newstore',
    databaseName: generateTenantDatabaseName('New Jeweler Store', 'unique-id'),
    status: 'TRIAL'
  }
});

// Initialize tenant database
await initializeTenantDatabase(tenant.id, tenant.databaseName);
```

### 3. Database Maintenance

```bash
# Health check all connections
npm run db:test

# Clear and reseed development data
npm run db:clear
npm run db:seed

# Reset everything (development only)
npm run db:reset
```

## Production Considerations

### Database Scaling
- Use read replicas for tenant databases
- Implement connection pooling
- Monitor database performance per tenant

### Backup Strategy
- Automated backups for platform database
- Per-tenant backup scheduling
- Point-in-time recovery capability

### Security
- Database user permissions per tenant
- Encrypted connections (TLS)
- Regular security updates

### Monitoring
- Database performance metrics
- Connection pool monitoring
- Query performance analysis

## Troubleshooting

### Common Issues

#### Migration Failures
```bash
# Check database permissions
npm run db:test

# Reset and retry (development only)
npm run db:reset
npm run db:migrate
```

#### Connection Issues
```bash
# Verify Docker containers are running
docker-compose ps

# Check database logs
docker-compose logs db

# Test individual connections
npm run db:test
```

#### Tenant Database Issues
```bash
# Verify tenant database exists
npm run db:studio

# Recreate tenant database
# (Use tenant management API or manual SQL)
```

### Performance Issues

#### Slow Queries
- Use Prisma Studio to analyze queries
- Add database indexes as needed
- Monitor query performance in logs

#### Connection Pool Exhaustion
- Adjust Prisma connection pool settings
- Implement connection cleanup
- Monitor active connections

## API Reference

### Database Connection Functions

```typescript
// Platform database
import { platformDb } from './database/connection';

// Tenant database management
import { 
  getTenantDb,
  closeTenantDb,
  createTenantDatabase,
  generateTenantDatabaseName
} from './database/connection';

// Tenant migrations
import {
  initializeTenantDatabase,
  migrateTenantDatabase,
  verifyTenantDatabaseSchema
} from './database/tenant-migrations';

// Seeding
import {
  seedPlatformDatabase,
  seedTenantDatabase,
  runAllSeeds,
  clearSeedData
} from './database/seeds';
```

This database setup provides a robust foundation for the multi-tenant jeweler platform with proper isolation, scalability, and development workflow support.