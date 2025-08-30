/**
 * API Client with Global Error Handling
 * 
 * Automatically handles 5xx server errors by displaying global error banner
 * for Test Case 2.1.1 compliance.
 */

let globalErrorAddFunction: ((message: string, type?: 'server' | 'network' | 'api' | 'general') => string) | null = null;

// Function to register the global error function from React context
export function registerGlobalErrorHandler(addError: (message: string, type?: 'server' | 'network' | 'api' | 'general') => string) {
  globalErrorAddFunction = addError;
}

// Enhanced fetch function with global error handling
export async function apiClient(url: string, options: RequestInit = {}): Promise<Response> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    // Handle 5xx server errors
    if (response.status >= 500) {
      const errorMessage = response.status === 503 
        ? 'Our services are temporarily unavailable. Please try again later.'
        : `Server error (${response.status}). Our services are temporarily unavailable.`;
      
      console.error(`API Error ${response.status}:`, errorMessage);
      
      // Add to global error banner if handler is registered
      if (globalErrorAddFunction) {
        globalErrorAddFunction(errorMessage, 'server');
      }
      
      // Return the response for further handling, don't throw
      return response;
    }

    // Handle 4xx client errors (but don't add to global banner)
    if (response.status >= 400 && response.status < 500) {
      console.warn(`Client Error ${response.status}:`, url);
    }

    return response;
  } catch (error) {
    // Handle network errors
    const networkError = 'Network error. Please check your connection and try again.';
    console.error('Network Error:', error);
    
    if (globalErrorAddFunction) {
      globalErrorAddFunction(networkError, 'network');
    }
    
    throw error;
  }
}

// Specialized API client for internal API routes
export async function internalApiClient(url: string, options: RequestInit = {}): Promise<Response> {
  return apiClient(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

export default apiClient;