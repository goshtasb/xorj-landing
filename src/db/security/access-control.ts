/**
 * Access Control & Credentials Management - SR-2 Implementation
 * 
 * Implements principle of least privilege access control for database operations.
 * Each backend service has dedicated database users with minimal required permissions.
 * Integrates with secrets manager for credential management.
 * 
 * Requirements Addressed:
 * - SR-2: Access Control - Dedicated users per service with least privilege
 * - Secrets Manager integration for credential management
 * - Dynamic credential injection at runtime
 * 
 * @see PRD Security Requirements SR-2
 */

import { createHash, randomBytes } from 'crypto';

// Types for secrets management
interface DatabaseCredentials {
  username: string;
  password: string;
  host?: string;
  port?: number;
  database?: string;
}

interface SecretValue {
  value: DatabaseCredentials;
  expiry: number;
}

// interface SecretUpdate { // Unused - commented out
//   password?: string;
//   [key: string]: unknown;
// }

interface RolePermissions {
  read: string[];
  write: string[];
  admin: string[];
}

interface UserRole {
  role: string;
  permissions: {
    readTables: string[];
    writeTables: string[];
    adminOperations: string[];
  };
  complianceScore: number;
}

interface RoleConfig {
  permissions: RolePermissions;
}

/**
 * Database User Roles and Permissions
 * 
 * Defines the principle of least privilege access control system.
 * Each service gets only the minimum permissions needed.
 */
export const DatabaseUserRoles = {
  // API Service User - Limited to user-facing operations
  apiService: {
    username: 'xorj_api_service',
    description: 'API service for user-facing operations',
    permissions: {
      // READ access to most tables for API responses
      read: [
        'users',
        'user_settings', 
        'trader_scores',
        'scoring_runs',
        'execution_jobs',
        'trades',
        'waitlist_signups'
      ],
      // LIMITED WRITE access - only user data and jobs
      write: [
        'users',
        'user_settings',
        'execution_jobs',
        'waitlist_signups'
      ],
      // NO WRITE access to critical tables
      readOnly: [
        'trader_scores',    // Only quantitative engine can write scores
        'scoring_runs'      // Only quantitative engine manages scoring
      ],
      // NO DIRECT WRITE to trades (only bot execution service)
      denied: [
        'trades.write'      // Prevents API from creating fake trades
      ]
    },
    connectionLimits: {
      maxConnections: 25,
      idleTimeout: 300000, // 5 minutes
      maxLifetime: 3600000 // 1 hour
    }
  },

  // Quantitative Engine User - Scoring and analysis operations
  quantitativeEngine: {
    username: 'xorj_quant_engine',
    description: 'Quantitative engine for trader analysis',
    permissions: {
      // READ access for analysis
      read: [
        'users',
        'trades',           // Needs to read trade history for analysis
        'trader_scores',    // Needs to read historical scores
        'scoring_runs'
      ],
      // WRITE access to scoring tables
      write: [
        'scoring_runs',     // Can create and manage scoring jobs
        'trader_scores'     // Can write computed scores
      ],
      // READ ONLY access to user data
      readOnly: [
        'users',
        'user_settings',
        'execution_jobs',
        'trades',
        'waitlist_signups'
      ]
    },
    connectionLimits: {
      maxConnections: 10,
      idleTimeout: 600000, // 10 minutes (long-running analysis)
      maxLifetime: 7200000 // 2 hours
    }
  },

  // Bot Execution Service User - Trade execution operations  
  botExecutionService: {
    username: 'xorj_bot_execution',
    description: 'Bot execution service for trade operations',
    permissions: {
      // READ access for execution decisions
      read: [
        'users',
        'user_settings',    // Needs risk profiles for execution
        'execution_jobs',   // Reads jobs to execute
        'trades',           // Checks for duplicates
        'trader_scores'     // May use scores for execution logic
      ],
      // WRITE access to execution tables
      write: [
        'execution_jobs',   // Updates job status
        'trades'            // Creates trade records
      ],
      // READ ONLY access to other data
      readOnly: [
        'scoring_runs',
        'trader_scores',
        'waitlist_signups'
      ]
    },
    connectionLimits: {
      maxConnections: 15,
      idleTimeout: 180000, // 3 minutes (quick execution cycles)
      maxLifetime: 1800000 // 30 minutes
    }
  },

  // Admin User - Full access for migrations and maintenance
  adminService: {
    username: 'xorj_admin',
    description: 'Administrative access for migrations and maintenance',
    permissions: {
      // FULL access to all tables
      read: ['*'],
      write: ['*'],
      admin: [
        'CREATE TABLE',
        'ALTER TABLE', 
        'DROP TABLE',
        'CREATE INDEX',
        'DROP INDEX',
        'VACUUM',
        'ANALYZE',
        'REINDEX'
      ]
    },
    connectionLimits: {
      maxConnections: 5,
      idleTimeout: 1800000, // 30 minutes
      maxLifetime: 10800000 // 3 hours
    },
    restrictedUsage: true // Should only be used for maintenance
  },

  // Read-Only Analytics User - For reporting and monitoring
  analyticsService: {
    username: 'xorj_analytics',
    description: 'Read-only access for analytics and reporting',
    permissions: {
      // READ ONLY access to all data
      read: [
        'users',
        'user_settings',
        'trader_scores',
        'scoring_runs', 
        'execution_jobs',
        'trades',
        'waitlist_signups'
      ],
      // NO WRITE access anywhere
      write: [],
      readOnly: ['*']
    },
    connectionLimits: {
      maxConnections: 8,
      idleTimeout: 900000, // 15 minutes
      maxLifetime: 3600000 // 1 hour
    }
  }
} as const;

