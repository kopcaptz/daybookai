/**
 * Application version and build info
 * Version format: MAJOR.MINOR.PATCH
 */

export const APP_VERSION = '1.1.0';

// Build timestamp injected by Vite at build time
// Defined in vite.config.ts as __BUILD_TIMESTAMP__
export const BUILD_TIMESTAMP = typeof __BUILD_TIMESTAMP__ !== 'undefined' 
  ? __BUILD_TIMESTAMP__ 
  : new Date().toISOString();

/**
 * Get version info object for telemetry
 */
export function getVersionInfo() {
  return {
    version: APP_VERSION,
    buildTimestamp: BUILD_TIMESTAMP,
  };
}
