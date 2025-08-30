/**
 * Network Security Configuration - SR-1 Implementation
 * 
 * Implements network security requirements for PostgreSQL database deployment.
 * Ensures database is isolated within private network with restricted access.
 * 
 * Requirements Addressed:
 * - SR-1: Network Security - Private VPC deployment with firewall rules
 * - No public IP address exposure
 * - Restricted access via security groups
 * - Backend service authentication
 * 
 * @see PRD Security Requirements SR-1
 */

import { createHash } from 'crypto';

/**
 * Network Security Configuration
 * 
 * Defines the network topology and security requirements for database deployment.
 * This configuration should be used by infrastructure-as-code tools (Terraform, CDK).
 */
export const NetworkSecurityConfig = {
  // VPC Configuration - Private Network Isolation
  vpc: {
    name: 'xorj-trading-bot-vpc',
    cidrBlock: '10.0.0.0/16',
    enableDnsSupport: true,
    enableDnsHostnames: true,
    
    // Private subnets for database deployment
    privateSubnets: [
      {
        name: 'xorj-db-subnet-1a',
        cidrBlock: '10.0.1.0/24',
        availabilityZone: 'us-east-1a'
      },
      {
        name: 'xorj-db-subnet-1b', 
        cidrBlock: '10.0.2.0/24',
        availabilityZone: 'us-east-1b'
      },
      {
        name: 'xorj-db-subnet-1c',
        cidrBlock: '10.0.3.0/24',
        availabilityZone: 'us-east-1c'
      }
    ],

    // Public subnets for NAT gateways (if needed for outbound traffic)
    publicSubnets: [
      {
        name: 'xorj-public-subnet-1a',
        cidrBlock: '10.0.101.0/24',
        availabilityZone: 'us-east-1a'
      }
    ]
  },

  // Database Security Group - Firewall Rules
  databaseSecurityGroup: {
    name: 'xorj-database-sg',
    description: 'Security group for XORJ Trading Bot PostgreSQL database',
    
    // Inbound rules - ONLY allow specific backend services
    inboundRules: [
      {
        description: 'PostgreSQL from API service',
        protocol: 'tcp',
        port: 5432,
        sourceSecurityGroupName: 'xorj-api-service-sg',
        sourceType: 'security_group'
      },
      {
        description: 'PostgreSQL from Quantitative Engine',
        protocol: 'tcp', 
        port: 5432,
        sourceSecurityGroupName: 'xorj-quant-engine-sg',
        sourceType: 'security_group'
      },
      {
        description: 'PostgreSQL from Bot Execution Service',
        protocol: 'tcp',
        port: 5432,
        sourceSecurityGroupName: 'xorj-bot-execution-sg',
        sourceType: 'security_group'
      },
      {
        description: 'PostgreSQL from Admin/Migration tools',
        protocol: 'tcp',
        port: 5432,
        sourceSecurityGroupName: 'xorj-admin-sg',
        sourceType: 'security_group'
      }
    ],

    // Outbound rules - Deny all by default (database should not initiate outbound)
    outboundRules: [
      {
        description: 'Deny all outbound traffic',
        protocol: '-1',
        port: -1,
        destination: '0.0.0.0/0',
        action: 'deny'
      }
    ]
  },

  // Backend Service Security Groups
  serviceSecurityGroups: [
    {
      name: 'xorj-api-service-sg',
      description: 'Security group for XORJ API service',
      allowDatabaseAccess: true,
      accessLevel: 'read_write_user_data' // Limited write access
    },
    {
      name: 'xorj-quant-engine-sg', 
      description: 'Security group for Quantitative Engine',
      allowDatabaseAccess: true,
      accessLevel: 'read_write_scores' // Can write to scoring tables
    },
    {
      name: 'xorj-bot-execution-sg',
      description: 'Security group for Bot Execution Service', 
      allowDatabaseAccess: true,
      accessLevel: 'read_write_trades' // Can write to trade execution tables
    },
    {
      name: 'xorj-admin-sg',
      description: 'Security group for administrative access',
      allowDatabaseAccess: true,
      accessLevel: 'admin' // Full access for migrations and maintenance
    }
  ]
} as const;

/**
 * Network Security Validation
 * 
 * Validates that the current network configuration meets security requirements.
 */