/**
 * SQL Statements for Creating Database Users
 * 
 * Generates SQL commands to create users with least privilege access.
 */
export const DatabaseUserCreationSQL = {
  /**
   * Generate SQL to create all database users with proper permissions
   */
  generateCreateUsersSQL(): string[] {
    const statements: string[] = [];

    // Create users with no default privileges
    Object.values(DatabaseUserRoles).forEach(role => {
      statements.push(`
-- Create user: ${role.username}
-- Description: ${role.description}
CREATE USER ${role.username} WITH
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION
  CONNECTION LIMIT ${role.connectionLimits.maxConnections};
`);
    });

    // Grant specific table permissions
    statements.push(this.generateAPIServicePermissions());
    statements.push(this.generateQuantitativeEnginePermissions());
    statements.push(this.generateBotExecutionPermissions());
    statements.push(this.generateAdminPermissions());
    statements.push(this.generateAnalyticsPermissions());

    return statements;
  },

  /**
   * Generate API Service permissions
   */
  generateAPIServicePermissions(): string {
    return `
-- API Service Permissions (Least Privilege)
GRANT CONNECT ON DATABASE xorj_bot_state TO xorj_api_service;
GRANT USAGE ON SCHEMA public TO xorj_api_service;

-- READ permissions
GRANT SELECT ON users, user_settings, trader_scores, scoring_runs, execution_jobs, trades, waitlist_signups TO xorj_api_service;

-- LIMITED WRITE permissions
GRANT INSERT, UPDATE, DELETE ON users TO xorj_api_service;
GRANT INSERT, UPDATE, DELETE ON user_settings TO xorj_api_service;
GRANT INSERT, UPDATE ON execution_jobs TO xorj_api_service;
GRANT INSERT, UPDATE ON waitlist_signups TO xorj_api_service;

-- Sequence permissions for auto-incrementing fields
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO xorj_api_service;

-- EXPLICITLY DENY write access to critical tables
-- (PostgreSQL doesn't have explicit DENY, so we rely on not granting)
-- xorj_api_service CANNOT INSERT/UPDATE/DELETE on:
-- - trader_scores (only quant engine)
-- - scoring_runs (only quant engine)  
-- - trades (only bot execution)
`;
  },

  /**
   * Generate Quantitative Engine permissions
   */
  generateQuantitativeEnginePermissions(): string {
    return `
-- Quantitative Engine Permissions
GRANT CONNECT ON DATABASE xorj_bot_state TO xorj_quant_engine;
GRANT USAGE ON SCHEMA public TO xorj_quant_engine;

-- READ permissions for analysis
GRANT SELECT ON users, trades, trader_scores, scoring_runs TO xorj_quant_engine;

-- READ ONLY on other tables
GRANT SELECT ON user_settings, execution_jobs, waitlist_signups TO xorj_quant_engine;

-- WRITE permissions for scoring data
GRANT INSERT, UPDATE, DELETE ON scoring_runs TO xorj_quant_engine;
GRANT INSERT, UPDATE, DELETE ON trader_scores TO xorj_quant_engine;

-- Sequence permissions
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO xorj_quant_engine;
`;
  },

  /**
   * Generate Bot Execution permissions
   */
  generateBotExecutionPermissions(): string {
    return `
-- Bot Execution Service Permissions
GRANT CONNECT ON DATABASE xorj_bot_state TO xorj_bot_execution;
GRANT USAGE ON SCHEMA public TO xorj_bot_execution;

-- READ permissions for execution logic
GRANT SELECT ON users, user_settings, execution_jobs, trades, trader_scores TO xorj_bot_execution;

-- READ ONLY on scoring data
GRANT SELECT ON scoring_runs, trader_scores, waitlist_signups TO xorj_bot_execution;

-- WRITE permissions for execution data
GRANT INSERT, UPDATE ON execution_jobs TO xorj_bot_execution;
GRANT INSERT, UPDATE ON trades TO xorj_bot_execution;

-- Sequence permissions
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO xorj_bot_execution;
`;
  },

  /**
   * Generate Admin permissions
   */
  generateAdminPermissions(): string {
    return `
-- Admin Service Permissions (Full Access)
GRANT ALL PRIVILEGES ON DATABASE xorj_bot_state TO xorj_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO xorj_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO xorj_admin;
GRANT ALL PRIVILEGES ON SCHEMA public TO xorj_admin;

-- Allow schema modifications
ALTER USER xorj_admin CREATEDB;
`;
  },

  /**
   * Generate Analytics permissions
   */
  generateAnalyticsPermissions(): string {
    return `
-- Analytics Service Permissions (Read Only)
GRANT CONNECT ON DATABASE xorj_bot_state TO xorj_analytics;
GRANT USAGE ON SCHEMA public TO xorj_analytics;

-- READ ONLY permissions on all tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO xorj_analytics;

-- Ensure no write permissions
-- (PostgreSQL grants are additive, so not granting write = no write access)
`;
  }
};

