#!/usr/bin/env node
/**
 * XORJ Credential Generator
 * Generates cryptographically secure credentials for environment variables
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class CredentialGenerator {
  /**
   * Generate cryptographically secure random string
   */
  generateSecureRandom(length = 64) {
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
      const randomIndex = crypto.randomInt(0, charSet.length);
      result += charSet[randomIndex];
    }

    // Fill the rest randomly
    for (let i = result.length; i < length; i++) {
      const randomIndex = crypto.randomInt(0, charset.length);
      result += charset[randomIndex];
    }

    // Shuffle the result using Fisher-Yates algorithm
    const chars = result.split('');
    for (let i = chars.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    
    return chars.join('');
  }

  /**
   * Generate database password
   */
  generateDatabasePassword(length = 32) {
    // Database passwords should be alphanumeric + basic symbols for compatibility
    const dbCharset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, dbCharset.length);
      result += dbCharset[randomIndex];
    }
    
    return result;
  }

  /**
   * Generate all required credentials for an environment
   */
  generateEnvironmentCredentials(environmentName = 'development') {
    return {
      // JWT and Authentication
      JWT_SECRET: this.generateSecureRandom(64),
      NEXTAUTH_SECRET: this.generateSecureRandom(64),
      
      // Database Credentials
      DATABASE_PASSWORD: this.generateDatabasePassword(32),
      
      // Redis Credentials  
      REDIS_PASSWORD: this.generateDatabasePassword(24),
      
      // Encryption Keys
      ENCRYPTION_KEY: this.generateSecureRandom(64),
      DATA_ENCRYPTION_KEY: this.generateSecureRandom(64),
      
      // API Keys (placeholders)
      API_ENCRYPTION_KEY: this.generateSecureRandom(32),
    };
  }

  /**
   * Create secure environment file
   */
  createSecureEnvFile(filePath, credentials, templatePath = null) {
    let content = '';
    
    if (templatePath && fs.existsSync(templatePath)) {
      // Use template file as base
      content = fs.readFileSync(templatePath, 'utf8');
      
      // Replace placeholder values with generated credentials
      for (const [key, value] of Object.entries(credentials)) {
        const patterns = [
          new RegExp(`${key}=your_[^\\n\\r]*`, 'g'),
          new RegExp(`${key}=[^\\n\\r]*_here[^\\n\\r]*`, 'g'),
          new RegExp(`${key}=generate_secure_[^\\n\\r]*`, 'g')
        ];
        
        for (const pattern of patterns) {
          content = content.replace(pattern, `${key}=${value}`);
        }
      }
    } else {
      // Generate basic env file
      content = '# XORJ Environment Configuration\n';
      content += `# Generated on ${new Date().toISOString()}\n`;
      content += '# ⚠️ Keep these credentials secure - never commit to version control\n\n';
      
      for (const [key, value] of Object.entries(credentials)) {
        content += `${key}=${value}\n`;
      }
    }
    
    fs.writeFileSync(filePath, content, { mode: 0o600 }); // Secure file permissions
    console.log(`✅ Secure credentials written to: ${filePath}`);
  }

  /**
   * Validate existing credentials
   */
  validateCredentials(envPath) {
    if (!fs.existsSync(envPath)) {
      console.error(`❌ Environment file not found: ${envPath}`);
      return false;
    }

    const content = fs.readFileSync(envPath, 'utf8');
    const weakPatterns = [
      /password.*123/i,
      /secret.*dev/i,
      /secret.*test/i,
      /changeme/i,
      /your_[a-z_]*_here/i,
      /localhost_password/i,
      /development_only/i
    ];

    let hasWeakCredentials = false;
    
    for (const pattern of weakPatterns) {
      if (pattern.test(content)) {
        console.warn(`⚠️ Weak credential pattern found in ${envPath}`);
        hasWeakCredentials = true;
      }
    }

    return !hasWeakCredentials;
  }
}

// CLI Interface
function showUsage() {
  console.log(`
XORJ Credential Generator

Usage:
  node generate-credentials.js [command] [options]

Commands:
  generate [env-name]     Generate credentials for environment (default: development)
  validate <file>         Validate existing credentials file
  help                    Show this help message

Examples:
  node generate-credentials.js generate development
  node generate-credentials.js generate production  
  node generate-credentials.js validate .env.local
`);
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const generator = new CredentialGenerator();

  switch (command) {
    case 'generate': {
      const envName = args[1] || 'development';
      const credentials = generator.generateEnvironmentCredentials(envName);
      
      console.log(`🔑 Generated secure credentials for ${envName} environment:\n`);
      
      // Show credentials (in real usage, these would be written directly to file)
      console.log('# Add these to your .env file:');
      console.log('# ⚠️ Keep these secret - never commit to version control\n');
      
      for (const [key, value] of Object.entries(credentials)) {
        // Show first 8 characters + ... for security
        const maskedValue = value.substring(0, 8) + '...' + value.substring(value.length - 4);
        console.log(`${key}=${maskedValue} (${value.length} chars)`);
      }
      
      console.log('\n💡 To save to file:');
      console.log(`   node generate-credentials.js generate ${envName} > .env.${envName}`);
      console.log('\n🔒 Security Tips:');
      console.log('   - Store credentials in secure password manager');
      console.log('   - Use different credentials for each environment');  
      console.log('   - Rotate credentials regularly');
      console.log('   - Never commit credentials to version control');
      
      break;
    }
    
    case 'validate': {
      const filePath = args[1];
      if (!filePath) {
        console.error('❌ Please provide a file path to validate');
        showUsage();
        process.exit(1);
      }
      
      const isValid = generator.validateCredentials(filePath);
      if (isValid) {
        console.log(`✅ Credentials in ${filePath} appear secure`);
      } else {
        console.log(`❌ Weak credentials detected in ${filePath}`);
        console.log('💡 Run: node generate-credentials.js generate');
        process.exit(1);
      }
      break;
    }
    
    case 'help':
    default:
      showUsage();
      break;
  }
}

if (require.main === module) {
  main();
}

module.exports = CredentialGenerator;