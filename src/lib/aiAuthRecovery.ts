/**
 * AI Auth Recovery - Global event-based system for 401 retry
 * 
 * This module provides a unified way to:
 * 1. Trigger the PIN dialog from anywhere (services, components)
 * 2. Wait for PIN verification success
 * 3. Retry failed AI requests once after successful PIN entry
 */

// Known AI error codes that trigger PIN dialog
export const AI_AUTH_ERRORS = [
  'ai_token_required',
  'token_expired',
  'invalid_token',
  'invalid_token_format',
  'invalid_token_signature',
] as const;

export type AIAuthErrorCode = typeof AI_AUTH_ERRORS[number];

// Service configuration errors (don't retry)
export const AI_SERVICE_ERRORS = [
  'service_not_configured',
] as const;

export type AIServiceErrorCode = typeof AI_SERVICE_ERRORS[number];

// All known AI error codes
export type AIErrorCode = AIAuthErrorCode | AIServiceErrorCode | 'network_error' | 'unknown';

// Error response from AI edge functions
export interface AIErrorResponse {
  error: string;
  requestId?: string;
  hint?: string;
}

// Event for requesting PIN dialog
interface RequestPinEvent {
  requestId?: string;
  errorCode?: string;
}

// Internal state for managing shared promise
interface PendingPinState {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
  requestId?: string;
  errorCode?: string;
}

// Global state for PIN request coordination
// Multiple callers share the SAME pending promise
let pendingPinState: PendingPinState | null = null;
const pinDialogListeners: Set<(event: RequestPinEvent) => void> = new Set();

/**
 * Check if an error code requires PIN authentication
 */
export function isAuthError(errorCode: string): boolean {
  return AI_AUTH_ERRORS.includes(errorCode as AIAuthErrorCode);
}

/**
 * Check if an error code is a service configuration error (can't retry)
 */
export function isServiceError(errorCode: string): boolean {
  return AI_SERVICE_ERRORS.includes(errorCode as AIServiceErrorCode);
}

/**
 * Register a listener for PIN dialog requests (used by App component)
 */
export function onPinDialogRequest(listener: (event: RequestPinEvent) => void): () => void {
  pinDialogListeners.add(listener);
  return () => pinDialogListeners.delete(listener);
}

/**
 * Check if a PIN dialog is already pending
 */
export function isPinDialogPending(): boolean {
  return pendingPinState !== null;
}

/**
 * Request the PIN dialog to open and wait for result.
 * 
 * CONCURRENCY: If a PIN dialog is already pending, returns the existing
 * shared promise so all callers wait for the same result. This prevents
 * race conditions where multiple 401s cancel each other.
 * 
 * Returns a promise that resolves when PIN is verified, rejects on cancel/error.
 */
export function requestPinDialog(requestId?: string, errorCode?: string): Promise<void> {
  // If already pending, return the existing shared promise
  // All callers will resolve/reject together
  if (pendingPinState) {
    console.log('[aiAuthRecovery] PIN dialog already pending, joining existing request');
    return pendingPinState.promise;
  }
  
  // Create new shared state with externally-controlled promise
  let resolvePromise: () => void;
  let rejectPromise: (error: Error) => void;
  
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  
  pendingPinState = {
    promise,
    resolve: resolvePromise!,
    reject: rejectPromise!,
    requestId,
    errorCode,
  };
  
  // Notify all listeners (dialog should open)
  const event: RequestPinEvent = { requestId, errorCode };
  pinDialogListeners.forEach(listener => {
    try {
      listener(event);
    } catch (e) {
      console.error('PIN dialog listener error:', e);
    }
  });
  
  // If no listeners, reject immediately
  if (pinDialogListeners.size === 0) {
    const error = new Error('No PIN dialog handler registered');
    pendingPinState.reject(error);
    pendingPinState = null;
    return Promise.reject(error);
  }
  
  return promise;
}

/**
 * Called by PIN dialog when verification succeeds.
 * Resolves ALL waiting callers.
 */
export function notifyPinSuccess(): void {
  if (pendingPinState) {
    console.log('[aiAuthRecovery] PIN success, resolving all waiters');
    pendingPinState.resolve();
    pendingPinState = null;
  }
}

/**
 * Called by PIN dialog when user cancels or dialog closes.
 * Rejects ALL waiting callers with 'pin_cancelled'.
 */
export function notifyPinCancelled(): void {
  if (pendingPinState) {
    console.log('[aiAuthRecovery] PIN cancelled, rejecting all waiters');
    pendingPinState.reject(new Error('pin_cancelled'));
    pendingPinState = null;
  }
}

