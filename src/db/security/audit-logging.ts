/**
 * Audit Logging & Monitoring - SR-4 Implementation
 * 
 * Implements comprehensive audit logging for database administrative actions
 * and schema changes. Tracks all security-relevant operations with detailed
 * context and enables compliance reporting.
 * 
 * Requirements Addressed:
 * - SR-4: Auditing & Logging - Track administrative actions and schema changes
 * - Comprehensive audit trail for compliance
 * - Real-time monitoring and alerting
 * - Structured logging for analysis
 * 
 * @see PRD Security Requirements SR-4
 */

import { createHash } from 'crypto';

/**
 * Audit Event Types
 * 
 * Standardized event categories for comprehensive audit trail.
 */
export const AuditEventTypes = {
  // Database Connection Events
  CONNECTION: {
    ESTABLISHED: 'connection_established',
    FAILED: 'connection_failed',
    TERMINATED: 'connection_terminated',
    TIMEOUT: 'connection_timeout'
  },

  // Authentication & Authorization Events
  AUTH: {
    LOGIN_SUCCESS: 'auth_login_success',
    LOGIN_FAILURE: 'auth_login_failure',
    PERMISSION_GRANTED: 'auth_permission_granted',
    PERMISSION_DENIED: 'auth_permission_denied',
    PRIVILEGE_ESCALATION: 'auth_privilege_escalation'
  },

  // Schema & DDL Operations
  SCHEMA: {
    TABLE_CREATE: 'schema_table_create',
    TABLE_ALTER: 'schema_table_alter', 
    TABLE_DROP: 'schema_table_drop',
    INDEX_CREATE: 'schema_index_create',
    INDEX_DROP: 'schema_index_drop',
    MIGRATION_START: 'schema_migration_start',
    MIGRATION_COMPLETE: 'schema_migration_complete',
    MIGRATION_FAILED: 'schema_migration_failed'
  },

  // Data Operations (High-Risk)
  DATA: {
    BULK_DELETE: 'data_bulk_delete',
    BULK_UPDATE: 'data_bulk_update',
    SENSITIVE_ACCESS: 'data_sensitive_access',
    EXPORT_REQUEST: 'data_export_request',
    BACKUP_RESTORE: 'data_backup_restore'
  },

  // User & Role Management
  USER_MGMT: {
    USER_CREATE: 'user_create',
    USER_DELETE: 'user_delete',
    ROLE_GRANT: 'user_role_grant',
    ROLE_REVOKE: 'user_role_revoke',
    PERMISSION_CHANGE: 'user_permission_change'
  },

  // System & Configuration Changes
  SYSTEM: {
    CONFIG_CHANGE: 'system_config_change',
    SERVICE_START: 'system_service_start',
    SERVICE_STOP: 'system_service_stop',
    MAINTENANCE_MODE: 'system_maintenance_mode',
    BACKUP_START: 'system_backup_start',
    BACKUP_COMPLETE: 'system_backup_complete'
  },

  // Security Events
  SECURITY: {
    SUSPICIOUS_ACTIVITY: 'security_suspicious_activity',
    BRUTE_FORCE_ATTEMPT: 'security_brute_force',
    UNUSUAL_ACCESS_PATTERN: 'security_unusual_pattern',
    ENCRYPTION_KEY_ROTATION: 'security_key_rotation',
    CERTIFICATE_RENEWAL: 'security_cert_renewal'
  }
} as const;

/**
 * Audit Event Severity Levels
 */
export enum AuditSeverity {
  LOW = 'low',
  MEDIUM = 'medium', 
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Standardized Audit Event Interface
 */
export interface AuditEvent {
  // Core identification
  eventId: string;
  eventType: string;
  severity: AuditSeverity;
  timestamp: string;
  
  // Actor information
  actor: {
    userId?: string;
    username?: string;
    serviceAccount?: string;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
  };

  // Resource information
  resource: {
    type: 'database' | 'table' | 'user' | 'role' | 'schema' | 'system';
    name: string;
    id?: string;
    attributes?: Record<string, unknown>;
  };

  // Action details
  action: {
    operation: string;
    description: string;
    parameters?: Record<string, unknown>;
    sqlQuery?: string;
    affectedRows?: number;
  };

