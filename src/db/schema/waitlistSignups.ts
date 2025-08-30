/**
 * Waitlist Signups Schema Definition - Drizzle ORM
 * 
 * Defines the waitlist_signups table that stores early user registrations
 * and interest signups for the XORJ Trading Bot platform.
 * 
 * Features:
 * - Email validation and uniqueness constraints
 * - Signup source tracking for marketing analytics
 * - Referral code support for growth tracking
 * - Automatic timestamp management
 * - Status tracking for signup lifecycle
 * 
 * Integrates with marketing campaigns and user onboarding systems.
 * 
 * @see PRD Section: Unified Database Schema Definition
 */

import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

/**
 * Waitlist Status Enumeration
 * 
 * Standardized status values for tracking signup lifecycle.
 * These help manage the waitlist progression and user onboarding.
 */
export const WAITLIST_STATUSES = ['PENDING', 'APPROVED', 'NOTIFIED', 'CONVERTED'] as const;
export type WaitlistStatus = typeof WAITLIST_STATUSES[number];

/**
 * Signup Source Enumeration
 * 
 * Tracks where users heard about or signed up for the platform.
 * Used for marketing attribution and channel effectiveness analysis.
 */
export const SIGNUP_SOURCES = [
  'DIRECT',
  'SOCIAL_MEDIA',
  'REFERRAL',
  'SEARCH',
  'ADVERTISING',
  'PARTNERSHIP',
  'EVENT',
  'OTHER'
] as const;
export type SignupSource = typeof SIGNUP_SOURCES[number];

/**
 * Waitlist Signups Table
 * 
 * Stores early interest signups and waitlist registrations.
 * Each signup represents a potential user's interest in the platform.
 * 
 * SQL Equivalent:
 * CREATE TABLE waitlist_signups (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   email TEXT NOT NULL UNIQUE,
 *   wallet_address TEXT,
 *   referral_code TEXT,
 *   signup_source TEXT NOT NULL DEFAULT 'DIRECT',
 *   status TEXT NOT NULL DEFAULT 'PENDING',
 *   created_at TIMESTAMPTZ DEFAULT now(),
 *   notified_at TIMESTAMPTZ
 * );
 */