export class NetworkSecurityValidator {
  /**
   * Validate database connection is within private network
   * @param connectionString - Database connection string or host
   * @returns ValidationResult with security compliance status
   */
  static validatePrivateNetworkAccess(connectionString: string): {
    isCompliant: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Parse connection details
    const host = this.extractHost(connectionString);
    
    // Check for public IP indicators
    if (this.isPublicIP(host)) {
      issues.push('Database host appears to be a public IP address');
      recommendations.push('Deploy database within private VPC subnets');
    }

    // Check for insecure hostname patterns
    if (host.includes('public') || host.includes('external')) {
      issues.push('Database hostname suggests public accessibility');
      recommendations.push('Use private DNS names or internal hostnames');
    }

    // Check for standard public cloud database endpoints
    const publicProviderPatterns = [
      /\.amazonaws\.com$/,
      /\.database\.azure\.com$/,
      /\.googleapis\.com$/
    ];

    const hasPublicEndpoint = publicProviderPatterns.some(pattern => 
      pattern.test(host)
    );

    if (hasPublicEndpoint) {
      // This is OK if it's a managed service with private connectivity
      recommendations.push('Ensure managed database service uses VPC endpoints or private connectivity');
    }

    return {
      isCompliant: issues.length === 0,
      issues,
      recommendations
    };
  }