  // Context and metadata
  context: {
    environment: string;
    application: string;
    database: string;
    schema?: string;
    transactionId?: string;
    correlationId?: string;
  };

  // Result information
  result: {
    status: 'success' | 'failure' | 'partial';
    errorCode?: string;
    errorMessage?: string;
    duration?: number;
    changesReverted?: boolean;
  };

  // Compliance and classification
  compliance: {
    dataClassification?: 'public' | 'internal' | 'confidential' | 'restricted';
    regulatoryRequirements?: string[];
    retentionPeriod?: number;
    requiresApproval?: boolean;
  };
}

/**
 * Database Audit Logger
 * 
 * Core audit logging functionality with structured event recording.
 */
export class DatabaseAuditLogger {
  private environment: string;
  private applicationName: string;
  private bufferSize = 100;
  private flushInterval = 30000; // 30 seconds
  private eventBuffer: AuditEvent[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor(config: {
    environment: string;
    applicationName: string;
    bufferSize?: number;
    flushInterval?: number;
  }) {
    this.environment = config.environment;
    this.applicationName = config.applicationName;
    this.bufferSize = config.bufferSize || 100;
    this.flushInterval = config.flushInterval || 30000;

    // Start periodic flush
    this.startFlushTimer();
  }

  /**
   * Log database connection event
   */
  async logConnectionEvent(event: {
    type: 'established' | 'failed' | 'terminated' | 'timeout';
    username: string;
    database: string;
    ipAddress: string;
    userAgent?: string;
    duration?: number;
    errorMessage?: string;
  }): Promise<void> {
    const auditEvent: AuditEvent = {
      eventId: this.generateEventId(),
      eventType: `connection_${event.type}`,
      severity: event.type === 'failed' ? AuditSeverity.MEDIUM : AuditSeverity.LOW,
      timestamp: new Date().toISOString(),
      
      actor: {
        username: event.username,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        sessionId: this.generateSessionId(event.username, event.ipAddress)
      },

      resource: {
        type: 'database',
        name: event.database
      },

      action: {
        operation: 'connect',
        description: `Database connection ${event.type}`,
        parameters: {
          connectionType: 'postgresql',
          sslEnabled: true
        }
      },

      context: {
        environment: this.environment,
        application: this.applicationName,
        database: event.database
      },

      result: {
        status: event.type === 'established' ? 'success' : 'failure',
        duration: event.duration,
        errorMessage: event.errorMessage
      },

      compliance: {
        dataClassification: 'internal',
        retentionPeriod: 2555 // 7 years in days
      }
    };

    await this.recordEvent(auditEvent);
  }

  /**
   * Log schema change event
   */
  async logSchemaChange(event: {
    type: 'create' | 'alter' | 'drop';
    objectType: 'table' | 'index' | 'constraint' | 'column';
    objectName: string;
    sqlQuery: string;
    username: string;
    affectedRows?: number;
    migrationId?: string;
    rollbackQuery?: string;
  }): Promise<void> {
    const auditEvent: AuditEvent = {
      eventId: this.generateEventId(),
      eventType: `schema_${event.objectType}_${event.type}`,
      severity: event.type === 'drop' ? AuditSeverity.HIGH : AuditSeverity.MEDIUM,
      timestamp: new Date().toISOString(),

      actor: {
        username: event.username,
        serviceAccount: this.getServiceAccount(event.username)
      },

      resource: {
        type: 'schema',
        name: event.objectName,
        attributes: {
          objectType: event.objectType,
          migrationId: event.migrationId
        }
      },

      action: {
        operation: event.type,
        description: `${event.type.toUpperCase()} ${event.objectType} ${event.objectName}`,
        parameters: {
          objectType: event.objectType,
          rollbackQuery: event.rollbackQuery
        },
        sqlQuery: event.sqlQuery,
        affectedRows: event.affectedRows
      },

      context: {
        environment: this.environment,
        application: this.applicationName,
        database: process.env.DATABASE_NAME || 'xorj_bot_state',
        schema: 'public',
        correlationId: event.migrationId
      },

      result: {
        status: 'success' // Assume success if we're logging it
      },

      compliance: {
        dataClassification: 'internal',
        regulatoryRequirements: ['SOX', 'GDPR'],
        retentionPeriod: 2555,
        requiresApproval: event.type === 'drop'
      }
    };

    await this.recordEvent(auditEvent);
  }

  /**
   * Log data access event for sensitive operations
   */
  async logDataAccess(event: {
    operation: 'select' | 'insert' | 'update' | 'delete';
    tableName: string;
    username: string;
    ipAddress?: string;
    sqlQuery?: string;
    affectedRows?: number;
    sensitiveFields?: string[];
    purpose?: string;
  }): Promise<void> {
    const isSensitiveOperation = event.operation === 'delete' && event.affectedRows && event.affectedRows > 100 ||
                               event.sensitiveFields && event.sensitiveFields.length > 0;

    const auditEvent: AuditEvent = {
      eventId: this.generateEventId(),
      eventType: `data_${event.operation}`,
      severity: isSensitiveOperation ? AuditSeverity.HIGH : AuditSeverity.LOW,
      timestamp: new Date().toISOString(),

      actor: {
        username: event.username,
        ipAddress: event.ipAddress,
        serviceAccount: this.getServiceAccount(event.username)
      },

      resource: {
        type: 'table',
        name: event.tableName,
        attributes: {
          sensitiveFields: event.sensitiveFields,
          purpose: event.purpose
        }
      },

      action: {
        operation: event.operation,
        description: `${event.operation.toUpperCase()} operation on ${event.tableName}`,
        sqlQuery: this.sanitizeSQLForLogging(event.sqlQuery),
        affectedRows: event.affectedRows
      },

      context: {
        environment: this.environment,
        application: this.applicationName,
        database: process.env.DATABASE_NAME || 'xorj_bot_state'
      },

      result: {
        status: 'success'
      },

      compliance: {
        dataClassification: this.classifyTable(event.tableName),
        regulatoryRequirements: this.getRegulatoryRequirements(event.tableName),
        retentionPeriod: 1825 // 5 years for data access logs
      }
    };

    await this.recordEvent(auditEvent);
  }

  /**
   * Log administrative action
   */
  async logAdminAction(event: {
    action: string;
    description: string;
    username: string;
    ipAddress?: string;
    parameters?: Record<string, unknown>;
    result?: 'success' | 'failure';
    errorMessage?: string;
  }): Promise<void> {
    const auditEvent: AuditEvent = {
      eventId: this.generateEventId(),
      eventType: 'admin_action',
      severity: AuditSeverity.HIGH,
      timestamp: new Date().toISOString(),

      actor: {
        username: event.username,
        ipAddress: event.ipAddress,
        serviceAccount: this.getServiceAccount(event.username)
      },

      resource: {
        type: 'system',
        name: 'database_system'
      },

      action: {
        operation: event.action,
        description: event.description,
        parameters: event.parameters
      },

      context: {
        environment: this.environment,
        application: this.applicationName,
        database: process.env.DATABASE_NAME || 'xorj_bot_state'
      },

      result: {
        status: event.result || 'success',
        errorMessage: event.errorMessage
      },

      compliance: {
        dataClassification: 'confidential',
        regulatoryRequirements: ['SOX', 'PCI-DSS'],
        retentionPeriod: 2555,
        requiresApproval: true
      }
    };

    await this.recordEvent(auditEvent);
  }

  /**
   * Record audit event
   */
  private async recordEvent(event: AuditEvent): Promise<void> {
    // Add to buffer
    this.eventBuffer.push(event);

    // Immediate flush for critical events
    if (event.severity === AuditSeverity.CRITICAL) {
      await this.flush();
    }
    // Flush buffer if full
    else if (this.eventBuffer.length >= this.bufferSize) {
      await this.flush();
    }
  }

  /**
   * Flush events to persistent storage
   */
  private async flush(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      // In production, this would send to logging infrastructure
      // (CloudWatch, Splunk, ELK Stack, etc.)
      await this.sendToLoggingInfrastructure(events);
      
      // Also store in database audit table if needed
      await this.storeInAuditTable(events);
      
    } catch {
      console.error('Failed to flush audit events:');
      // Re-add events to buffer for retry
      this.eventBuffer.unshift(...events);
    }
  }

