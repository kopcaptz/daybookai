import { lazy, ComponentType } from 'react';

const RELOAD_KEY = 'chunk-reload-attempted';

/**
 * Wrapper for React.lazy that adds retry logic and auto-reload
 * for handling stale chunk errors after deployments.
 * 
 * Flow:
 * 1. Try to import the module
 * 2. If fails, wait 1s and retry once
 * 3. If still fails and we haven't reloaded this session, force reload
 * 4. If reload already attempted, throw error (will be caught by ErrorBoundary)
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  importFn: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await importFn();
    } catch (error) {
      // First retry after 1 second
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await importFn();
      } catch (retryError) {
        // Check if we already tried reloading this session
        if (!sessionStorage.getItem(RELOAD_KEY)) {
          sessionStorage.setItem(RELOAD_KEY, '1');
          // Force reload to get fresh index.html with correct chunk hashes
          window.location.reload();
        }
        // If reload already attempted, let ErrorBoundary handle it
        throw retryError;
      }
    }
  });
}

/**
 * Clear the reload flag - call this on successful app mount
 * to allow future retries if needed
 */
export function clearChunkReloadFlag() {
  sessionStorage.removeItem(RELOAD_KEY);
}