  /**
   * Extract host from connection string
   */
  private static extractHost(connectionString: string): string {
    try {
      // Handle various connection string formats
      if (connectionString.startsWith('postgresql://')) {
        const url = new URL(connectionString);
        return url.hostname;
      }
      
      // Handle environment variable format
      const hostMatch = connectionString.match(/host[=\s]+([^\s;]+)/i);
      if (hostMatch) {
        return hostMatch[1];
      }

      // Fallback to the string itself if it looks like a hostname
      if (!connectionString.includes(' ') && connectionString.includes('.')) {
        return connectionString;
      }

      return 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Check if an IP/hostname is publicly accessible
   */
  private static isPublicIP(host: string): boolean {
    // Check for obvious public IPs (simplified check)
    const ipPattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = host.match(ipPattern);
    
    if (match) {
      const octets = match.slice(1).map(Number);
      
      // Check for private IP ranges
      const [a, b, c, d] = octets;
      
      // 10.0.0.0/8
      if (a === 10) return false;
      
      // 172.16.0.0/12
      if (a === 172 && b >= 16 && b <= 31) return false;
      
      // 192.168.0.0/16
      if (a === 192 && b === 168) return false;
      
      // 127.0.0.0/8 (localhost)
      if (a === 127) return false;
      
      // If it's an IP but not private, it's likely public
      return true;
    }
    
    // For hostnames, assume private if contains private indicators
    const privateIndicators = ['internal', 'private', 'local', 'vpc'];
    return !privateIndicators.some(indicator => 
      host.toLowerCase().includes(indicator)
    );
  }

  /**
   * Generate network security compliance report
   */
  static generateComplianceReport(environment: string): {
    environment: string;
    timestamp: string;
    compliance: {
      networkIsolation: boolean;
      accessRestriction: boolean;
      securityGroups: boolean;
    };
    recommendations: string[];
  } {
    return {
      environment,
      timestamp: new Date().toISOString(),
      compliance: {
        networkIsolation: false, // Must be verified by infrastructure
        accessRestriction: false, // Must be verified by infrastructure  
        securityGroups: false // Must be verified by infrastructure
      },
      recommendations: [
        'Deploy PostgreSQL in private VPC subnets without public IP',
        'Configure security groups to allow only specific backend services',
        'Use VPC endpoints for managed database services',
        'Implement network ACLs for additional layer of security',
        'Monitor network access logs for unauthorized connection attempts',
        'Regular security group audits to ensure least privilege access'
      ]
    };
  }
}

/**
 * Connection String Builder for Secure Connections
 * 
 * Builds database connection strings with security best practices.
 */
export class SecureConnectionBuilder {
  /**
   * Build secure PostgreSQL connection string
   * @param config - Database configuration parameters
   * @returns Secure connection string with TLS enforcement
   */
  static buildSecureConnectionString(config: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    sslMode?: 'require' | 'verify-ca' | 'verify-full';
    connectTimeout?: number;
    idleTimeout?: number;
  }): string {
    const {
      host,
      port = 5432,
      database,
      user,
      password,
      sslMode = 'require', // Enforce TLS
      connectTimeout = 10000,
      idleTimeout = 30000
    } = config;

    // Build connection string with security parameters
    const params = new URLSearchParams({
      sslmode: sslMode,
      connect_timeout: (connectTimeout / 1000).toString(),
      idle_in_transaction_session_timeout: idleTimeout.toString(),
      application_name: 'xorj-trading-bot',
      // Ensure TLS v1.2 minimum
      sslrootcert: 'system', 
      sslcert: '', // Client certificate if required
      sslkey: ''   // Client key if required
    });

    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}?${params.toString()}`;
  }

  /**
   * Validate connection string security
   * @param connectionString - Connection string to validate
   * @returns Security validation results
   */
  static validateConnectionSecurity(connectionString: string): {
    isSecure: boolean;
    issues: string[];
    tlsEnforced: boolean;
    hasTimeout: boolean;
  } {
    const issues: string[] = [];
    let tlsEnforced = false;
    let hasTimeout = false;

    try {
      const url = new URL(connectionString);
      const params = url.searchParams;

      // Check SSL/TLS enforcement
      const sslMode = params.get('sslmode');
      if (!sslMode || sslMode === 'disable') {
        issues.push('SSL/TLS not enforced - connections may be unencrypted');
      } else if (['require', 'verify-ca', 'verify-full'].includes(sslMode)) {
        tlsEnforced = true;
      }

      // Check for connection timeout
      if (params.get('connect_timeout')) {
        hasTimeout = true;
      } else {
        issues.push('No connection timeout configured - may cause hanging connections');
      }

      // Check for application name
      if (!params.get('application_name')) {
        issues.push('No application name specified - harder to audit connections');
      }

      // Warn about password in URL (should use secrets manager)
      if (url.password) {
        issues.push('Password in connection string - should use secrets manager');
      }

    } catch (error) {
      issues.push('Invalid connection string format');
    }

    return {
      isSecure: issues.length === 0,
      issues,
      tlsEnforced,
      hasTimeout
    };
  }
}

/**
 * IP Allowlist Manager
 * 
 * Manages allowed IP addresses/ranges for database access.
 * Should be used in conjunction with security group rules.
 */
export class IPAllowlistManager {
  private allowedRanges: string[] = [];

  constructor(initialRanges: string[] = []) {
    this.allowedRanges = initialRanges;
  }

  /**
   * Add allowed IP range
   * @param cidrRange - CIDR notation IP range (e.g., '10.0.1.0/24')
   */
  addAllowedRange(cidrRange: string): void {
    if (this.isValidCIDR(cidrRange)) {
      this.allowedRanges.push(cidrRange);
    } else {
      throw new Error(`Invalid CIDR range: ${cidrRange}`);
    }
  }

  /**
   * Check if IP address is allowed
   * @param ipAddress - IP address to check
   * @returns True if IP is within allowed ranges
   */
  isIPAllowed(ipAddress: string): boolean {
    return this.allowedRanges.some(range => this.isIPInRange(ipAddress, range));
  }

  /**
   * Get security group rules for current allowlist
   * @returns Array of security group rule configurations
   */
  getSecurityGroupRules(): Array<{
    protocol: string;
    port: number;
    source: string;
    description: string;
  }> {
    return this.allowedRanges.map((range, index) => ({
      protocol: 'tcp',
      port: 5432,
      source: range,
      description: `PostgreSQL access for approved range ${index + 1}`
    }));
  }

  /**
   * Basic CIDR validation
   */
  private isValidCIDR(cidr: string): boolean {
    const cidrPattern = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
    return cidrPattern.test(cidr);
  }

  /**
   * Basic IP range check (simplified implementation)
   */
  private isIPInRange(ip: string, cidr: string): boolean {
    // This is a simplified implementation
    // In production, use a proper IP address library
    const [network, prefixLength] = cidr.split('/');
    const prefix = parseInt(prefixLength, 10);
    
    // Convert IP addresses to numbers for comparison
    const ipNum = this.ipToNumber(ip);
    const networkNum = this.ipToNumber(network);
    const mask = (0xffffffff << (32 - prefix)) >>> 0;
    
    return (ipNum & mask) === (networkNum & mask);
  }

  /**
   * Convert IP address to number
   */
  private ipToNumber(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  }
}

/**
 * Network Security Monitoring
 * 
 * Utilities for monitoring network security compliance.
 */
export const NetworkMonitoring = {
  /**
   * Generate network access hash for monitoring
   * @param connectionInfo - Connection information to hash
   * @returns Hash for monitoring unauthorized access patterns
   */
  generateAccessHash(connectionInfo: {
    sourceIP: string;
    timestamp: number;
    user: string;
  }): string {
    const data = `${connectionInfo.sourceIP}:${connectionInfo.timestamp}:${connectionInfo.user}`;
    return createHash('sha256').update(data).digest('hex');
  },

  /**
   * Log security event
   * @param event - Security event to log
   */
  logSecurityEvent(event: {
    type: 'connection_attempt' | 'access_denied' | 'unusual_pattern';
    sourceIP: string;
    timestamp: Date;
    details: any;
  }): void {
    // In production, this should integrate with your logging/monitoring system
    console.log(`[SECURITY] ${event.type.toUpperCase()}:`, {
      timestamp: event.timestamp.toISOString(),
      sourceIP: event.sourceIP,
      details: event.details
    });
  }
};

// Export configuration for infrastructure tools
export default NetworkSecurityConfig;