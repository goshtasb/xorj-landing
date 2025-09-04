/**
 * Credential Validation & Security Module
 * Validates and secures environment variables and credentials
 */


interface CredentialValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  securityScore: number;
}

interface EnvValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  missingRequired: string[];
  weakCredentials: string[];
}

// Security patterns to detect weak or default credentials
const WEAK_CREDENTIAL_PATTERNS = [
  /password/i,
  /secret/i,
  /dev/i,
  /test/i,
  /demo/i,
  /default/i,
  /admin/i,
  /localhost/i,
  /123/i,
  /change/i,
  /replace/i,
  /your_/i,
  /example/i,
  /sample/i
];

// Common weak passwords
const WEAK_PASSWORDS = [
  'password',
  'secret',
  '123456',
  'admin',
  'test',
  'dev',
  'localhost',
  'changeme',
  'password123',
  'secret123'
];

export class CredentialValidator {
  /**
   * Validates JWT secret strength
   */
  public validateJWTSecret(secret: string): CredentialValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let securityScore = 10;

    // JWT secret validation

    if (!secret) {
      errors.push('JWT secret is required');
      return { isValid: false, errors, warnings, securityScore: 0 };
    }

    // Length validation
    if (secret.length < 32) {
      errors.push('JWT secret must be at least 32 characters long');
      securityScore -= 3;
    } else if (secret.length < 64) {
      warnings.push('JWT secret should be at least 64 characters for optimal security');
      securityScore -= 1;
    }

    // Pattern validation
    if (!/[A-Z]/.test(secret)) {
      warnings.push('JWT secret should contain uppercase letters');
      securityScore -= 0.5;
    }

    if (!/[a-z]/.test(secret)) {
      warnings.push('JWT secret should contain lowercase letters');
      securityScore -= 0.5;
    }

    if (!/[0-9]/.test(secret)) {
      warnings.push('JWT secret should contain numbers');
      securityScore -= 0.5;
    }

    if (!/[^A-Za-z0-9]/.test(secret)) {
      warnings.push('JWT secret should contain special characters');
      securityScore -= 0.5;
    }

    // Check for weak patterns
    for (const pattern of WEAK_CREDENTIAL_PATTERNS) {
      if (pattern.test(secret)) {
        errors.push('JWT secret contains weak or predictable patterns');
        securityScore -= 2;
        break;
      }
    }

    // Check for common weak passwords
    const lowerSecret = secret.toLowerCase();
    if (WEAK_PASSWORDS.some(weak => lowerSecret.includes(weak))) {
      errors.push('JWT secret contains common weak password patterns');
      securityScore -= 3;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      securityScore: Math.max(0, securityScore)
    };
  }

  /**
   * Validates database credentials
   */
  public validateDatabaseCredentials(
    host: string,
    username: string,
    password: string,
    database: string
  ): CredentialValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let securityScore = 10;

    // Required fields
    if (!host) errors.push('Database host is required');
    if (!username) errors.push('Database username is required');
    if (!password) errors.push('Database password is required');
    if (!database) errors.push('Database name is required');

    if (errors.length > 0) {
      return { isValid: false, errors, warnings, securityScore: 0 };
    }

    // Password strength validation
    if (password.length < 12) {
      errors.push('Database password must be at least 12 characters long');
      securityScore -= 3;
    }

    // Check for weak patterns in password
    for (const pattern of WEAK_CREDENTIAL_PATTERNS) {
      if (pattern.test(password)) {
        errors.push('Database password contains weak or predictable patterns');
        securityScore -= 2;
        break;
      }
    }

    // Check username security
    const commonUsernames = ['admin', 'root', 'postgres', 'user', 'test'];
    if (commonUsernames.includes(username.toLowerCase())) {
      warnings.push('Consider using a non-default database username');
      securityScore -= 1;
    }

    // Check database name security
    if (['test', 'dev', 'development'].includes(database.toLowerCase())) {
      warnings.push('Database name suggests development environment');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      securityScore: Math.max(0, securityScore)
    };
  }

  /**
   * Validates all environment variables for security compliance
   */
  public validateEnvironment(env: Record<string, string | undefined>): EnvValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const missingRequired: string[] = [];
    const weakCredentials: string[] = [];

    // Required environment variables
    const requiredVars = [
      'JWT_SECRET',
      'DATABASE_URL',
      'NODE_ENV'
    ];

    // Check for missing required variables
    for (const varName of requiredVars) {
      if (!env[varName]) {
        missingRequired.push(varName);
      }
    }

    // Validate JWT secret
    if (env.JWT_SECRET) {
      const jwtValidation = this.validateJWTSecret(env.JWT_SECRET);
      if (!jwtValidation.isValid) {
        errors.push(`JWT_SECRET validation failed: ${jwtValidation.errors.join(', ')}`);
      }
      if (jwtValidation.warnings.length > 0) {
        warnings.push(`JWT_SECRET warnings: ${jwtValidation.warnings.join(', ')}`);
      }
    }

    // Check for credentials containing weak patterns
    const credentialKeys = Object.keys(env).filter(key => 
      key.toLowerCase().includes('secret') ||
      key.toLowerCase().includes('password') ||
      key.toLowerCase().includes('key') ||
      key.toLowerCase().includes('token')
    );

    for (const key of credentialKeys) {
      const value = env[key];
      if (value) {
        for (const pattern of WEAK_CREDENTIAL_PATTERNS) {
          if (pattern.test(value)) {
            weakCredentials.push(key);
            break;
          }
        }
      }
    }

    // Check for production environment with weak credentials
    if (env.NODE_ENV === 'production' && weakCredentials.length > 0) {
      errors.push(`Production environment contains weak credentials: ${weakCredentials.join(', ')}`);
    }

    return {
      isValid: errors.length === 0 && missingRequired.length === 0,
      errors,
      warnings,
      missingRequired,
      weakCredentials
    };
  }

  /**
   * Generates secure random credentials
   */
  public generateSecureCredential(length: number = 64): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let result = '';
    
    // Ensure at least one character from each required type
    const required = [
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      'abcdefghijklmnopqrstuvwxyz', 
      '0123456789',
      '!@#$%^&*()_+-=[]{}|;:,.<>?'
    ];

    // Add one from each required type
    for (const charSet of required) {
      result += charSet[Math.floor(Math.random() * charSet.length)];
    }

    // Fill the rest randomly
    for (let i = result.length; i < length; i++) {
      result += charset[Math.floor(Math.random() * charset.length)];
    }

    // Shuffle the result
    return result.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Sanitizes environment variables for logging
   */
  public sanitizeEnvForLogging(env: Record<string, string | undefined>): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const sensitiveKeys = ['password', 'secret', 'key', 'token', 'private'];

    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) continue;
      
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveKeys.some(sensitive => lowerKey.includes(sensitive));
      
      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (value.length > 50) {
        sanitized[key] = value.substring(0, 47) + '...';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

export const credentialValidator = new CredentialValidator();