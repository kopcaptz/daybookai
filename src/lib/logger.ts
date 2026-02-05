/**
 * Centralized Logger for Production-Safe Logging
 * 
 * Features:
 * - Environment-aware log levels (Production: warn/error only)
 * - Sensitive data masking (text, email, pin, token, etc.)
 * - Integration with crash reporter for errors
 * - Consistent formatting with tags
 */

import { reportCrash } from './crashReporter';

// Log levels
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

// Current level based on environment
const currentLevel = import.meta.env.PROD ? LOG_LEVELS.warn : LOG_LEVELS.debug;

// Sensitive field names to mask
const SENSITIVE_FIELDS = new Set([
  'text',
  'content',
  'narrative',
  'email',
  'pin',
  'password',
  'token',
  'apiKey',
  'secret',
  'authorization',
  'cookie',
  'sessionId',
  'deviceId',
]);

// Max string length before truncation
const MAX_STRING_LENGTH = 200;

/**
 * Mask sensitive data in objects/values
 */
function maskSensitive(value: unknown, depth = 0): unknown {
  // Prevent infinite recursion
  if (depth > 5) return '[MAX_DEPTH]';

  // Handle null/undefined
  if (value === null || value === undefined) return value;

  // Handle Blob - just show metadata
  if (value instanceof Blob) {
    return `[Blob: ${value.type}, ${value.size} bytes]`;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    if (value.length > 10) {
      return `[Array: ${value.length} items]`;
    }
    return value.map(item => maskSensitive(item, depth + 1));
  }

  // Handle objects
  if (typeof value === 'object') {
    const masked: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      
      // Check if field is sensitive
      if (SENSITIVE_FIELDS.has(key) || SENSITIVE_FIELDS.has(lowerKey)) {
        if (typeof val === 'string') {
          if (key === 'email' || lowerKey.includes('email')) {
            masked[key] = '***@***';
          } else if (key === 'pin' || lowerKey.includes('pin')) {
            masked[key] = '****';
          } else {
            masked[key] = '[REDACTED]';
          }
        } else {
          masked[key] = '[REDACTED]';
        }
      } else {
        masked[key] = maskSensitive(val, depth + 1);
      }
    }
    return masked;
  }

  // Handle strings - truncate long ones
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) {
      return value.substring(0, MAX_STRING_LENGTH) + `... [${value.length - MAX_STRING_LENGTH} more chars]`;
    }
    return value;
  }

  return value;
}

/**
 * Format log message with tag
 */
function formatMessage(tag: string, message: string): string {
  return `[${tag}] ${message}`;
}

/**
 * Check if log level should be output
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= currentLevel;
}

/**
 * Logger object with debug/info/warn/error methods
 */
export const logger = {
  /**
   * Debug logs - dev only
   */
  debug(tag: string, message: string, ...args: unknown[]): void {
    if (!shouldLog('debug')) return;
    const maskedArgs = args.map(arg => maskSensitive(arg));
    console.log(formatMessage(tag, message), ...maskedArgs);
  },

  /**
   * Info logs - dev + staging
   */
  info(tag: string, message: string, ...args: unknown[]): void {
    if (!shouldLog('info')) return;
    const maskedArgs = args.map(arg => maskSensitive(arg));
    console.info(formatMessage(tag, message), ...maskedArgs);
  },

  /**
   * Warning logs - all environments
   */
  warn(tag: string, message: string, ...args: unknown[]): void {
    if (!shouldLog('warn')) return;
    const maskedArgs = args.map(arg => maskSensitive(arg));
    console.warn(formatMessage(tag, message), ...maskedArgs);
  },

  /**
   * Error logs - all environments + crash reporter
   */
  error(tag: string, message: string, error?: Error | unknown, ...args: unknown[]): void {
    if (!shouldLog('error')) return;
    
    const maskedArgs = args.map(arg => maskSensitive(arg));
    const formattedMessage = formatMessage(tag, message);
    
    if (error instanceof Error) {
      console.error(formattedMessage, error, ...maskedArgs);
      
      // Send to crash reporter
      reportCrash({
        message: `[${tag}] ${message}: ${error.message}`,
        stack: error.stack,
      });
    } else if (error !== undefined) {
      console.error(formattedMessage, maskSensitive(error), ...maskedArgs);
    } else {
      console.error(formattedMessage, ...maskedArgs);
    }
  },

  /**
   * Group logs (dev only)
   */
  group(tag: string, label: string): void {
    if (!shouldLog('debug')) return;
    console.group(formatMessage(tag, label));
  },

  /**
   * End log group (dev only)
   */
  groupEnd(): void {
    if (!shouldLog('debug')) return;
    console.groupEnd();
  },

  /**
   * Time tracking (dev only)
   */
  time(label: string): void {
    if (!shouldLog('debug')) return;
    console.time(label);
  },

  /**
   * End time tracking (dev only)
   */
  timeEnd(label: string): void {
    if (!shouldLog('debug')) return;
    console.timeEnd(label);
  },
};

export default logger;