export const waitlistSignups = pgTable('waitlist_signups', {
  // Primary key - auto-generated UUID
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`)
    .notNull(),
  
  // Email address - unique identifier for signups
  email: text('email')
    .notNull()
    .unique(),
  
  // Optional wallet address - for crypto-native users
  walletAddress: text('wallet_address'),
  
  // Referral code - for tracking referral campaigns
  referralCode: text('referral_code'),
  
  // Signup source - tracks marketing attribution
  signupSource: text('signup_source', { enum: SIGNUP_SOURCES })
    .notNull()
    .default('DIRECT'),
  
  // Waitlist status - tracks progression through waitlist
  status: text('status', { enum: WAITLIST_STATUSES })
    .notNull()
    .default('PENDING'),
  
  // Signup timestamp - automatically set on insert
  createdAt: timestamp('created_at', { 
    withTimezone: true, 
    mode: 'date' 
  })
    .default(sql`now()`)
    .notNull(),
  
  // Notification timestamp - set when user is notified of approval
  notifiedAt: timestamp('notified_at', { 
    withTimezone: true, 
    mode: 'date' 
  })
});

/**
 * Zod Validation Schemas
 * 
 * Type-safe validation schemas for waitlist_signups table operations.
 * These ensure data integrity and provide runtime validation.
 */

// Email validation schema with comprehensive rules
const emailSchema = z.string()
  .email('Invalid email format')
  .min(5, 'Email must be at least 5 characters')
  .max(254, 'Email must not exceed 254 characters')
  .toLowerCase()
  .refine(
    (email) => !email.includes('+'), 
    'Plus addressing is not allowed'
  )
  .refine(
    (email) => {
      const domain = email.split('@')[1];
      return domain && !domain.includes('..');
    },
    'Invalid email domain format'
  );

// Wallet address validation schema
const walletAddressSchema = z.string()
  .min(32, 'Wallet address must be at least 32 characters')
  .max(44, 'Wallet address must not exceed 44 characters')
  .regex(/^[A-Za-z0-9]+$/, 'Invalid wallet address format')
  .optional();

// Referral code validation schema
const referralCodeSchema = z.string()
  .min(4, 'Referral code must be at least 4 characters')
  .max(20, 'Referral code must not exceed 20 characters')
  .regex(/^[A-Z0-9_-]+$/i, 'Referral code can only contain letters, numbers, hyphens, and underscores')
  .optional();

// Status validation schema
const statusSchema = z.enum(WAITLIST_STATUSES, {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  errorMap: (_issue, _ctx) => {
    return { message: `Status must be one of: ${WAITLIST_STATUSES.join(', ')}` };
  }
});

// Signup source validation schema
const signupSourceSchema = z.enum(SIGNUP_SOURCES, {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  errorMap: (_issue, _ctx) => {
    return { message: `Signup source must be one of: ${SIGNUP_SOURCES.join(', ')}` };
  }
});

// Insert schema - for creating new waitlist signups
export const insertWaitlistSignupSchema = createInsertSchema(waitlistSignups, {
  email: emailSchema,
  walletAddress: walletAddressSchema,
  referralCode: referralCodeSchema,
  signupSource: signupSourceSchema,
  status: statusSchema,
  createdAt: z.date().optional(),
  notifiedAt: z.date().optional()
}).omit({
  id: true
});

// Select schema - for reading waitlist signups
export const selectWaitlistSignupSchema = createSelectSchema(waitlistSignups, {
  email: emailSchema,
  walletAddress: walletAddressSchema,
  referralCode: referralCodeSchema,
  signupSource: signupSourceSchema,
  status: statusSchema
});

// Update schema - for modifying waitlist signups
export const updateWaitlistSignupSchema = insertWaitlistSignupSchema.partial();

/**
 * TypeScript Types
 * 
 * Inferred types for TypeScript integration throughout the application.
 * These provide compile-time type safety for waitlist management.
 */
export type WaitlistSignup = typeof waitlistSignups.$inferSelect;
export type NewWaitlistSignup = typeof waitlistSignups.$inferInsert;
export type WaitlistSignupUpdate = Partial<NewWaitlistSignup>;

/**
 * Waitlist Validation Types
 * 
 * Zod-validated types for runtime type checking and API validation.
 */
export type ValidatedWaitlistSignup = z.infer<typeof selectWaitlistSignupSchema>;
export type ValidatedNewWaitlistSignup = z.infer<typeof insertWaitlistSignupSchema>;
export type ValidatedWaitlistSignupUpdate = z.infer<typeof updateWaitlistSignupSchema>;

/**
 * Compatibility Types
 * 
 * Types that maintain compatibility with existing marketing and signup systems.
 * These bridge marketing campaigns and database operations.
 */
export interface CompatibleWaitlistSignup {
  id: string;
  email: string;
  walletAddress?: string;
  referralCode?: string;
  signupSource: string;
  status: string;
  createdAt: Date;
  notifiedAt?: Date;
  
  // Computed fields for API responses
  waitingTime?: number; // Days since signup
  position?: number; // Position in waitlist
}

export interface WaitlistSignupRequest {
  email: string;
  walletAddress?: string;
  referralCode?: string;
  signupSource?: SignupSource;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

/**
 * Analytics and Reporting Types
 * 
 * Types for waitlist analytics and marketing performance tracking.
 */
export interface WaitlistAnalytics {
  totalSignups: number;
  pendingSignups: number;
  approvedSignups: number;
  convertedSignups: number;
  conversionRate: number;
  averageWaitTime: number;
  signupsBySource: Record<SignupSource, number>;
  signupsByDay: Array<{
    date: Date;
    count: number;
  }>;
}

export interface ReferralAnalytics {
  totalReferrals: number;
  uniqueReferralCodes: number;
  topReferralCodes: Array<{
    code: string;
    signups: number;
  }>;
  referralConversionRate: number;
}

/**
 * Utility Functions
 * 
 * Helper functions for waitlist management, analytics, and user communication.
 */

// Calculate waiting time in days
export const calculateWaitingTime = (signup: WaitlistSignup): number => {
  const now = new Date();
  const diffTime = now.getTime() - signup.createdAt.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

// Check if email domain is allowed
export const isAllowedEmailDomain = (email: string, blockedDomains: string[] = []): boolean => {
  const domain = email.split('@')[1].toLowerCase();
  
  // Common disposable email domains to block
  const defaultBlockedDomains = [
    '10minutemail.com',
    'tempmail.org',
    'guerrillamail.com',
    'mailinator.com'
  ];
  
  const allBlockedDomains = [...defaultBlockedDomains, ...blockedDomains];
  return !allBlockedDomains.includes(domain);
};

// Validate referral code format
export const validateReferralCode = (code: string): boolean => {
  return /^[A-Z0-9_-]{4,20}$/i.test(code);
};

// Generate unique referral code
export const generateReferralCode = (email: string): string => {
  const emailPrefix = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${emailPrefix.substring(0, 6)}${randomSuffix}`;
};

// Convert to API format with computed fields
export const convertToApiFormat = (dbSignup: WaitlistSignup, position?: number): CompatibleWaitlistSignup => ({
  id: dbSignup.id,
  email: dbSignup.email,
  walletAddress: dbSignup.walletAddress || undefined,
  referralCode: dbSignup.referralCode || undefined,
  signupSource: dbSignup.signupSource,
  status: dbSignup.status,
  createdAt: dbSignup.createdAt,
  notifiedAt: dbSignup.notifiedAt || undefined,
  waitingTime: calculateWaitingTime(dbSignup),
  position
});

// Convert from signup form format
export const convertFromSignupForm = (request: WaitlistSignupRequest): NewWaitlistSignup => ({
  email: request.email.toLowerCase(),
  walletAddress: request.walletAddress,
  referralCode: request.referralCode?.toUpperCase(),
  signupSource: request.signupSource || 'DIRECT',
  status: 'PENDING' as WaitlistStatus,
  createdAt: new Date(),
  notifiedAt: undefined
});

// Group signups by source for analytics
export const groupSignupsBySource = (signups: WaitlistSignup[]): Record<SignupSource, number> => {
  return signups.reduce((acc, signup) => {
    acc[signup.signupSource] = (acc[signup.signupSource] || 0) + 1;
    return acc;
  }, {} as Record<SignupSource, number>);
};

// Calculate conversion funnel metrics
export const calculateConversionMetrics = (signups: WaitlistSignup[]) => {
  const total = signups.length;
  const approved = signups.filter(s => s.status === 'APPROVED' || s.status === 'NOTIFIED' || s.status === 'CONVERTED').length;
  const notified = signups.filter(s => s.status === 'NOTIFIED' || s.status === 'CONVERTED').length;
  const converted = signups.filter(s => s.status === 'CONVERTED').length;
  
  return {
    totalSignups: total,
    approvalRate: total > 0 ? (approved / total) * 100 : 0,
    notificationRate: approved > 0 ? (notified / approved) * 100 : 0,
    conversionRate: notified > 0 ? (converted / notified) * 100 : 0,
    overallConversionRate: total > 0 ? (converted / total) * 100 : 0
  };
};

// Find duplicate signups by email
export const findDuplicateSignups = (email: string, existingSignups: WaitlistSignup[]): WaitlistSignup[] => {
  return existingSignups.filter(signup => 
    signup.email.toLowerCase() === email.toLowerCase()
  );
};

/**
 * Email Marketing Integration Types
 * 
 * Types for integrating with email marketing platforms and notification systems.
 */
export interface EmailCampaign {
  signupId: string;
  campaignType: 'WELCOME' | 'WAITLIST_UPDATE' | 'APPROVAL' | 'ONBOARDING';
  templateId: string;
  scheduledAt?: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
}

export interface NotificationPreferences {
  signupId: string;
  emailUpdates: boolean;
  productAnnouncements: boolean;
  marketingEmails: boolean;
  smsNotifications: boolean;
}