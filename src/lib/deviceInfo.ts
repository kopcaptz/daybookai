/**
 * Extended device information for telemetry
 * Privacy-safe: no personal data, only hardware/software specs
 */

export interface ConnectionInfo {
  effectiveType: string | null;  // "4g", "3g", "2g", "slow-2g"
  downlink: number | null;       // Mbps
  rtt: number | null;            // ms
  saveData: boolean | null;
}

export interface ScreenInfo {
  width: number;
  height: number;
  colorDepth: number;
  pixelRatio: number;
  orientation: string | null;
}

export interface PWAInfo {
  isInstalled: boolean;
  serviceWorkerActive: boolean;
}

export interface StorageInfo {
  quota: number | null;
  usage: number | null;
  persistent: boolean;
}

export interface BrowserFeatures {
  notifications: boolean;
  notificationPermission: NotificationPermission | null;
  webGL: boolean;
  indexedDB: boolean;
}

export interface ExtendedDeviceInfo {
  // Basic info
  userAgent: string;
  language: string;
  viewport: { width: number; height: number };
  timestamp: string;
  
  // Extended info
  platform: string;
  hardwareConcurrency: number | null;
  deviceMemory: number | null;
  connection: ConnectionInfo | null;
  screen: ScreenInfo;
  pwa: PWAInfo;
  storage: StorageInfo;
  timezone: string;
  locale: string;
  features: BrowserFeatures;
}

/**
 * Check if WebGL is available
 */
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

/**
 * Get network connection info (if available)
 */
function getConnectionInfo(): ConnectionInfo | null {
  const nav = navigator as any;
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  
  if (!conn) return null;
  
  return {
    effectiveType: conn.effectiveType || null,
    downlink: conn.downlink ?? null,
    rtt: conn.rtt ?? null,
    saveData: conn.saveData ?? null,
  };
}

/**
 * Get screen information
 */
function getScreenInfo(): ScreenInfo {
  return {
    width: screen.width,
    height: screen.height,
    colorDepth: screen.colorDepth,
    pixelRatio: window.devicePixelRatio,
    orientation: screen.orientation?.type || null,
  };
}

/**
 * Get PWA installation status
 */
function getPWAInfo(): PWAInfo {
  return {
    isInstalled: window.matchMedia('(display-mode: standalone)').matches ||
                 (window.navigator as any).standalone === true,
    serviceWorkerActive: !!navigator.serviceWorker?.controller,
  };
}

/**
 * Get storage quota info
 */
async function getStorageInfo(): Promise<StorageInfo> {
  try {
    if (!navigator.storage?.estimate) {
      return { quota: null, usage: null, persistent: false };
    }
    
    const estimate = await navigator.storage.estimate();
    const persistent = await navigator.storage.persisted?.() || false;
    
    return {
      quota: estimate.quota ?? null,
      usage: estimate.usage ?? null,
      persistent,
    };
  } catch {
    return { quota: null, usage: null, persistent: false };
  }
}

/**
 * Get browser feature support
 */
function getBrowserFeatures(): BrowserFeatures {
  return {
    notifications: 'Notification' in window,
    notificationPermission: 'Notification' in window ? Notification.permission : null,
    webGL: hasWebGL(),
    indexedDB: !!window.indexedDB,
  };
}

/**
 * Collect extended device information
 * All data is hardware/software specs, no personal information
 */
export async function getExtendedDeviceInfo(): Promise<ExtendedDeviceInfo> {
  const storageInfo = await getStorageInfo();
  
  return {
    // Basic info (existing)
    userAgent: navigator.userAgent,
    language: navigator.language,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    timestamp: new Date().toISOString(),
    
    // Extended info (new)
    platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemory: (navigator as any).deviceMemory ?? null,
    connection: getConnectionInfo(),
    screen: getScreenInfo(),
    pwa: getPWAInfo(),
    storage: storageInfo,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
    features: getBrowserFeatures(),
  };
}

/**
 * Format device info for display in admin panel
 */
export function formatDeviceInfoSummary(info: Partial<ExtendedDeviceInfo>): string {
  const parts: string[] = [];
  
  // Parse user agent for browser/OS
  if (info.userAgent) {
    const ua = info.userAgent;
    if (ua.includes('Chrome')) parts.push('Chrome');
    else if (ua.includes('Safari')) parts.push('Safari');
    else if (ua.includes('Firefox')) parts.push('Firefox');
    
    if (ua.includes('Android')) parts.push('Android');
    else if (ua.includes('iPhone') || ua.includes('iPad')) parts.push('iOS');
    else if (ua.includes('Windows')) parts.push('Windows');
    else if (ua.includes('Mac')) parts.push('macOS');
  }
  
  // Screen info
  if (info.screen) {
    parts.push(`${info.screen.width}×${info.screen.height}`);
  }
  
  // Connection
  if (info.connection?.effectiveType) {
    parts.push(info.connection.effectiveType.toUpperCase());
  }
  
  // PWA status
  if (info.pwa?.isInstalled) {
    parts.push('PWA');
  }
  
  return parts.join(' • ') || 'Unknown device';
}
