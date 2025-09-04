/**
 * CSRF Token Generation API
 * GET /api/auth/csrf
 * SECURITY FIX: Phase 2 - Generate CSRF tokens for form protection
 */

import { CSRFProtection } from '@/lib/security/csrfProtection';

export async function GET() {
  try {
    // Generate and return CSRF token
    return CSRFProtection.generateTokenResponse();
  } catch (error) {
    console.error('❌ CSRF token generation error:', error);
    
    return new Response(
      JSON.stringify({
        error: 'CSRF_GENERATION_FAILED',
        message: 'Failed to generate CSRF token'
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}