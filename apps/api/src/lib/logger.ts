/**
 * Structured logging utility for ClipShare API
 * Uses Pino for structured JSON logging with pretty-print in development
 */

import pino from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

// Create the base logger instance
const logger = pino({
  level: logLevel,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  base: {
    service: 'clipshare-api',
    environment: process.env.NODE_ENV || 'development',
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
});

/**
 * Create a child logger with additional context
 */
export function createLogger(context: Record<string, unknown> = {}): pino.Logger {
  return logger.child(context);
}

/**
 * Request context type for API route logging
 */
export interface RequestContext {
  method: string;
  url: string;
  headers?: Record<string, string | string[] | undefined>;
  userId?: string;
  correlationId?: string;
}

/**
 * Create a logger with request context for API routes
 */
export function createRequestLogger(context: RequestContext): pino.Logger {
  const correlationId = context.correlationId || generateCorrelationId();
  
  return logger.child({
    correlationId,
    http: {
      method: context.method,
      url: context.url,
      userId: context.userId,
    },
  });
}

/**
 * Generate a unique correlation ID for request tracing
 */
export function generateCorrelationId(): string {
  return `corr_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Log API request with timing
 */
export function logRequest(
  logger: pino.Logger,
  options: {
    method: string;
    url: string;
    statusCode?: number;
    duration?: number;
    userId?: string;
    error?: Error;
  }
): void {
  const { method, url, statusCode, duration, userId, error } = options;
  
  const logData = {
    http: {
      method,
      url,
      statusCode,
      duration_ms: duration,
    },
    userId,
  };

  if (error) {
    logger.error({ ...logData, error: formatError(error) }, 'Request failed');
  } else if (statusCode && statusCode >= 400) {
    logger.warn({ ...logData }, 'Request error');
  } else {
    logger.info({ ...logData }, 'Request completed');
  }
}

/**
 * Format error for logging
 */
export function formatError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    };
  }
  return { message: String(error) };
}

// Export the default logger
export default logger;
