/**
 * JWT Error Handler - Reduces noise from JWT verification errors in development
 */

let jwtErrorCount = 0;
const MAX_JWT_ERRORS_TO_LOG = 2; // Reduced for production readiness
const JWT_ERROR_RESET_INTERVAL = 120000; // 2 minutes

export function handleJWTError(error: unknown, context: string = ''): void {
  if (process.env.NODE_ENV === 'development') {
    jwtErrorCount++;
    
    // Only log first few JWT errors to reduce noise
    if (jwtErrorCount <= MAX_JWT_ERRORS_TO_LOG) {
      console.warn(`⚠️ JWT verification failed in development${context ? ` (${context})` : ''} - ${jwtErrorCount}/${MAX_JWT_ERRORS_TO_LOG}`);
      
      if (jwtErrorCount === MAX_JWT_ERRORS_TO_LOG) {
        console.warn(`🔇 Further JWT errors will be suppressed for ${JWT_ERROR_RESET_INTERVAL/1000}s to reduce noise`);
        
        // Reset counter after interval
        setTimeout(() => {
          jwtErrorCount = 0;
        }, JWT_ERROR_RESET_INTERVAL);
      }
    }
  } else {
    // In production, log all JWT errors
    console.error(`JWT verification failed${context ? ` (${context})` : ''}:`, error);
  }
}

export function logJWTSuccess(context: string = ''): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(`✅ JWT verification successful${context ? ` (${context})` : ''}`);
  }
}