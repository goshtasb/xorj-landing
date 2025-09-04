"""
XORJ Quantitative Engine - Structured Logging Configuration
Provides consistent, structured logging across the entire application
"""

import sys
import logging
from typing import Any, Dict, Optional
import structlog
from structlog.stdlib import LoggerFactory
from .config import get_settings

settings = get_settings()


def configure_logging() -> None:
    """Configure structured logging for the application"""
    
    # Configure standard library logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, settings.log_level),
    )
    
    # Configure structlog
    structlog.configure(
        processors=[
            # Add correlation IDs, timestamps, etc.
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="ISO"),
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.StackInfoRenderer(),
            # JSON formatting for production, colored for development
            structlog.dev.ConsoleRenderer(colors=settings.is_development)
            if settings.log_format != "json"
            else structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, settings.log_level)
        ),
        logger_factory=LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str = __name__) -> structlog.BoundLogger:
    """Get a structured logger instance"""
    return structlog.get_logger(name)


class CorrelationContext:
    """Context manager for adding correlation IDs to logs"""
    
    def __init__(self, **context: Any):
        self.context = context
        self.tokens = []
    
    def __enter__(self):
        # Use clear_contextvars and then bind all at once
        self.old_context = structlog.contextvars.get_contextvars()
        structlog.contextvars.bind_contextvars(**self.context)
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        # Restore the old context
        structlog.contextvars.clear_contextvars()
        if self.old_context:
            structlog.contextvars.bind_contextvars(**self.old_context)


class RequestLogger:
    """Logger middleware for tracking requests and operations"""
    
    def __init__(self, operation: str, **context: Any):
        self.operation = operation
        self.context = context
        self.logger = get_logger(__name__)
    
    def __enter__(self):
        self.logger.info(
            f"Starting {self.operation}",
            operation=self.operation,
            **self.context
        )
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.logger.error(
                f"Failed {self.operation}",
                operation=self.operation,
                error=str(exc_val),
                error_type=exc_type.__name__,
                **self.context
            )
        else:
            self.logger.info(
                f"Completed {self.operation}",
                operation=self.operation,
                **self.context
            )


def log_function_call(func_name: str, **kwargs):
    """Decorator for logging function calls"""
    def decorator(func):
        def wrapper(*args, **func_kwargs):
            logger = get_logger(func.__module__)
            
            with CorrelationContext(function=func_name, **kwargs):
                logger.debug(
                    f"Calling {func_name}",
                    args_count=len(args),
                    kwargs_keys=list(func_kwargs.keys())
                )
                
                try:
                    result = func(*args, **func_kwargs)
                    logger.debug(f"Completed {func_name}", success=True)
                    return result
                except Exception as e:
                    logger.error(
                        f"Error in {func_name}",
                        error=str(e),
                        error_type=type(e).__name__
                    )
                    raise
        
        return wrapper
    return decorator


# Specialized loggers for different components
def get_ingestion_logger() -> structlog.BoundLogger:
    """Get logger for data ingestion operations"""
    return get_logger("xorj.ingestion")


def get_calculation_logger() -> structlog.BoundLogger:
    """Get logger for calculation operations"""
    return get_logger("xorj.calculation")


def get_scoring_logger() -> structlog.BoundLogger:
    """Get logger for scoring operations"""
    return get_logger("xorj.scoring")


def get_api_logger() -> structlog.BoundLogger:
    """Get logger for API operations"""
    return get_logger("xorj.api")


def get_worker_logger() -> structlog.BoundLogger:
    """Get logger for worker operations"""
    return get_logger("xorj.worker")


def get_database_logger() -> structlog.BoundLogger:
    """Get logger for database operations"""
    return get_logger("xorj.database")


def get_reliability_logger() -> structlog.BoundLogger:
    """Get logger for reliability and fault tolerance operations"""
    return get_logger("xorj.reliability")


def get_metrics_logger() -> structlog.BoundLogger:
    """Get logger for metrics and observability operations"""
    return get_logger("xorj.metrics")


# Initialize logging on module import
configure_logging()