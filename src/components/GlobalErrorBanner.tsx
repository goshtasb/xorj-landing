'use client';

import React from 'react';
import { useGlobalError } from '@/contexts/GlobalErrorContext';
import { AlertTriangle, X } from 'lucide-react';

/**
 * GlobalErrorBanner Component
 * 
 * Displays global application errors in a banner at the top of the page.
 * Used for Test Case 2.1.1 to show "services are temporarily unavailable" messages.
 */
export function GlobalErrorBanner() {
  const { errors, removeError, hasServerErrors } = useGlobalError();

  // Only show banner if there are server/API errors
  if (!hasServerErrors || errors.length === 0) {
    return null;
  }

  // Get the most recent server/API error
  const serverError = errors
    .filter(error => error.type === 'server' || error.type === 'api')
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  if (!serverError) return null;

  return (
    <div 
      data-testid="global-error-banner"
      className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white px-4 py-3 shadow-lg"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <div>
            <span className="font-medium">
              {serverError.message || 'Our services are temporarily unavailable. Please try again later.'}
            </span>
          </div>
        </div>
        <button
          onClick={() => removeError(serverError.id)}
          className="text-red-200 hover:text-white transition-colors ml-4"
          title="Dismiss error"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export default GlobalErrorBanner;