/**
 * Secrets Manager Integration
 * 
 * Handles dynamic credential retrieval from AWS Secrets Manager or similar.
 */
export class SecretsManager {
  private secretsCache = new Map<string, SecretValue>();
  private cacheTimeout = 300000; // 5 minutes cache

  /**
   * Get database credentials for a service
   * @param serviceName - Name of the service requesting credentials
   * @returns Database credentials object
   */
  async getDatabaseCredentials(serviceName: keyof typeof DatabaseUserRoles): Promise<{
    username: string;
    password: string;
    host: string;
    port: number;
    database: string;
    sslMode: string;
  }> {
    const secretName = `xorj-trading-bot/database/${serviceName}`;
    
    try {
      // Try cache first
      const cached = this.secretsCache.get(secretName);
      if (cached && Date.now() < cached.expiry) {
        return cached.value;
      }

      // Fetch from secrets manager (AWS SDK or equivalent)
      const credentials = await this.fetchFromSecretsManager(secretName);
      
      // Cache the result
      this.secretsCache.set(secretName, {
        value: credentials,
        expiry: Date.now() + this.cacheTimeout
      });

      return credentials;
      
    } catch {
      console.error(`Failed to retrieve credentials for ${serviceName}:`);
      throw new Error(`Credential retrieval failed for ${serviceName}`);
    }
  }

  /**
   * Fetch credentials from external secrets manager
   * This would integrate with AWS Secrets Manager, HashiCorp Vault, etc.
   */
  private async fetchFromSecretsManager(secretName: string): Promise<DatabaseCredentials> {
    // In production, this would use AWS SDK or similar
    // For now, return environment-based fallback
    
    const serviceName = secretName.split('/').pop();
    const roleConfig = DatabaseUserRoles[serviceName as keyof typeof DatabaseUserRoles];
    
    if (!roleConfig) {
      throw new Error(`Unknown service: ${serviceName}`);
    }

    return {
      username: roleConfig.username,
      password: process.env[`DATABASE_PASSWORD_${serviceName?.toUpperCase()}`] || '',
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      database: process.env.DATABASE_NAME || 'xorj_bot_state',
      sslMode: 'require' // Always require SSL
    };
  }

  /**
   * Rotate database password for a service user
   * @param serviceName - Service to rotate password for
   * @returns New password hash for verification
   */
  async rotatePassword(serviceName: keyof typeof DatabaseUserRoles): Promise<string> {
    const newPassword = this.generateSecurePassword();
    const secretName = `xorj-trading-bot/database/${serviceName}`;
    
    try {
      // Update in secrets manager
      await this.updateSecretsManager(secretName, { password: newPassword });
      
      // Update database user password
      const username = DatabaseUserRoles[serviceName].username;
      await this.updateDatabasePassword(username, newPassword);
      
      // Clear cache to force refresh
      this.secretsCache.delete(secretName);
      
      // Return hash for verification (not the actual password)
      return createHash('sha256').update(newPassword).digest('hex');
      
    } catch {
      console.error(`Password rotation failed for ${serviceName}:`);
      throw error;
    }
  }

