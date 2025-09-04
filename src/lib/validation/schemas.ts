/**
 * XORJ V1 API Schema Validation
 * Critical Security Fix: Strict validation for all API endpoints
 * 
 * Every API endpoint MUST validate against these schemas.
 * Invalid requests MUST be rejected with 400 Bad Request.
 */

import { z } from 'zod';

// Authentication schemas
export const AuthenticateRequestSchema = z.object({
  wallet_address: z.string()
    .min(32, "Wallet address too short")
    .max(44, "Wallet address too long")
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid wallet address format"),
  signature: z.string()
    .min(1, "Signature is required")
    .optional(), // Optional only in development
  message: z.string()
    .min(1, "Authentication message is required")
    .optional() // Optional only in development
}).strict(); // strict() prevents extra fields

// Trade execution schemas
export const TradeExecuteRequestSchema = z.object({
  action: z.enum(['simulate', 'execute'], {
    required_error: "Action is required",
    invalid_type_error: "Action must be 'simulate' or 'execute'"
  }),
  fromToken: z.enum(['SOL', 'USDC'], {
    invalid_type_error: "FromToken must be 'SOL' or 'USDC'"
  }).optional().default('SOL'),
  toToken: z.enum(['SOL', 'USDC'], {
    invalid_type_error: "ToToken must be 'SOL' or 'USDC'"
  }).optional().default('USDC'),
  amount: z.number()
    .min(0.001, "Amount must be at least 0.001")
    .max(1000, "Amount must not exceed 1000")
    .positive("Amount must be positive"),
  slippageBps: z.number()
    .min(0, "Slippage must be non-negative")
    .max(10000, "Slippage must not exceed 10000 basis points")
    .int("Slippage must be an integer")
    .optional()
    .default(50)
}).strict()
  .refine(data => data.fromToken !== data.toToken, {
    message: "FromToken and ToToken must be different"
  });

// User settings schemas
export const UserSettingsRequestSchema = z.object({
  walletAddress: z.string()
    .min(32, "Wallet address too short")
    .max(44, "Wallet address too long")
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid wallet address format")
}).strict();

// Bot control schemas
export const BotConfigurationRequestSchema = z.object({
  enabled: z.boolean({
    required_error: "Enabled status is required",
    invalid_type_error: "Enabled must be a boolean"
  }),
  riskProfile: z.enum(['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'], {
    invalid_type_error: "Risk profile must be 'CONSERVATIVE', 'BALANCED', or 'AGGRESSIVE'"
  }).optional(),
  investmentAmount: z.number()
    .min(1, "Investment amount must be at least 1")
    .max(1000000, "Investment amount must not exceed 1,000,000")
    .positive("Investment amount must be positive")
    .optional()
}).strict();

// Query parameter schemas
export const TradesQuerySchema = z.object({
  limit: z.coerce.number()
    .min(1, "Limit must be at least 1")
    .max(100, "Limit must not exceed 100")
    .int("Limit must be an integer")
    .optional()
    .default(50),
  offset: z.coerce.number()
    .min(0, "Offset must be non-negative")
    .int("Offset must be an integer")
    .optional()
    .default(0)
});

// Standardized error response type
export interface ValidationError {
  success: false;
  error: {
    code: 'VALIDATION_ERROR' | 'AUTHENTICATION_ERROR' | 'AUTHORIZATION_ERROR' | 'RATE_LIMIT_ERROR' | 'INTERNAL_ERROR' | 'INVALID_SIGNATURE' | 'UNAUTHORIZED';
    message: string;
    details?: string | string[] | Record<string, string[]>;
  };
}

// Success response wrapper
export interface SuccessResponse<T = unknown> {
  success: true;
  data?: T;
  [key: string]: unknown; // Allow additional fields for backward compatibility
}

// Type exports for use in API endpoints
export type AuthenticateRequest = z.infer<typeof AuthenticateRequestSchema>;
export type TradeExecuteRequest = z.infer<typeof TradeExecuteRequestSchema>;
export type UserSettingsRequest = z.infer<typeof UserSettingsRequestSchema>;
export type BotConfigurationRequest = z.infer<typeof BotConfigurationRequestSchema>;
export type TradesQuery = z.infer<typeof TradesQuerySchema>;