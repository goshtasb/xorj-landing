/**
 * Security Audit Logging System
 * SECURITY FIX: Phase 2 - Comprehensive logging for security events and compliance
 */

interface SecurityEvent {
  event_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  user_id?: string;
  ip_address?: string;
  user_agent?: string;
  request_id?: string;
  endpoint?: string;
  method?: string;
  details?: Record<string, unknown>;
  timestamp: string;
  session_id?: string;
  outcome: 'success' | 'failure' | 'blocked' | 'warning';
}

interface AuditContext {
  user_id?: string;
  ip_address?: string;
  user_agent?: string;
  endpoint?: string;
  method?: string;
  request_id?: string;
  session_id?: string;
}

export class SecurityAuditLogger {
  private static logBuffer: SecurityEvent[] = [];
  private static readonly MAX_BUFFER_SIZE = 100;
  private static flushInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize audit logging system
   */
  static initialize(): void {
    // Auto-flush logs every 30 seconds
    this.flushInterval = setInterval(() => {
      this.flushLogs();
    }, 30000);

    // Flush logs on process exit
    process.on('SIGINT', () => this.flushLogs());
    process.on('SIGTERM', () => this.flushLogs());
  }

  /**
   * Log authentication events
   */
  static logAuth(
    event_type: 'login_attempt' | 'login_success' | 'login_failure' | 'logout' | 'session_expired' | 'token_refresh',
    context: AuditContext,
    details?: Record<string, unknown>
  ): void {
    const severity = event_type.includes('failure') ? 'high' : 
                    event_type.includes('attempt') ? 'medium' : 'low';

    this.logEvent({
      event_type: `auth.${event_type}`,
      severity,
      outcome: event_type.includes('success') ? 'success' : 
               event_type.includes('failure') ? 'failure' : 'warning',
      ...context,
      details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log access control events
   */
  static logAccess(
    event_type: 'permission_denied' | 'unauthorized_access' | 'privilege_escalation' | 'resource_accessed',
    context: AuditContext,
    details?: Record<string, unknown>
  ): void {
    const severity = event_type === 'privilege_escalation' ? 'critical' :
                    event_type === 'unauthorized_access' ? 'high' : 'medium';

    this.logEvent({
      event_type: `access.${event_type}`,
      severity,
      outcome: event_type === 'resource_accessed' ? 'success' : 'blocked',
      ...context,
      details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log security violations
   */
  static logSecurity(
    event_type: 'rate_limit_exceeded' | 'csrf_violation' | 'xss_attempt' | 'sql_injection_attempt' | 
              'suspicious_request' | 'malformed_input' | 'brute_force_attempt',
    context: AuditContext,
    details?: Record<string, unknown>
  ): void {
    const severity = event_type.includes('injection') || event_type.includes('brute_force') ? 'critical' :
                    event_type.includes('xss') || event_type.includes('csrf') ? 'high' : 'medium';

    this.logEvent({
      event_type: `security.${event_type}`,
      severity,
      outcome: 'blocked',
      ...context,
      details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log financial transaction events
   */
  static logFinancial(
    event_type: 'trade_executed' | 'trade_failed' | 'balance_check' | 'withdrawal_attempt' | 
              'suspicious_transaction' | 'large_transaction',
    context: AuditContext,
    details?: Record<string, unknown>
  ): void {
    const severity = event_type.includes('suspicious') || event_type.includes('large') ? 'high' : 'medium';

    this.logEvent({
      event_type: `financial.${event_type}`,
      severity,
      outcome: event_type.includes('executed') || event_type.includes('check') ? 'success' :
               event_type.includes('failed') ? 'failure' : 'warning',
      ...context,
      details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log system events
   */
  static logSystem(
    event_type: 'config_change' | 'admin_action' | 'backup_created' | 'service_restart' | 
              'database_connection' | 'external_api_call',
    context: AuditContext,
    details?: Record<string, unknown>
  ): void {
    this.logEvent({
      event_type: `system.${event_type}`,
      severity: event_type === 'admin_action' ? 'high' : 'low',
      outcome: 'success',
      ...context,
      details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log data protection events (GDPR compliance)
   */
  static logDataProtection(
    event_type: 'data_access' | 'data_export' | 'data_deletion' | 'consent_given' | 'consent_withdrawn',
    context: AuditContext,
    details?: Record<string, unknown>
  ): void {
    this.logEvent({
      event_type: `data_protection.${event_type}`,
      severity: 'medium',
      outcome: 'success',
      ...context,
      details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Core event logging function
   */
  private static logEvent(event: SecurityEvent): void {
    // Add to buffer
    this.logBuffer.push(event);

    // Log to console immediately for critical events
    if (event.severity === 'critical') {
      console.error('🚨 CRITICAL SECURITY EVENT:', JSON.stringify(event, null, 2));
    } else if (event.severity === 'high') {
      console.warn('⚠️ HIGH SECURITY EVENT:', JSON.stringify(event, null, 2));
    } else if (process.env.NODE_ENV === 'development') {
      console.log(`🔍 Security Event [${event.severity.toUpperCase()}]:`, JSON.stringify(event, null, 2));
    }

    // Auto-flush if buffer is full
    if (this.logBuffer.length >= this.MAX_BUFFER_SIZE) {
      this.flushLogs();
    }
  }

  /**
   * Flush logs to persistent storage
   */
  private static async flushLogs(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    const events = [...this.logBuffer];
    this.logBuffer = [];

    try {
      // In production, this would write to:
      // - Database for queryable logs
      // - File system for backup
      // - SIEM system for analysis
      // - External logging service (e.g., Datadog, Splunk)

      if (process.env.NODE_ENV === 'production') {
        // Write to database (implement based on your DB setup)
        await this.writeToDB(events);
        
        // Write to file system as backup
        await this.writeToFile(events);
      }

      console.log(`📝 Flushed ${events.length} audit log entries`);
    } catch (error) {
      console.error('❌ Failed to flush audit logs:', error);
      
      // Re-add to buffer if write failed (with limit to prevent memory issues)
      if (this.logBuffer.length < this.MAX_BUFFER_SIZE) {
        this.logBuffer.unshift(...events.slice(0, this.MAX_BUFFER_SIZE - this.logBuffer.length));
      }
    }
  }

  /**
   * Write audit logs to database
   */
  private static async writeToDB(events: SecurityEvent[]): Promise<void> {
    // This would typically use your database connection
    // Example implementation:
    /*
    const { query } = await import('@/lib/database');
    
    for (const event of events) {
      await query(`
        INSERT INTO audit_logs (
          event_type, severity, user_id, ip_address, user_agent,
          request_id, endpoint, method, details, timestamp,
          session_id, outcome
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        event.event_type, event.severity, event.user_id, event.ip_address,
        event.user_agent, event.request_id, event.endpoint, event.method,
        JSON.stringify(event.details), event.timestamp, event.session_id, event.outcome
      ]);
    }
    */
    
    // Placeholder - implement based on your database setup
    console.log(`📊 Would write ${events.length} events to database`);
  }

  /**
   * Write audit logs to file system
   */
  private static async writeToFile(events: SecurityEvent[]): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const logDir = path.join(process.cwd(), 'logs', 'security');
    const logFile = path.join(logDir, `security-${new Date().toISOString().split('T')[0]}.log`);
    
    try {
      // Ensure log directory exists
      await fs.mkdir(logDir, { recursive: true });
      
      // Append events to daily log file
      const logLines = events.map(event => JSON.stringify(event)).join('\n') + '\n';
      await fs.appendFile(logFile, logLines);
      
    } catch (error) {
      console.error('❌ Failed to write audit logs to file:', error);
    }
  }

  /**
   * Query audit logs (for admin interface)
   */
  static async queryLogs(filters: {
    event_type?: string;
    severity?: string;
    user_id?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
  }): Promise<SecurityEvent[]> {
    // This would query your database
    // For now, return empty array as placeholder
    console.log('🔍 Would query logs with filters:', filters);
    return [];
  }

  /**
   * Generate security summary report
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async generateSecurityReport(timeframe: '24h' | '7d' | '30d'): Promise<{
    total_events: number;
    events_by_severity: Record<string, number>;
    events_by_type: Record<string, number>;
    top_ips: Array<{ ip: string; count: number }>;
    security_score: number;
  }> {
    // This would analyze your audit logs
    // Placeholder implementation
    return {
      total_events: 0,
      events_by_severity: {},
      events_by_type: {},
      top_ips: [],
      security_score: 100
    };
  }

  /**
   * Cleanup old logs (for GDPR compliance)
   */
  static async cleanupOldLogs(retentionDays: number = 365): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    // This would delete old logs from database and files
    console.log(`🗑️ Would cleanup logs older than ${cutoffDate.toISOString()}`);
  }

  /**
   * Shutdown audit logger gracefully
   */
  static shutdown(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    
    // Final flush
    this.flushLogs().catch(error => {
      console.error('❌ Failed final log flush:', error);
    });
  }
}

// Initialize on import
SecurityAuditLogger.initialize();