/**
 * Parse API response to extract error info
 */
export async function parseAIErrorResponse(response: Response): Promise<AIErrorResponse | null> {
  const requestId = response.headers.get('X-Request-Id') || undefined;
  
  try {
    const data = await response.json();
    return {
      error: data.error || 'unknown',
      requestId: requestId || data.requestId,
      hint: data.hint,
    };
  } catch {
    return {
      error: 'unknown',
      requestId,
    };
  }
}

/**
 * Wrapper that retries an AI request once if 401 is returned
 * 
 * Usage:
 * ```ts
 * const result = await withAIAccessRetry(async () => {
 *   const response = await fetch(AI_URL, { headers: getAITokenHeader() });
 *   if (response.status === 401) {
 *     throw await createAIAuthError(response);
 *   }
 *   return response.json();
 * });
 * ```
 */
export async function withAIAccessRetry<T>(
  fn: () => Promise<T>,
  options?: { maxRetries?: number }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 1;
  let lastError: AIAuthRetryError | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // Check if this is a retryable auth error
      if (error instanceof AIAuthRetryError && error.isRetryable && attempt < maxRetries) {
        lastError = error;
        
        // Request PIN dialog and wait for success
        try {
          await requestPinDialog(error.requestId, error.errorCode);
          // PIN succeeded, continue to retry
          continue;
        } catch (pinError) {
          // User cancelled or PIN dialog unavailable
          if (pinError instanceof Error && pinError.message === 'pin_cancelled') {
            throw new AIAuthRetryError(
              error.errorCode,
              error.requestId,
              false, // No longer retryable
              'User cancelled PIN entry'
            );
          }
          throw pinError;
        }
      }
      
      // Not a retryable error, re-throw
      throw error;
    }
  }
  
  // Should not reach here, but just in case
  throw lastError || new Error('Max retries exceeded');
}

/**
 * Custom error class for AI auth errors with retry support
 */
export class AIAuthRetryError extends Error {
  constructor(
    public readonly errorCode: string,
    public readonly requestId?: string,
    public readonly isRetryable: boolean = true,
    message?: string
  ) {
    super(message || getErrorMessage(errorCode, 'en'));
    this.name = 'AIAuthRetryError';
  }
}

/**
 * Create an AIAuthRetryError from a 401 response
 */
export async function createAIAuthError(response: Response): Promise<AIAuthRetryError> {
  const errorData = await parseAIErrorResponse(response);
  const errorCode = errorData?.error || 'ai_token_required';
  const isRetryable = isAuthError(errorCode);
  
  return new AIAuthRetryError(
    errorCode,
    errorData?.requestId,
    isRetryable,
    errorData?.hint
  );
}

/**
 * Get localized error message for AI error codes
 */
export function getErrorMessage(errorCode: string, language: string): string {
  // Use base language for messages (he/ar fall back to en)
  const baseLang = (language === 'ru') ? 'ru' : 'en';
  
  const messages: Record<string, { ru: string; en: string }> = {
    ai_token_required: {
      ru: 'Требуется авторизация ИИ',
      en: 'AI authorization required',
    },
    token_expired: {
      ru: 'Сессия ИИ истекла',
      en: 'AI session expired',
    },
    invalid_token: {
      ru: 'Недействительный токен ИИ',
      en: 'Invalid AI token',
    },
    invalid_token_format: {
      ru: 'Неверный формат токена',
      en: 'Invalid token format',
    },
    invalid_token_signature: {
      ru: 'Недействительная подпись токена',
      en: 'Invalid token signature',
    },
    service_not_configured: {
      ru: 'Сервис ИИ не настроен',
      en: 'AI service not configured',
    },
    network_error: {
      ru: 'Ошибка сети',
      en: 'Network error',
    },
    pin_cancelled: {
      ru: 'Авторизация отменена',
      en: 'Authorization cancelled',
    },
  };
  
  return messages[errorCode]?.[baseLang] || 
    (baseLang === 'ru' ? 'Неизвестная ошибка' : 'Unknown error');
}

/**
 * Format error with requestId for display
 */
export function formatErrorWithRequestId(
  message: string,
  requestId?: string,
  language: string = 'ru'
): string {
  if (!requestId) return message;
  
  const shortId = requestId.slice(0, 8);
  const baseLang = (language === 'ru') ? 'ru' : 'en';
  const prefix = baseLang === 'ru' ? 'ID запроса' : 'Request ID';
  return `${message}\n\n${prefix}: ${shortId}...`;
}
