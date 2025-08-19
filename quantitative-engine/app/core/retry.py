"""
XORJ Quantitative Engine - Retry and Error Handling
Robust retry mechanisms with exponential backoff for transient failures
"""

import asyncio
import time
from typing import Any, Callable, Dict, List, Optional, Type, Union
from functools import wraps
import random
from .config import get_settings
from .logging import get_logger

settings = get_settings()
logger = get_logger(__name__)


class RetryError(Exception):
    """Exception raised when all retry attempts are exhausted"""
    
    def __init__(self, message: str, last_exception: Exception, attempt_count: int):
        super().__init__(message)
        self.last_exception = last_exception
        self.attempt_count = attempt_count


class RateLimitError(Exception):
    """Exception raised when hitting API rate limits"""
    pass


class TransientError(Exception):
    """Exception for errors that are likely to be temporary"""
    pass


# Default list of exceptions that should trigger retries
DEFAULT_RETRYABLE_EXCEPTIONS = (
    ConnectionError,
    TimeoutError,
    TransientError,
    RateLimitError,
    # HTTP-related errors that might be temporary
    Exception,  # We'll be more specific in the decorator
)


def exponential_backoff(
    attempt: int,
    base_delay: float = 1.0,
    max_delay: float = None,
    jitter: bool = True
) -> float:
    """
    Calculate exponential backoff delay with optional jitter
    
    Args:
        attempt: Current attempt number (0-indexed)
        base_delay: Base delay in seconds
        max_delay: Maximum delay in seconds
        jitter: Whether to add random jitter
    
    Returns:
        Delay in seconds
    """
    if max_delay is None:
        max_delay = settings.max_retry_delay_seconds
    
    # Calculate exponential delay
    delay = base_delay * (settings.retry_backoff_multiplier ** attempt)
    
    # Apply maximum delay limit
    delay = min(delay, max_delay)
    
    # Add jitter to avoid thundering herd
    if jitter:
        delay += random.uniform(0, delay * 0.1)
    
    return delay


def is_retryable_error(exception: Exception, retryable_exceptions: tuple) -> bool:
    """
    Determine if an exception should trigger a retry
    
    Args:
        exception: The exception that occurred
        retryable_exceptions: Tuple of exception types that are retryable
    
    Returns:
        True if the exception should trigger a retry
    """
    # Check if it's an instance of retryable exceptions
    if isinstance(exception, retryable_exceptions):
        return True
    
    # Check specific conditions for common exceptions
    if isinstance(exception, Exception):
        error_message = str(exception).lower()
        
        # Common transient error patterns
        transient_patterns = [
            "timeout",
            "connection reset",
            "connection refused",
            "temporary failure",
            "service unavailable",
            "rate limit",
            "too many requests",
            "internal server error",
            "bad gateway",
            "gateway timeout",
            "service temporarily unavailable",
        ]
        
        for pattern in transient_patterns:
            if pattern in error_message:
                return True
    
    return False