  /**
   * Generate cryptographically secure password
   */
  private generateSecurePassword(length: number = 32): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    const bytes = randomBytes(length);
    let password = '';
    
    for (let i = 0; i < length; i++) {
      password += charset[bytes[i] % charset.length];
    }
    
    return password;
  }

  /**
   * Update secrets manager with new credential
   */
  private async updateSecretsManager(secretName: string /* _updates: SecretUpdate */): Promise<void> {
    // In production, this would update AWS Secrets Manager
    console.log(`Would update secret ${secretName} in production`);
  }

  /**
   * Update database user password
   */
  private async updateDatabasePassword(username: string /* _newPassword: string */): Promise<void> {
    // In production, this would connect as admin user and update password
    console.log(`Would update password for ${username} in production`);
  }
}

/**
 * Connection Factory with Access Control
 * 
 * Creates database connections with appropriate user credentials.
 */
export class SecureConnectionFactory {
  private secretsManager = new SecretsManager();

  /**
   * Create database connection for specific service
   * @param serviceName - Service requesting connection
   * @returns Configured database connection
   */
  async createConnection(serviceName: keyof typeof DatabaseUserRoles) {
    const credentials = await this.secretsManager.getDatabaseCredentials(serviceName);
    const roleConfig = DatabaseUserRoles[serviceName];

    // Validate service is allowed to connect
    if (roleConfig.restrictedUsage && !this.isMaintenanceWindow()) {
      throw new Error(`Service ${serviceName} restricted to maintenance windows only`);
    }

    // Build secure connection string
    const connectionString = this.buildConnectionString({
      ...credentials,
      applicationName: `xorj-${serviceName}`,
      maxConnections: roleConfig.connectionLimits.maxConnections,
      idleTimeout: roleConfig.connectionLimits.idleTimeout
    });

    // Log connection for audit purposes
    this.logConnectionEvent({
      serviceName,
      username: credentials.username,
      timestamp: new Date(),
      action: 'connection_created'
    });

    return connectionString;
  }

  /**
   * Check if current time is within maintenance window
   */
  private isMaintenanceWindow(): boolean {
    const now = new Date();
    const hour = now.getUTCHours();
    
    // Maintenance window: 2-4 AM UTC
    return hour >= 2 && hour < 4;
  }

  /**
   * Build secure connection string with service-specific parameters
   */
  private buildConnectionString(config: {
    username: string;
    password: string;
    host: string;
    port: number;
    database: string;
    sslMode: string;
    applicationName: string;
    maxConnections: number;
    idleTimeout: number;
  }): string {
    const params = new URLSearchParams({
      sslmode: config.sslMode,
      application_name: config.applicationName,
      connect_timeout: '10',
      idle_in_transaction_session_timeout: (config.idleTimeout / 1000).toString(),
      statement_timeout: '30000', // 30 second statement timeout
      lock_timeout: '10000'       // 10 second lock timeout
    });

    return `postgresql://${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}?${params.toString()}`;
  }

  /**
   * Log connection events for audit trail
   */
  private logConnectionEvent(event: {
    serviceName: string;
    username: string;
    timestamp: Date;
    action: string;
  }): void {
    // In production, this would integrate with audit logging system
    console.log(`[AUDIT] Database connection:`, {
      service: event.serviceName,
      user: event.username,
      timestamp: event.timestamp.toISOString(),
      action: event.action
    });
  }
}

/**
 * Access Control Validator
 * 
 * Validates that database operations comply with least privilege principles.
 */
