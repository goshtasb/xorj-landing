/**
 * Secure Environment Initialization
 * Validates and initializes environment variables with security checks
 */

import { credentialValidator } from './credentialValidator';

interface EnvironmentConfig {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  config: {
    jwt: {
      secret: string;
      algorithm: string;
    };
    database: {
      url: string;
      ssl: boolean;
    };
    solana: {
      rpcUrl: string;
      network: string;
    };
    redis?: {
      url: string;
    };
  };
}

export class SecureEnvironment {
  private static instance: SecureEnvironment;
  private initialized = false;
  private config: EnvironmentConfig | null = null;

  public static getInstance(): SecureEnvironment {
    if (!SecureEnvironment.instance) {
      SecureEnvironment.instance = new SecureEnvironment();
    }
    return SecureEnvironment.instance;
  }

  /**
   * Initialize environment with security validation
   */
  public initialize(): EnvironmentConfig {
    if (this.initialized && this.config) {
      return this.config;
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Skip strict validation in development mode for easier local testing
    const isDevelopment = process.env.NODE_ENV !== 'production';

    // Validate environment
    const envValidation = credentialValidator.validateEnvironment(process.env);
    if (!isDevelopment) {
      errors.push(...envValidation.errors);
    }
    warnings.push(...envValidation.warnings);

    // Check for missing required variables
    if (envValidation.missingRequired.length > 0) {
      errors.push(`Missing required environment variables: ${envValidation.missingRequired.join(', ')}`);
    }

    // Validate JWT Secret specifically
    const jwtSecret = this.getRequiredEnv('JWT_SECRET');
    if (jwtSecret && !isDevelopment) {
      const jwtValidation = credentialValidator.validateJWTSecret(jwtSecret);
      if (!jwtValidation.isValid) {
        errors.push(`JWT_SECRET validation failed: ${jwtValidation.errors.join(', ')}`);
      }
      warnings.push(...jwtValidation.warnings);
    }

    // Validate Database URL
    const databaseUrl = this.getRequiredEnv('DATABASE_URL');
    if (databaseUrl && !isDevelopment) {
      const dbValidation = this.validateDatabaseUrl(databaseUrl);
      if (!dbValidation.isValid) {
        errors.push(`DATABASE_URL validation failed: ${dbValidation.error}`);
      }
    }

    // Check for production environment security
    const nodeEnv = process.env.NODE_ENV || 'development';
    if (nodeEnv === 'production') {
      this.validateProductionSecurity(errors, warnings);
    }

    // Build configuration
    this.config = {
      isValid: errors.length === 0,
      errors,
      warnings,
      config: {
        jwt: {
          secret: jwtSecret || '',
          algorithm: 'HS256'
        },
        database: {
          url: databaseUrl || '',
          ssl: this.isProduction()
        },
        solana: {
          rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
          network: process.env.SOLANA_NETWORK || 'devnet'
        },
        redis: process.env.REDIS_URL ? {
          url: process.env.REDIS_URL
        } : undefined
      }
    };

    // Log initialization results (sanitized)
    if (this.config.isValid) {
      console.log('✅ Environment initialized successfully');
      if (warnings.length > 0) {
        console.warn('⚠️ Environment warnings:', warnings);
      }
    } else {
      console.error('❌ Environment initialization failed:', errors);
    }

    this.initialized = true;
    return this.config;
  }

  /**
   * Get required environment variable with validation
   */
  private getRequiredEnv(key: string): string | null {
    const value = process.env[key];
    if (!value) {
      console.error(`❌ Required environment variable ${key} is not set`);
      return null;
    }
    return value;
  }

  /**
   * Validate database URL format
   */
  private validateDatabaseUrl(url: string): { isValid: boolean; error?: string } {
    try {
      const parsed = new URL(url);
      
      if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
        return { isValid: false, error: 'Database URL must use postgresql:// or postgres:// protocol' };
      }

      if (!parsed.hostname) {
        return { isValid: false, error: 'Database URL must include hostname' };
      }

      if (!parsed.pathname || parsed.pathname === '/') {
        return { isValid: false, error: 'Database URL must include database name' };
      }

      // Check for weak credentials in URL
      if (parsed.password) {
        const pwValidation = credentialValidator.validateJWTSecret(parsed.password);
        if (pwValidation.securityScore < 6) {
          return { isValid: false, error: 'Database password in URL is too weak' };
        }
      }

      return { isValid: true };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      return { isValid: false, error: 'Invalid database URL format' };
    }
  }

  /**
   * Additional production environment security checks
   */
  private validateProductionSecurity(errors: string[], warnings: string[]): void {
    // Check for development/test patterns in production
    const sensitiveVars = ['JWT_SECRET', 'DATABASE_URL', 'NEXTAUTH_SECRET'];
    
    for (const varName of sensitiveVars) {
      const value = process.env[varName];
      if (value) {
        const lowerValue = value.toLowerCase();
        if (lowerValue.includes('dev') || 
            lowerValue.includes('test') || 
            lowerValue.includes('localhost') ||
            lowerValue.includes('changeme') ||
            lowerValue.includes('replace')) {
          errors.push(`Production environment variable ${varName} contains development/test patterns`);
        }
      }
    }

    // Ensure HTTPS in production
    const nextauthUrl = process.env.NEXTAUTH_URL;
    if (nextauthUrl && !nextauthUrl.startsWith('https://')) {
      errors.push('NEXTAUTH_URL must use HTTPS in production');
    }

    // Check Solana network
    const solanaNetwork = process.env.SOLANA_NETWORK;
    if (solanaNetwork === 'devnet' || solanaNetwork === 'testnet') {
      warnings.push('Production environment is using non-mainnet Solana network');
    }

    // Database SSL requirement
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl && !databaseUrl.includes('sslmode')) {
      warnings.push('Database URL should specify SSL mode in production');
    }
  }

  /**
   * Check if running in production
   */
  private isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  /**
   * Get validated configuration
   */
  public getConfig(): EnvironmentConfig {
    if (!this.initialized) {
      return this.initialize();
    }
    return this.config!;
  }

  /**
   * Generate secure credentials for development
   */
  public generateDevelopmentCredentials(): Record<string, string> {
    return {
      JWT_SECRET: credentialValidator.generateSecureCredential(64),
      NEXTAUTH_SECRET: credentialValidator.generateSecureCredential(64),
      DATABASE_PASSWORD: credentialValidator.generateSecureCredential(32),
      REDIS_PASSWORD: credentialValidator.generateSecureCredential(32)
    };
  }

  /**
   * Export configuration for logging (sanitized)
   */
  public getSanitizedConfig(): Record<string, unknown> {
    if (!this.config) return {};
    
    return {
      isValid: this.config.isValid,
      hasErrors: this.config.errors.length > 0,
      hasWarnings: this.config.warnings.length > 0,
      jwt: {
        algorithm: this.config.config.jwt.algorithm,
        secretLength: this.config.config.jwt.secret.length
      },
      database: {
        hasUrl: !!this.config.config.database.url,
        ssl: this.config.config.database.ssl
      },
      solana: this.config.config.solana,
      redis: this.config.config.redis ? {
        configured: true
      } : { configured: false }
    };
  }
}

// Global instance
export const secureEnv = SecureEnvironment.getInstance();