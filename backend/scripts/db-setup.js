#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

const commands = {
  'migrate': 'npx prisma migrate dev',
  'generate': 'npx prisma generate',
  'seed': 'npx ts-node src/database/seeds.ts',
  'test-connection': 'npx ts-node src/database/test-connection.ts',
  'clear-seeds': 'npx ts-node src/database/seeds.ts clear',
  'reset': 'npx prisma migrate reset --force',
  'studio': 'npx prisma studio'
};

const command = process.argv[2];

if (!command || !commands[command]) {
  console.log('Available database commands:');
  console.log('  migrate        - Run database migrations');
  console.log('  generate       - Generate Prisma client');
  console.log('  seed           - Seed database with sample data');
  console.log('  test-connection - Test database connections');
  console.log('  clear-seeds    - Clear seed data');
  console.log('  reset          - Reset database (WARNING: destroys data)');
  console.log('  studio         - Open Prisma Studio');
  console.log('');
  console.log('Usage: npm run db <command>');
  process.exit(1);
}

try {
  console.log(`Running: ${commands[command]}`);
  execSync(commands[command], { stdio: 'inherit', cwd: __dirname });
} catch (error) {
  console.error(`Command failed: ${error.message}`);
  process.exit(1);
}