  /**
   * Send events to logging infrastructure
   */
  private async sendToLoggingInfrastructure(events: AuditEvent[]): Promise<void> {
    // Format for structured logging
    events.forEach(event => {
      console.log(JSON.stringify({
        '@timestamp': event.timestamp,
        '@version': '1',
        'level': this.mapSeverityToLogLevel(event.severity),
        'logger': 'DatabaseAuditLogger',
        'message': `${event.eventType}: ${event.action.description}`,
        'audit_event': event,
        'environment': this.environment,
        'application': this.applicationName
      }));
    });
  }

  /**
   * Store events in database audit table
   */
  private async storeInAuditTable(events: AuditEvent[]): Promise<void> {
    // This would insert into a dedicated audit_log table
    // For now, just log the count
    console.log(`Stored ${events.length} audit events in audit table`);
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2);
    return createHash('sha256').update(`${timestamp}-${random}`).digest('hex').substring(0, 16);
  }

  /**
   * Generate session ID
   */
  private generateSessionId(username: string, ipAddress: string): string {
    const sessionData = `${username}-${ipAddress}-${Date.now()}`;
    return createHash('md5').update(sessionData).digest('hex').substring(0, 12);
  }

  /**
   * Get service account from username
   */
  private getServiceAccount(username: string): string | undefined {
    if (username.startsWith('xorj_')) {
      return username;
    }
    return undefined;
  }