def retry_with_backoff(
    max_attempts: int = None,
    base_delay: float = 1.0,
    max_delay: float = None,
    retryable_exceptions: tuple = DEFAULT_RETRYABLE_EXCEPTIONS,
    on_retry: Optional[Callable[[int, Exception], None]] = None
):
    """
    Decorator for retrying functions with exponential backoff
    
    Args:
        max_attempts: Maximum number of retry attempts
        base_delay: Base delay for exponential backoff
        max_delay: Maximum delay between retries
        retryable_exceptions: Tuple of exceptions that trigger retries
        on_retry: Callback function called on each retry
    
    Returns:
        Decorated function with retry capability
    """
    if max_attempts is None:
        max_attempts = settings.max_retries
    
    if max_delay is None:
        max_delay = settings.max_retry_delay_seconds
    
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            last_exception = None
            
            for attempt in range(max_attempts + 1):  # +1 because 0-indexed
                try:
                    return func(*args, **kwargs)
                    
                except Exception as e:
                    last_exception = e
                    
                    # Check if this is the last attempt
                    if attempt == max_attempts:
                        logger.error(
                            "All retry attempts exhausted",
                            function=func.__name__,
                            attempt=attempt + 1,
                            max_attempts=max_attempts + 1,
                            error=str(e),
                            error_type=type(e).__name__
                        )
                        raise RetryError(
                            f"Failed after {max_attempts + 1} attempts: {str(e)}",
                            e,
                            attempt + 1
                        )
                    
                    # Check if error is retryable
                    if not is_retryable_error(e, retryable_exceptions):
                        logger.error(
                            "Non-retryable error encountered",
                            function=func.__name__,
                            error=str(e),
                            error_type=type(e).__name__
                        )
                        raise
                    
                    # Calculate delay for next attempt
                    delay = exponential_backoff(attempt, base_delay, max_delay)
                    
                    logger.warning(
                        "Function call failed, retrying",
                        function=func.__name__,
                        attempt=attempt + 1,
                        max_attempts=max_attempts + 1,
                        error=str(e),
                        error_type=type(e).__name__,
                        retry_delay=delay
                    )
                    
                    # Call retry callback if provided
                    if on_retry:
                        try:
                            on_retry(attempt + 1, e)
                        except Exception as callback_error:
                            logger.warning(
                                "Retry callback failed",
                                callback_error=str(callback_error)
                            )
                    
                    # Wait before retry
                    time.sleep(delay)
            
            # This should never be reached, but just in case
            raise RetryError(
                f"Unexpected error after {max_attempts + 1} attempts",
                last_exception or Exception("Unknown error"),
                max_attempts + 1
            )
        
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            last_exception = None
            
            for attempt in range(max_attempts + 1):
                try:
                    return await func(*args, **kwargs)
                    
                except Exception as e:
                    last_exception = e
                    
                    # Check if this is the last attempt
                    if attempt == max_attempts:
                        logger.error(
                            "All retry attempts exhausted",
                            function=func.__name__,
                            attempt=attempt + 1,
                            max_attempts=max_attempts + 1,
                            error=str(e),
                            error_type=type(e).__name__
                        )
                        raise RetryError(
                            f"Failed after {max_attempts + 1} attempts: {str(e)}",
                            e,
                            attempt + 1
                        )
                    
                    # Check if error is retryable
                    if not is_retryable_error(e, retryable_exceptions):
                        logger.error(
                            "Non-retryable error encountered",
                            function=func.__name__,
                            error=str(e),
                            error_type=type(e).__name__
                        )
                        raise
                    
                    # Calculate delay for next attempt
                    delay = exponential_backoff(attempt, base_delay, max_delay)
                    
                    logger.warning(
                        "Async function call failed, retrying",
                        function=func.__name__,
                        attempt=attempt + 1,
                        max_attempts=max_attempts + 1,
                        error=str(e),
                        error_type=type(e).__name__,
                        retry_delay=delay
                    )
                    
                    # Call retry callback if provided
                    if on_retry:
                        try:
                            if asyncio.iscoroutinefunction(on_retry):
                                await on_retry(attempt + 1, e)
                            else:
                                on_retry(attempt + 1, e)
                        except Exception as callback_error:
                            logger.warning(
                                "Retry callback failed",
                                callback_error=str(callback_error)
                            )
                    
                    # Wait before retry
                    await asyncio.sleep(delay)
            
            # This should never be reached, but just in case
            raise RetryError(
                f"Unexpected error after {max_attempts + 1} attempts",
                last_exception or Exception("Unknown error"),
                max_attempts + 1
            )
        
        # Return appropriate wrapper based on function type
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


class RetrySession:
    """Session object for managing retries across multiple operations"""
    
    def __init__(
        self,
        max_attempts: int = None,
        base_delay: float = 1.0,
        max_delay: float = None,
        retryable_exceptions: tuple = DEFAULT_RETRYABLE_EXCEPTIONS
    ):
        self.max_attempts = max_attempts or settings.max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay or settings.max_retry_delay_seconds
        self.retryable_exceptions = retryable_exceptions
        
        self.total_attempts = 0
        self.total_retries = 0
        self.total_failures = 0
        
    async def execute_with_retry(
        self,
        func: Callable,
        *args,
        **kwargs
    ) -> Any:
        """Execute a function with retry logic"""
        
        @retry_with_backoff(
            max_attempts=self.max_attempts,
            base_delay=self.base_delay,
            max_delay=self.max_delay,
            retryable_exceptions=self.retryable_exceptions,
            on_retry=self._on_retry
        )
        async def execute():
            return await func(*args, **kwargs) if asyncio.iscoroutinefunction(func) else func(*args, **kwargs)
        
        self.total_attempts += 1
        
        try:
            result = await execute()
            return result
        except RetryError:
            self.total_failures += 1
            raise
    
    def _on_retry(self, attempt: int, exception: Exception):
        """Internal callback for tracking retry statistics"""
        self.total_retries += 1
        logger.debug(
            "Retry session callback",
            session_attempts=self.total_attempts,
            session_retries=self.total_retries,
            session_failures=self.total_failures,
            current_attempt=attempt,
            error=str(exception)
        )
    
    @property
    def success_rate(self) -> float:
        """Get success rate for this session"""
        if self.total_attempts == 0:
            return 0.0
        return (self.total_attempts - self.total_failures) / self.total_attempts
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get retry statistics for this session"""
        return {
            "total_attempts": self.total_attempts,
            "total_retries": self.total_retries,
            "total_failures": self.total_failures,
            "success_rate": self.success_rate,
            "average_retries_per_attempt": self.total_retries / self.total_attempts if self.total_attempts > 0 else 0
        }