import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

// Platform database connection (shared across tenants)
export const platformDb = new PrismaClient({
  datasources: {
    db: {
      url: process.env.PLATFORM_DATABASE_URL || process.env.DATABASE_URL
    }
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
});

// Tenant database connections cache
const tenantConnections = new Map<string, PrismaClient>();

/**
 * Get or create a database connection for a specific tenant
 */
export async function getTenantDb(tenantId: string): Promise<PrismaClient> {
  // Check if connection already exists in cache
  if (tenantConnections.has(tenantId)) {
    return tenantConnections.get(tenantId)!;
  }

  // Get tenant information from platform database
  const tenant = await platformDb.tenant.findUnique({
    where: { id: tenantId },
    select: { databaseName: true, status: true }
  });

  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  if (tenant.status !== 'ACTIVE' && tenant.status !== 'TRIAL') {
    throw new Error(`Tenant is not active: ${tenantId}`);
  }

  // Create database URL for tenant
  const baseUrl = process.env.DATABASE_URL || 'mysql://jeweler_user:jeweler_pass_2024@localhost:3306/jeweler_platform';
  const tenantDatabaseUrl = baseUrl.replace(/\/[^\/]*$/, `/${tenant.databaseName}`);

  // Create new Prisma client for tenant
  const tenantDb = new PrismaClient({
    datasources: {
      db: {
        url: tenantDatabaseUrl
      }
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
  });

  // Test connection
  try {
    await tenantDb.$connect();
    console.log(`Connected to tenant database: ${tenant.databaseName}`);
  } catch (error) {
    console.error(`Failed to connect to tenant database ${tenant.databaseName}:`, error);
    throw new Error(`Database connection failed for tenant: ${tenantId}`);
  }

  // Cache the connection
  tenantConnections.set(tenantId, tenantDb);

  return tenantDb;
}

/**
 * Close a specific tenant database connection
 */
export async function closeTenantDb(tenantId: string): Promise<void> {
  const connection = tenantConnections.get(tenantId);
  if (connection) {
    await connection.$disconnect();
    tenantConnections.delete(tenantId);
    console.log(`Closed tenant database connection: ${tenantId}`);
  }
}

/**
 * Close all tenant database connections
 */
export async function closeAllTenantConnections(): Promise<void> {
  const promises = Array.from(tenantConnections.entries()).map(async ([tenantId, connection]) => {
    await connection.$disconnect();
    console.log(`Closed tenant database connection: ${tenantId}`);
  });

  await Promise.all(promises);
  tenantConnections.clear();
}

/**
 * Generate a unique database name for a tenant
 */
export function generateTenantDatabaseName(tenantName: string, tenantId: string): string {
  // Create a hash of tenant name and ID for uniqueness
  const hash = createHash('md5').update(`${tenantName}_${tenantId}`).digest('hex').substring(0, 8);
  
  // Clean tenant name for database naming
  const cleanName = tenantName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .substring(0, 20);

  return `tenant_${cleanName}_${hash}`;
}

/**
 * Create a new tenant database
 */
export async function createTenantDatabase(tenantId: string, databaseName: string): Promise<void> {
  try {
    // Use raw query to create database
    await platformDb.$executeRawUnsafe(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\``);
    console.log(`Created tenant database: ${databaseName}`);

    // Get tenant connection to run migrations
    const tenantDb = await getTenantDb(tenantId);
    
    // The migrations will be applied when we run prisma migrate
    console.log(`Tenant database ${databaseName} is ready for migrations`);
    
  } catch (error) {
    console.error(`Failed to create tenant database ${databaseName}:`, error);
    throw error;
  }
}

/**
 * Drop a tenant database (use with caution!)
 */
export async function dropTenantDatabase(databaseName: string): Promise<void> {
  try {
    await platformDb.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    console.log(`Dropped tenant database: ${databaseName}`);
  } catch (error) {
    console.error(`Failed to drop tenant database ${databaseName}:`, error);
    throw error;
  }
}

/**
 * Health check for database connections
 */
export async function checkDatabaseHealth(): Promise<{
  platform: boolean;
  tenants: { [tenantId: string]: boolean };
}> {
  const result = {
    platform: false,
    tenants: {} as { [tenantId: string]: boolean }
  };

  // Check platform database
  try {
    await platformDb.$queryRaw`SELECT 1`;
    result.platform = true;
  } catch (error) {
    console.error('Platform database health check failed:', error);
  }

  // Check tenant databases
  for (const [tenantId, connection] of tenantConnections.entries()) {
    try {
      await connection.$queryRaw`SELECT 1`;
      result.tenants[tenantId] = true;
    } catch (error) {
      console.error(`Tenant database health check failed for ${tenantId}:`, error);
      result.tenants[tenantId] = false;
    }
  }

  return result;
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Closing database connections...');
  await closeAllTenantConnections();
  await platformDb.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Closing database connections...');
  await closeAllTenantConnections();
  await platformDb.$disconnect();
  process.exit(0);
});