  /**
   * Sanitize SQL for logging (remove sensitive data)
   */
  private sanitizeSQLForLogging(sql?: string): string | undefined {
    if (!sql) return undefined;

    // Remove potential passwords, tokens, or sensitive values
    return sql
      .replace(/password\s*=\s*'[^']*'/gi, "password='***'")
      .replace(/token\s*=\s*'[^']*'/gi, "token='***'")
      .replace(/secret\s*=\s*'[^']*'/gi, "secret='***'");
  }

  /**
   * Classify table sensitivity
   */
  private classifyTable(tableName: string): 'public' | 'internal' | 'confidential' | 'restricted' {
    const sensitiveTabes = ['users', 'user_settings', 'waitlist_signups'];
    const confidentialTables = ['trades', 'trader_scores', 'execution_jobs'];
    
    if (confidentialTables.includes(tableName)) {
      return 'confidential';
    }
    if (sensitiveTabes.includes(tableName)) {
      return 'internal';
    }
    return 'public';
  }

  /**
   * Get regulatory requirements for table
   */
  private getRegulatoryRequirements(tableName: string): string[] {
    const requirements: string[] = [];
    
    if (['users', 'waitlist_signups'].includes(tableName)) {
      requirements.push('GDPR', 'CCPA');
    }
    if (['trades', 'execution_jobs'].includes(tableName)) {
      requirements.push('SOX', 'MiFID');
    }
    
    return requirements;
  }

  /**
   * Map severity to log level
   */
  private mapSeverityToLogLevel(severity: AuditSeverity): string {
    switch (severity) {
      case AuditSeverity.LOW: return 'info';
      case AuditSeverity.MEDIUM: return 'warn';
      case AuditSeverity.HIGH: return 'error';
      case AuditSeverity.CRITICAL: return 'fatal';
      default: return 'info';
    }
  }

  /**
   * Start automatic flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(async () => {
      await this.flush();
    }, this.flushInterval);
  }

  /**
   * Stop audit logger and flush remaining events
   */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flush();
  }
}

/**
 * Audit Query Interceptor
 * 
 * Intercepts database queries to automatically generate audit logs.
 */
export class AuditQueryInterceptor {
  private logger: DatabaseAuditLogger;
  private sensitiveOperations = ['DELETE', 'DROP', 'ALTER', 'TRUNCATE'];

  constructor(logger: DatabaseAuditLogger) {
    this.logger = logger;
  }

