/**
 * Data Encryption Configuration - SR-3 Implementation
 * 
 * Implements data encryption at rest and TLS in transit requirements.
 * Configures provider-managed keys (AWS KMS) and enforces TLS v1.2+.
 * Provides utilities for application-level encryption of sensitive data.
 * 
 * Requirements Addressed:
 * - SR-3: Data Encryption - At rest with provider-managed keys
 * - TLS v1.2+ enforcement for connections in transit
 * - Application-level encryption for sensitive fields
 * 
 * @see PRD Security Requirements SR-3
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash, scrypt } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

// Types for encryption operations
interface EncryptedValue {
  encrypted: string;
  metadata: {
    algorithm: string;
    keyVersion: string;
    timestamp: number;
  };
}

type EncryptableValue = string | number | boolean | object | null | undefined;

/**
 * Database Encryption Configuration
 * 
 * Defines encryption settings for PostgreSQL deployment with AWS RDS/Aurora.
 */
export const DatabaseEncryptionConfig = {
  // Encryption at Rest Configuration
  atRest: {
    enabled: true,
    provider: 'AWS_KMS', // AWS Key Management Service
    
    // KMS Key Configuration
    kmsKey: {
      // Use AWS managed key or customer managed key
      keyId: process.env.DATABASE_KMS_KEY_ID || 'alias/aws/rds',
      region: process.env.AWS_REGION || 'us-east-1',
      
      // Key rotation settings
      automaticRotation: true,
      rotationIntervalDays: 365,
      
      // Key usage permissions
      keyUsage: [
        'ENCRYPT_DECRYPT',
        'GENERATE_DATA_KEY'
      ]
    },
    
    // Performance considerations
    performance: {
      // EBS encryption for storage (AWS RDS)
      ebsEncrypted: true,
      
      // Encryption overhead monitoring
      monitorPerformanceImpact: true
    }
  },

  // Encryption in Transit Configuration
  inTransit: {
    enforced: true,
    
    // TLS Configuration
    tls: {
      minVersion: '1.2',  // Minimum TLS version
      preferredVersion: '1.3',
      
      // Certificate validation
      certificateVerification: 'verify-full', // verify-ca, verify-full
      
      // Cipher suites (preferred)
      allowedCipherSuites: [
        'TLS_AES_256_GCM_SHA384',
        'TLS_CHACHA20_POLY1305_SHA256',
        'TLS_AES_128_GCM_SHA256',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES128-GCM-SHA256'
      ],
      
      // Reject weak ciphers
      rejectedCipherSuites: [
        'RC4',
        'MD5',
        'SHA1',
        'DES',
        '3DES'
      ]
    },
    
    // Connection string parameters for TLS enforcement
    connectionParameters: {
      sslmode: 'require',      // require, verify-ca, verify-full
      sslrootcert: 'system',   // Use system CA certificates
      sslcert: '',             // Client certificate (if required)
      sslkey: '',              // Client private key (if required)
      sslcompression: '0',     // Disable SSL compression (CRIME attack prevention)
      sslsni: '1'              // Enable Server Name Indication
    }
  },

  // Application-Level Encryption
  applicationLevel: {
    enabled: true,
    
    // Fields requiring application-level encryption
    sensitiveFields: [
      'user_settings.risk_profile', // Encrypt trading preferences
      'trades.trade_data',          // Encrypt detailed trade information
      'waitlist_signups.email',     // Encrypt PII
      'execution_jobs.parameters'   // Encrypt job parameters
    ],
    
    // Encryption algorithm settings
    algorithm: 'aes-256-gcm',
    keyDerivation: 'scrypt',
    
    // Key management
    keyRotation: {
      enabled: true,
      intervalDays: 90,
      retainOldKeys: 2 // Keep 2 previous keys for decryption
    }
  }
} as const;

/**
 * TLS Connection Validator
 * 
 * Validates database connections use proper TLS configuration.
 */
