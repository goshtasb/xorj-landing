/**
 * Users Schema Definition - Drizzle ORM
 * 
 * Defines the core user table that stores primary user records linked to their wallets.
 * This is the foundation of the XORJ Trading Bot user management system.
 * 
 * Features:
 * - UUID primary keys for security and scalability
 * - Unique wallet addresses for Solana integration
 * - Automatic timestamp management
 * - Foreign key relationships for data integrity
 * 
 * Compatible with existing database structure and API endpoints.
 * 
 * @see PRD Section: Unified Database Schema Definition
 */

import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

/**
 * Users Table
 * 
 * Primary user records linked to Solana wallet addresses.
 * This table serves as the central user identity store.
 * 
 * SQL Equivalent:
 * CREATE TABLE users (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   wallet_address TEXT NOT NULL UNIQUE,
 *   created_at TIMESTAMPTZ DEFAULT now()
 * );
 */
export const users = pgTable('users', {
  // Primary key - auto-generated UUID
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`)
    .notNull(),
  
  // Solana wallet address - unique identifier for users
  walletAddress: text('wallet_address')
    .notNull()
    .unique(),
  
  // Creation timestamp - automatically set on insert
  createdAt: timestamp('created_at', { 
    withTimezone: true, 
    mode: 'date' 
  })
    .default(sql`now()`)
    .notNull()
});

/**
 * Zod Validation Schemas
 * 
 * Type-safe validation schemas for users table operations.
 * These ensure data integrity and provide excellent TypeScript support.
 */

// Insert schema - for creating new users
export const insertUserSchema = createInsertSchema(users, {
  walletAddress: z.string().min(32).max(44).regex(/^[A-Za-z0-9]+$/, 'Invalid wallet address format')
}).omit({
  id: true,
  createdAt: true
});

// Select schema - for reading users
export const selectUserSchema = createSelectSchema(users);

// Update schema - for modifying users (limited fields)
export const updateUserSchema = insertUserSchema.partial();

/**
 * TypeScript Types
 * 
 * Inferred types for TypeScript integration throughout the application.
 * These provide compile-time type safety and excellent IDE support.
 */
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserUpdate = Partial<NewUser>;

/**
 * User Validation Types
 * 
 * Zod-validated types for runtime type checking and API validation.
 */
export type ValidatedUser = z.infer<typeof selectUserSchema>;
export type ValidatedNewUser = z.infer<typeof insertUserSchema>;
export type ValidatedUserUpdate = z.infer<typeof updateUserSchema>;