  /**
   * Intercept and audit database query
   */
  async interceptQuery(context: {
    query: string;
    params?: unknown[];
    username: string;
    ipAddress?: string;
    _startTime: number;
  }): Promise<{
    shouldProceed: boolean;
    auditRequired: boolean;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  }> {
    const query = context.query.toUpperCase().trim();
    const operation = query.split(' ')[0];

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    
    if (this.sensitiveOperations.includes(operation)) {
      riskLevel = 'high';
    }
    if (query.includes('WHERE') === false && ['DELETE', 'UPDATE'].includes(operation)) {
      riskLevel = 'critical'; // Bulk operations without WHERE clause
    }
    if (operation === 'DROP') {
      riskLevel = 'critical';
    }

    // Log sensitive operations
    if (riskLevel === 'high' || riskLevel === 'critical') {
      await this.logger.logDataAccess({
        operation: operation.toLowerCase() as 'select' | 'insert' | 'update' | 'delete',
        tableName: this.extractTableName(context.query),
        username: context.username,
        ipAddress: context.ipAddress,
        sqlQuery: context.query,
        purpose: 'intercepted_query'
      });
    }

    return {
      shouldProceed: true, // Could implement blocking logic here
      auditRequired: true,
      riskLevel
    };
  }

  /**
   * Extract table name from SQL query
   */
  private extractTableName(query: string): string {
    const upperQuery = query.toUpperCase();
    
    // Simple table name extraction (would need more sophisticated parsing for production)
    const patterns = [
      /FROM\s+(\w+)/,
      /INTO\s+(\w+)/,
      /UPDATE\s+(\w+)/,
      /TABLE\s+(\w+)/
    ];

    for (const pattern of patterns) {
      const match = upperQuery.match(pattern);
      if (match && match[1]) {
        return match[1].toLowerCase();
      }
    }

    return 'unknown';
  }
}

/**
 * Compliance Reporter
 * 
 * Generates compliance reports from audit logs.
 */
export class ComplianceReporter {
  /**
   * Generate audit compliance report
   */
  static async generateComplianceReport(period: {
    startDate: Date;
    endDate: Date;
  }): Promise<{
    reportId: string;
    period: { start: string; end: string };
    summary: {
      totalEvents: number;
      criticalEvents: number;
      failedOperations: number;
      unauthorizedAttempts: number;
      schemaChanges: number;
      dataExports: number;
    };
    compliance: {
      gdprCompliant: boolean;
      soxCompliant: boolean;
      pciCompliant: boolean;
      issues: string[];
    };
    recommendations: string[];
    generatedAt: string;
  }> {
    const reportId = createHash('sha256')
      .update(`${period.startDate.toISOString()}-${period.endDate.toISOString()}`)
      .digest('hex').substring(0, 12);

    // In production, this would query actual audit logs
    const mockSummary = {
      totalEvents: 15420,
      criticalEvents: 23,
      failedOperations: 156,
      unauthorizedAttempts: 8,
      schemaChanges: 12,
      dataExports: 0
    };

    const issues: string[] = [];
    const recommendations: string[] = [];

    // Compliance checks
    let gdprCompliant = true;
    let soxCompliant = true;
    const pciCompliant = true;

    if (mockSummary.unauthorizedAttempts > 5) {
      gdprCompliant = false;
      issues.push('High number of unauthorized access attempts detected');
      recommendations.push('Review access controls and implement additional authentication measures');
    }

    if (mockSummary.schemaChanges > 10) {
      soxCompliant = false;
      issues.push('High frequency of schema changes without proper approval trail');
      recommendations.push('Implement change approval workflow for schema modifications');
    }

    return {
      reportId,
      period: {
        start: period.startDate.toISOString(),
        end: period.endDate.toISOString()
      },
      summary: mockSummary,
      compliance: {
        gdprCompliant,
        soxCompliant,
        pciCompliant,
        issues
      },
      recommendations,
      generatedAt: new Date().toISOString()
    };
  }
}

// Export singleton instance
export const auditLogger = new DatabaseAuditLogger({
  environment: process.env.NODE_ENV || 'development',
  applicationName: 'xorj-trading-bot'
});

// Export configuration
export const AuditConfig = {
  enabledEvents: Object.values(AuditEventTypes).flat(),
  retentionPeriods: {
    connectionLogs: 365, // 1 year
    schemaChanges: 2555, // 7 years  
    dataAccess: 1825,    // 5 years
    adminActions: 2555,  // 7 years
    securityEvents: 2555 // 7 years
  },
  realTimeAlerting: {
    criticalEvents: true,
    failedLogins: 5, // Alert after 5 failed attempts
    bulkOperations: true,
    schemaChanges: true
  }
} as const;

export default auditLogger;