export class TLSConnectionValidator {
  /**
   * Validate TLS connection parameters
   * @param connectionString - Database connection string
   * @returns TLS validation results
   */
  static validateTLSConfig(connectionString: string): {
    isCompliant: boolean;
    tlsVersion: string | null;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let tlsVersion: string | null = null;

    try {
      const url = new URL(connectionString);
      const params = url.searchParams;

      // Check SSL mode
      const sslMode = params.get('sslmode') || 'disable';
      
      if (sslMode === 'disable') {
        issues.push('SSL/TLS is disabled - connections are unencrypted');
        recommendations.push('Set sslmode to "require" or higher');
      } else if (sslMode === 'allow' || sslMode === 'prefer') {
        issues.push('SSL/TLS is optional - may allow unencrypted connections');
        recommendations.push('Set sslmode to "require" for mandatory encryption');
      }

      // Check certificate verification
      if (sslMode === 'require') {
        recommendations.push('Consider using "verify-ca" or "verify-full" for certificate validation');
      }

      // Check for SSL compression (security vulnerability)
      const sslCompression = params.get('sslcompression');
      if (sslCompression === '1') {
        issues.push('SSL compression enabled - vulnerable to CRIME attacks');
        recommendations.push('Disable SSL compression by setting sslcompression=0');
      }

      // Check for client certificates
      const sslCert = params.get('sslcert');
      const sslKey = params.get('sslkey');
      
      if (sslCert && !sslKey || !sslCert && sslKey) {
        issues.push('Incomplete client certificate configuration');
        recommendations.push('Provide both sslcert and sslkey for client certificate authentication');
      }

      // Estimate TLS version based on configuration
      if (sslMode !== 'disable') {
        tlsVersion = 'TLS 1.2+'; // Modern PostgreSQL defaults to TLS 1.2+
      }

    } catch {
      issues.push('Invalid connection string format');
      recommendations.push('Use proper PostgreSQL connection string format');
    }

    return {
      isCompliant: issues.length === 0 && tlsVersion !== null,
      tlsVersion,
      issues,
      recommendations
    };
  }

