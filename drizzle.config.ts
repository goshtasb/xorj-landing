/**
 * Drizzle ORM Configuration
 * 
 * This configuration defines the database connection and migration settings
 * for the XORJ Trading Bot PostgreSQL database using Drizzle ORM.
 * 
 * Key Features:
 * - PostgreSQL 16+ optimized configuration
 * - Type-safe schema definitions
 * - Automated migration management
 * - Environment-based database connections
 * 
 * @see https://orm.drizzle.team/kit-docs/config-reference
 */

import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  // Database connection configuration
  dialect: 'postgresql',
  
  // Database connection URL - uses existing environment variables for compatibility
  dbCredentials: {
    url: process.env.DATABASE_URL || `postgresql://${process.env.DATABASE_USER || 'postgres'}:${process.env.DATABASE_PASSWORD || ''}@${process.env.DATABASE_HOST || 'localhost'}:${process.env.DATABASE_PORT || '5432'}/${process.env.DATABASE_NAME || 'xorj_bot_state'}`
  },
  
  // Schema files location - TypeScript schema definitions
  schema: './src/db/schema/*.ts',
  
  // Migration output directory
  out: './src/db/migrations',
  
  // Migration configuration
  migrations: {
    prefix: 'timestamp',
    table: '__drizzle_migrations__',
    schema: 'public'
  },
  
  // Enable verbose logging for development
  verbose: process.env.NODE_ENV === 'development',
  
  // Strict mode for enhanced type safety
  strict: true,
  
  // Generate TypeScript types
  introspect: {
    casing: 'snake_case'
  }
});