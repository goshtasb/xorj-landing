'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { registerGlobalErrorHandler } from '@/lib/apiClient';

export interface GlobalError {
  id: string;
  message: string;
  type: 'server' | 'network' | 'api' | 'general';
  timestamp: number;
}

interface GlobalErrorContextType {
  errors: GlobalError[];
  addError: (message: string, type?: GlobalError['type']) => string;
  removeError: (id: string) => void;
  clearAllErrors: () => void;
  hasServerErrors: boolean;
}

const GlobalErrorContext = createContext<GlobalErrorContextType>({
  errors: [],
  addError: () => '',
  removeError: () => {},
  clearAllErrors: () => {},
  hasServerErrors: false
});

export const useGlobalError = () => {
  const context = useContext(GlobalErrorContext);
  if (!context) {
    throw new Error('useGlobalError must be used within GlobalErrorProvider');
  }
  return context;
};

interface GlobalErrorProviderProps {
  children: ReactNode;
}

export function GlobalErrorProvider({ children }: GlobalErrorProviderProps) {
  const [errors, setErrors] = useState<GlobalError[]>([]);

  const addError = useCallback((message: string, type: GlobalError['type'] = 'general') => {
    const id = `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const error: GlobalError = {
      id,
      message,
      type,
      timestamp: Date.now()
    };

    setErrors(prev => [...prev, error]);

    // Auto-remove error after 10 seconds for non-server errors
    if (type !== 'server' && type !== 'api') {
      setTimeout(() => {
        removeError(id);
      }, 10000);
    }

    return id;
  }, []);

  const removeError = useCallback((id: string) => {
    setErrors(prev => prev.filter(error => error.id !== id));
  }, []);

  const clearAllErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const hasServerErrors = errors.some(error => 
    error.type === 'server' || error.type === 'api'
  );

  // Register the error handler with the API client
  useEffect(() => {
    registerGlobalErrorHandler(addError);
  }, [addError]);

  const value: GlobalErrorContextType = {
    errors,
    addError,
    removeError,
    clearAllErrors,
    hasServerErrors
  };

  return (
    <GlobalErrorContext.Provider value={value}>
      {children}
    </GlobalErrorContext.Provider>
  );
}

export default GlobalErrorProvider;