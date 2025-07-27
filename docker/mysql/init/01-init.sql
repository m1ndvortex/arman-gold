-- Initialize database for Jeweler SaaS Platform
-- This script runs when MySQL container starts for the first time

-- Create additional databases if needed
CREATE DATABASE IF NOT EXISTS jeweler_platform_test;

-- Grant permissions
GRANT ALL PRIVILEGES ON jeweler_platform.* TO 'jeweler_user'@'%';
GRANT ALL PRIVILEGES ON jeweler_platform_test.* TO 'jeweler_user'@'%';
-- Grant permission to create databases (needed for Prisma shadow database)
GRANT CREATE ON *.* TO 'jeweler_user'@'%';
GRANT DROP ON *.* TO 'jeweler_user'@'%';

-- Create platform-level tables (shared across tenants)
USE jeweler_platform;

-- Tenants table
CREATE TABLE IF NOT EXISTS tenants (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    subdomain VARCHAR(100) UNIQUE,
    database_name VARCHAR(100) NOT NULL,
    status ENUM('active', 'suspended', 'trial') DEFAULT 'trial',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Platform users (super admins)
CREATE TABLE IF NOT EXISTS platform_users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('super_admin') DEFAULT 'super_admin',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tenant users
CREATE TABLE IF NOT EXISTS tenant_users (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('tenant_admin', 'employee') NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret VARCHAR(255),
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE KEY unique_tenant_email (tenant_id, email)
);

-- User sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    tenant_id VARCHAR(36),
    token_hash VARCHAR(255) NOT NULL,
    refresh_token_hash VARCHAR(255),
    device_info TEXT,
    ip_address VARCHAR(45),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_expires_at (expires_at)
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36),
    user_id VARCHAR(36),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(36),
    old_values JSON,
    new_values JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at)
);

-- Insert default super admin (password: admin123)
INSERT IGNORE INTO platform_users (id, email, password_hash, role) 
VALUES (
    'super-admin-001', 
    'admin@jeweler-platform.com', 
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBdXzgVjHUxXSm',
    'super_admin'
);

FLUSH PRIVILEGES;