  /**
   * Generate TLS-compliant connection string
   * @param baseConfig - Basic connection configuration
   * @returns Secure connection string with TLS enforcement
   */
  static generateSecureConnectionString(baseConfig: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  }): string {
    const { host, port, database, user, password } = baseConfig;
    const tlsConfig = DatabaseEncryptionConfig.inTransit.connectionParameters;

    const params = new URLSearchParams({
      ...tlsConfig,
      application_name: 'xorj-trading-bot',
      connect_timeout: '10',
      statement_timeout: '30000',
      lock_timeout: '10000'
    });

    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}?${params.toString()}`;
  }
}

/**
 * Application-Level Encryption Manager
 * 
 * Handles encryption of sensitive data at the application level.
 */
export class ApplicationEncryption {
  private algorithm = 'aes-256-gcm';
  private keyLength = 32; // 256 bits
  private ivLength = 16;  // 128 bits
  private tagLength = 16; // 128 bits
  private saltLength = 32; // 256 bits

  /**
   * Encrypt sensitive data
   * @param plaintext - Data to encrypt
   * @param masterKey - Encryption key (should be from key management service)
   * @returns Encrypted data with metadata
   */
  async encrypt(plaintext: string, masterKey: Buffer): Promise<{
    encrypted: string;
    metadata: {
      algorithm: string;
      keyId: string;
      timestamp: string;
    };
  }> {
    try {
      // Generate random IV and salt
      const iv = randomBytes(this.ivLength);
      const salt = randomBytes(this.saltLength);

      // Derive encryption key using scrypt
      const derivedKey = await scryptAsync(masterKey, salt, this.keyLength) as Buffer;

      // Create cipher
      const cipher = createCipheriv(this.algorithm, derivedKey, iv);

      // Encrypt data
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get authentication tag
      const tag = cipher.getAuthTag();

      // Combine all components
      const encryptedData = Buffer.concat([
        salt,
        iv,
        tag,
        Buffer.from(encrypted, 'hex')
      ]).toString('base64');

      return {
        encrypted: encryptedData,
        metadata: {
          algorithm: this.algorithm,
          keyId: this.generateKeyId(masterKey),
          timestamp: new Date().toISOString()
        }
      };
    } catch {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt sensitive data
   * @param encryptedData - Data to decrypt
   * @param masterKey - Decryption key
   * @returns Decrypted plaintext
   */
  async decrypt(encryptedData: string, masterKey: Buffer): Promise<string> {
    try {
      // Parse encrypted data
      const combined = Buffer.from(encryptedData, 'base64');
      
      const salt = combined.subarray(0, this.saltLength);
      const iv = combined.subarray(this.saltLength, this.saltLength + this.ivLength);
      const tag = combined.subarray(this.saltLength + this.ivLength, this.saltLength + this.ivLength + this.tagLength);
      const encrypted = combined.subarray(this.saltLength + this.ivLength + this.tagLength);

      // Derive decryption key
      const derivedKey = await scryptAsync(masterKey, salt, this.keyLength) as Buffer;

      // Create decipher
      const decipher = createDecipheriv(this.algorithm, derivedKey, iv);
      decipher.setAuthTag(tag);

      // Decrypt data
      let decrypted = decipher.update(encrypted, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Generate key identifier for tracking
   */
  private generateKeyId(key: Buffer): string {
    return createHash('sha256').update(key).digest('hex').substring(0, 8);
  }

  /**
   * Encrypt database field value
   * @param tableName - Table containing the field
   * @param fieldName - Field name
   * @param value - Value to encrypt
   * @param masterKey - Encryption key
   * @returns Encrypted value if field is sensitive, otherwise original value
   */
  async encryptFieldValue(
    tableName: string,
    fieldName: string, 
    value: EncryptableValue,
    masterKey: Buffer
  ): Promise<EncryptableValue | EncryptedValue> {
    const fieldPath = `${tableName}.${fieldName}`;
    
    if (DatabaseEncryptionConfig.applicationLevel.sensitiveFields.includes(fieldPath)) {
      if (typeof value === 'string') {
        const result = await this.encrypt(value, masterKey);
        return {
          encrypted: result.encrypted,
          metadata: result.metadata
        };
      } else if (typeof value === 'object') {
        const result = await this.encrypt(JSON.stringify(value), masterKey);
        return {
          encrypted: result.encrypted,
          metadata: result.metadata
        };
      }
    }

    return value;
  }

  /**
   * Decrypt database field value
   * @param tableName - Table containing the field
   * @param fieldName - Field name
   * @param value - Value to decrypt
   * @param masterKey - Decryption key
   * @returns Decrypted value if field was encrypted, otherwise original value
   */
  async decryptFieldValue(
    tableName: string,
    fieldName: string,
    value: EncryptableValue | EncryptedValue,
    masterKey: Buffer
  ): Promise<EncryptableValue> {
    if (value && typeof value === 'object' && value.encrypted && value.metadata) {
      try {
        const decrypted = await this.decrypt(value.encrypted, masterKey);
        
        // Try to parse as JSON if it looks like an object
        if (decrypted.startsWith('{') || decrypted.startsWith('[')) {
          try {
            return JSON.parse(decrypted);
          } catch {
            return decrypted;
          }
        }
        
        return decrypted;
      } catch {
        console.error(`Failed to decrypt field ${tableName}.${fieldName}:`);
        throw error;
      }
    }

    return value;
  }
}

/**
 * Key Management Service Integration
 * 
 * Integrates with cloud provider key management services.
 */
export class KeyManagementService {
  private keyCache = new Map<string, { key: Buffer; expiry: number }>();
  private cacheTimeout = 3600000; // 1 hour

  /**
   * Get encryption key from KMS
   * @param keyId - KMS key identifier
   * @returns Encryption key buffer
   */
  async getEncryptionKey(keyId: string = 'default'): Promise<Buffer> {
    // Check cache first
    const cached = this.keyCache.get(keyId);
    if (cached && Date.now() < cached.expiry) {
      return cached.key;
    }

    try {
      // In production, this would call AWS KMS or similar
      const key = await this.fetchKeyFromKMS(keyId);
      
      // Cache the key
      this.keyCache.set(keyId, {
        key,
        expiry: Date.now() + this.cacheTimeout
      });

      return key;
    } catch {
      console.error(`Failed to retrieve encryption key ${keyId}:`);
      throw new Error(`Key retrieval failed: ${error.message}`);
    }
  }

  /**
   * Generate new data encryption key
   * @param keyId - KMS key for encrypting the data key
   * @returns Data encryption key
   */
  async generateDataKey(keyId: string = 'default'): Promise<{
    plaintextKey: Buffer;
    encryptedKey: string;
  }> {
    // Generate random key
    const plaintextKey = randomBytes(32); // 256-bit key

    // Encrypt with KMS (in production)
    const encryptedKey = await this.encryptWithKMS(plaintextKey, keyId);

    return {
      plaintextKey,
      encryptedKey
    };
  }

  /**
   * Fetch key from AWS KMS (placeholder)
   */
  private async fetchKeyFromKMS(/* _keyId: string */): Promise<Buffer> {
    // In production, this would use AWS KMS SDK
    // For now, derive from environment variable
    const masterPassword = process.env.DATABASE_MASTER_KEY || 'development-key-not-for-production';
    return Buffer.from(createHash('sha256').update(masterPassword).digest());
  }

  /**
   * Encrypt data key with KMS (placeholder)
   */
  private async encryptWithKMS(key: Buffer /* _keyId: string */): Promise<string> {
    // In production, this would use AWS KMS encrypt operation
    return key.toString('base64');
  }

  /**
   * Rotate encryption keys
   * @param keyId - Key to rotate
   * @returns New key information
   */
  async rotateKey(keyId: string): Promise<{
    newKeyId: string;
    rotationTimestamp: string;
  }> {
    // Clear cached key
    this.keyCache.delete(keyId);

    // In production, this would trigger KMS key rotation
    const newKeyId = `${keyId}-rotated-${Date.now()}`;

    return {
      newKeyId,
      rotationTimestamp: new Date().toISOString()
    };
  }
}

/**
 * Encryption Compliance Monitor
 * 
 * Monitors and validates encryption compliance.
 */
export class EncryptionComplianceMonitor {
  /**
   * Generate encryption compliance report
   */
  static generateComplianceReport(): {
    timestamp: string;
    atRestEncryption: {
      enabled: boolean;
      provider: string;
      keyRotation: boolean;
      complianceScore: number;
    };
    inTransitEncryption: {
      enforced: boolean;
      tlsVersion: string;
      certificateValidation: string;
      complianceScore: number;
    };
    applicationLevelEncryption: {
      enabled: boolean;
      sensitiveFieldsCount: number;
      keyRotationEnabled: boolean;
      complianceScore: number;
    };
    overallComplianceScore: number;
    recommendations: string[];
  } {
    const config = DatabaseEncryptionConfig;
    
    const atRestScore = config.atRest.enabled ? 
      (config.atRest.kmsKey.automaticRotation ? 100 : 80) : 0;
    
    const inTransitScore = config.inTransit.enforced ?
      (config.inTransit.tls.minVersion === '1.2' ? 90 : 100) : 0;

    const appLevelScore = config.applicationLevel.enabled ?
      (config.applicationLevel.keyRotation.enabled ? 100 : 80) : 0;

    const overallScore = (atRestScore + inTransitScore + appLevelScore) / 3;

    const recommendations: string[] = [];
    
    if (!config.atRest.enabled) {
      recommendations.push('Enable encryption at rest using AWS KMS or equivalent');
    }
    if (!config.inTransit.enforced) {
      recommendations.push('Enforce TLS encryption for all database connections');
    }
    if (config.inTransit.tls.minVersion < '1.3') {
      recommendations.push('Upgrade to TLS 1.3 for enhanced security');
    }
    if (!config.applicationLevel.keyRotation.enabled) {
      recommendations.push('Enable automatic key rotation for application-level encryption');
    }

    return {
      timestamp: new Date().toISOString(),
      atRestEncryption: {
        enabled: config.atRest.enabled,
        provider: config.atRest.provider,
        keyRotation: config.atRest.kmsKey.automaticRotation,
        complianceScore: atRestScore
      },
      inTransitEncryption: {
        enforced: config.inTransit.enforced,
        tlsVersion: config.inTransit.tls.minVersion,
        certificateValidation: config.inTransit.connectionParameters.sslmode,
        complianceScore: inTransitScore
      },
      applicationLevelEncryption: {
        enabled: config.applicationLevel.enabled,
        sensitiveFieldsCount: config.applicationLevel.sensitiveFields.length,
        keyRotationEnabled: config.applicationLevel.keyRotation.enabled,
        complianceScore: appLevelScore
      },
      overallComplianceScore: overallScore,
      recommendations
    };
  }
}

// Export singleton instances
export const applicationEncryption = new ApplicationEncryption();
export const keyManagementService = new KeyManagementService();

// Export configuration for infrastructure deployment
export default DatabaseEncryptionConfig;