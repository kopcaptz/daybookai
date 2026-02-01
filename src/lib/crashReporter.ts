/**
 * Crash Reporter - Automated JS error tracking
 * Privacy-safe: captures stack traces and context, NOT user content
 */

import { APP_VERSION, BUILD_TIMESTAMP } from './appVersion';
import { getExtendedDeviceInfo, ExtendedDeviceInfo } from './deviceInfo';

// Generate unique session ID on load
const SESSION_ID = crypto.randomUUID();

// Breadcrumb buffer - last 10 actions before crash
const MAX_BREADCRUMBS = 10;
const breadcrumbs: string[] = [];

// Error buffer for batch sending
const MAX_ERROR_BUFFER = 5;
const errorBuffer: CrashReport[] = [];
let flushTimeout: number | null = null;

export interface CrashReport {
  message: string;
  stack: string | null;
  componentStack?: string;
  url: string;
  appVersion: string;
  buildTimestamp: string;
  timestamp: number;
  sessionId: string;
  deviceInfo?: ExtendedDeviceInfo;
  breadcrumbs: string[];
}

/**
 * Add a breadcrumb for context
 */
export function addBreadcrumb(action: string): void {
  const timestamp = new Date().toISOString().slice(11, 19); // HH:MM:SS
  const crumb = `[${timestamp}] ${action}`;
  
  breadcrumbs.push(crumb);
  
  // Keep only last N breadcrumbs
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.shift();
  }
}

/**
 * Report an error to the crash reporting system
 */
export async function reportCrash(options: {
  message: string;
  stack?: string | null;
  componentStack?: string;
}): Promise<void> {
  try {
    const deviceInfo = await getExtendedDeviceInfo();
    
    const report: CrashReport = {
      message: options.message,
      stack: options.stack ?? null,
      componentStack: options.componentStack,
      url: window.location.href,
      appVersion: APP_VERSION,
      buildTimestamp: BUILD_TIMESTAMP,
      timestamp: Date.now(),
      sessionId: SESSION_ID,
      deviceInfo,
      breadcrumbs: [...breadcrumbs],
    };
    
    errorBuffer.push(report);
    
    console.warn('[CrashReporter] Error captured:', {
      message: options.message,
      breadcrumbs: breadcrumbs.length,
      bufferSize: errorBuffer.length,
    });
    
    // Flush immediately if buffer is full
    if (errorBuffer.length >= MAX_ERROR_BUFFER) {
      flushErrors();
    } else {
      // Schedule flush in 30 seconds
      scheduleFlush();
    }
  } catch (e) {
    console.error('[CrashReporter] Failed to capture error:', e);
  }
}

/**
 * Schedule a delayed flush
 */
function scheduleFlush(): void {
  if (flushTimeout) return;
  
  flushTimeout = window.setTimeout(() => {
    flushTimeout = null;
    flushErrors();
  }, 30000); // 30 seconds
}

/**
 * Flush error buffer to server
 */
async function flushErrors(): Promise<void> {
  if (errorBuffer.length === 0) return;
  
  // Take all errors from buffer
  const errorsToSend = [...errorBuffer];
  errorBuffer.length = 0;
  
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crash-report`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reports: errorsToSend }),
      }
    );
    
    if (!response.ok) {
      console.error('[CrashReporter] Failed to send errors:', response.status);
      // Put errors back in buffer for retry
      errorBuffer.push(...errorsToSend);
    } else {
      console.info('[CrashReporter] Sent', errorsToSend.length, 'error(s)');
    }
  } catch (e) {
    console.error('[CrashReporter] Network error:', e);
    // Put errors back in buffer for retry
    errorBuffer.push(...errorsToSend);
  }
}

/**
 * Global error handler
 */
function handleGlobalError(
  message: string | Event,
  source?: string,
  lineno?: number,
  colno?: number,
  error?: Error
): boolean {
  const errorMessage = error?.message || String(message);
  const stack = error?.stack || `at ${source}:${lineno}:${colno}`;
  
  reportCrash({
    message: errorMessage,
    stack,
  });
  
  // Don't prevent default error logging
  return false;
}

/**
 * Unhandled promise rejection handler
 */
function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  const reason = event.reason;
  const message = reason?.message || String(reason);
  const stack = reason?.stack || null;
  
  reportCrash({
    message: `Unhandled Promise Rejection: ${message}`,
    stack,
  });
}

/**
 * Initialize crash reporter - call once on app start
 */
export function initCrashReporter(): void {
  // Set up global error handlers
  window.onerror = handleGlobalError;
  window.onunhandledrejection = handleUnhandledRejection;
  
  // Flush on page unload
  window.addEventListener('beforeunload', () => {
    if (errorBuffer.length > 0) {
      // Use sendBeacon for reliable delivery on unload
      const data = JSON.stringify({ reports: errorBuffer });
      navigator.sendBeacon(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crash-report`,
        data
      );
    }
  });
  
  // Add initial breadcrumb
  addBreadcrumb(`App started (v${APP_VERSION})`);
  
  console.info('[CrashReporter] Initialized', {
    version: APP_VERSION,
    sessionId: SESSION_ID.slice(0, 8),
  });
}

/**
 * Helper to track navigation
 */
export function trackNavigation(path: string): void {
  addBreadcrumb(`Navigate: ${path}`);
}

/**
 * Helper to track clicks
 */
export function trackClick(target: string): void {
  addBreadcrumb(`Click: ${target}`);
}

/**
 * Helper to track API calls
 */
export function trackApiCall(endpoint: string, status?: number): void {
  if (status) {
    addBreadcrumb(`API: ${endpoint} → ${status}`);
  } else {
    addBreadcrumb(`API: ${endpoint}`);
  }
}

/**
 * Get current session ID
 */
export function getSessionId(): string {
  return SESSION_ID;
}