export class AccessControlValidator {
  /**
   * Validate that a query operation is allowed for the given user role
   * @param userRole - Database user role
   * @param operation - SQL operation being performed
   * @param tableName - Table being accessed
   * @returns Validation result
   */
  static validateOperation(
    userRole: keyof typeof DatabaseUserRoles,
    operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'CREATE' | 'DROP' | 'ALTER',
    tableName: string
  ): { allowed: boolean; reason?: string } {
    const roleConfig = DatabaseUserRoles[userRole];
    
    if (!roleConfig) {
      return { allowed: false, reason: `Unknown user role: ${userRole}` };
    }

    const permissions = roleConfig.permissions;

    // Check admin permissions
    if ('admin' in permissions && permissions.admin.includes('*')) {
      return { allowed: true };
    }

    // Check operation-specific permissions
    switch (operation) {
      case 'SELECT':
        if (permissions.read.includes(tableName) || permissions.read.includes('*')) {
          return { allowed: true };
        }
        break;

      case 'INSERT':
      case 'UPDATE': 
      case 'DELETE':
        if (permissions.write.includes(tableName) || permissions.write.includes('*')) {
          return { allowed: true };
        }
        break;

      case 'CREATE':
      case 'DROP':
      case 'ALTER':
        if ('admin' in permissions && permissions.admin.includes(operation)) {
          return { allowed: true };
        }
        break;
    }

    // Check if explicitly read-only
    if (permissions.readOnly.includes(tableName) && operation !== 'SELECT') {
      return { 
        allowed: false, 
        reason: `Table ${tableName} is read-only for user role ${userRole}` 
      };
    }

    // Check if explicitly denied
    if ('denied' in permissions) {
      const deniedOp = `${tableName}.${operation.toLowerCase()}`;
      if (permissions.denied.includes(deniedOp)) {
        return { 
          allowed: false, 
          reason: `Operation ${operation} on ${tableName} is explicitly denied for ${userRole}` 
        };
      }
    }

    return { 
      allowed: false, 
      reason: `No permission granted for ${operation} on ${tableName} for user role ${userRole}` 
    };
  }

  /**
   * Generate access control compliance report
   */
  static generateComplianceReport(): {
    timestamp: string;
    userRoles: Array<{
      role: string;
      permissions: {
        readTables: string[];
        writeTables: string[];
        adminOperations: string[];
      };
      connectionLimits: {
        maxConnections: number;
        timeouts: {
          idle: number;
          lifetime: number;
        };
      };
      complianceScore: number;
    }>;
    overallCompliance: number;
  } {
    const report = {
      timestamp: new Date().toISOString(),
      userRoles: [] as UserRole[],
      overallCompliance: 0
    };

    let totalComplianceScore = 0;

    Object.entries(DatabaseUserRoles).forEach(([roleName, config]) => {
      const roleReport = {
        role: roleName,
        permissions: {
          readTables: Array.isArray(config.permissions.read) ? config.permissions.read : [],
          writeTables: Array.isArray(config.permissions.write) ? config.permissions.write : [],
          adminOperations: 'admin' in config.permissions ? config.permissions.admin : []
        },
        connectionLimits: {
          maxConnections: config.connectionLimits.maxConnections,
          timeouts: {
            idle: config.connectionLimits.idleTimeout,
            lifetime: config.connectionLimits.maxLifetime
          }
        },
        complianceScore: this.calculateRoleComplianceScore(config)
      };

      report.userRoles.push(roleReport);
      totalComplianceScore += roleReport.complianceScore;
    });

    report.overallCompliance = totalComplianceScore / Object.keys(DatabaseUserRoles).length;

    return report;
  }

  /**
   * Calculate compliance score for a user role (0-100)
   */
  private static calculateRoleComplianceScore(roleConfig: RoleConfig): number {
    let score = 100;

    // Deduct points for overly broad permissions
    if (roleConfig.permissions.read.includes('*')) {
      score -= 20; // Global read access
    }
    if (roleConfig.permissions.write.includes('*')) {
      score -= 30; // Global write access
    }
    if ('admin' in roleConfig.permissions && roleConfig.permissions.admin.includes('*')) {
      score -= 40; // Global admin access
    }

    // Award points for specific restrictions
    if (roleConfig.permissions.readOnly && roleConfig.permissions.readOnly.length > 0) {
      score += 10; // Has read-only restrictions
    }
    if ('denied' in roleConfig.permissions && roleConfig.permissions.denied.length > 0) {
      score += 10; // Has explicit denials
    }

    // Check connection limits
    if (roleConfig.connectionLimits.maxConnections <= 25) {
      score += 5; // Reasonable connection limit
    }
    if (roleConfig.connectionLimits.idleTimeout <= 600000) {
      score += 5; // Reasonable idle timeout
    }

    return Math.max(0, Math.min(100, score));
  }
}

// Export the secrets manager instance
export const secretsManager = new SecretsManager();
export const connectionFactory = new SecureConnectionFactory();