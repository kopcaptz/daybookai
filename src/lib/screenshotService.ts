/**
 * Screenshot Service
 * Captures visible DOM area with privacy-preserving blur for sensitive elements
 */

export interface ScreenshotOptions {
  excludeSelectors?: string[];  // Elements to exclude (e.g., FAB)
  blurSelectors?: string[];     // Elements to blur for privacy
  maxSize?: number;             // Max file size in bytes (default 2MB)
  scale?: number;               // Canvas scale (default 1, use 0.5 for mobile)
}

export type ScreenshotResult = 
  | {
      success: true;
      blob: Blob;
      base64DataUrl: string;
      dimensions: { width: number; height: number };
      capturedAt: number;
    }
  | {
      success: false;
      error: 'capture_failed' | 'too_large' | 'timeout' | 'library_load_failed';
      message: string;
    };

// Default selectors for privacy blur
const DEFAULT_BLUR_SELECTORS = [
  'input[type="password"]',
  '.blur-private',
  '[data-blur-private]',
  '.otp-input',
];

// Default selectors to exclude from capture
const DEFAULT_EXCLUDE_SELECTORS = [
  '[data-floating-chat-button]',
  '.floating-chat-button',
];

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const CAPTURE_TIMEOUT = 5000; // 5 seconds

/**
 * Lazy load html2canvas to reduce initial bundle size
 */
async function loadHtml2Canvas() {
  try {
    const module = await import('html2canvas');
    return module.default;
  } catch (error) {
    console.error('[Screenshot] Failed to load html2canvas:', error);
    throw new Error('library_load_failed');
  }
}

/**
 * Apply temporary blur filter to sensitive elements
 */
function applyPrivacyBlur(selectors: string[]): HTMLElement[] {
  const blurredElements: HTMLElement[] = [];
  
  selectors.forEach(selector => {
    try {
      const elements = document.querySelectorAll<HTMLElement>(selector);
      elements.forEach(el => {
        if (el.style.filter !== 'blur(10px)') {
          const originalFilter = el.style.filter;
          el.dataset.originalFilter = originalFilter;
          el.style.filter = 'blur(10px)';
          blurredElements.push(el);
        }
      });
    } catch (e) {
      // Invalid selector, skip
    }
  });
  
  return blurredElements;
}

/**
 * Restore original filters after capture
 */
function restorePrivacyBlur(elements: HTMLElement[]): void {
  elements.forEach(el => {
    el.style.filter = el.dataset.originalFilter || '';
    delete el.dataset.originalFilter;
  });
}

/**
 * Compress canvas to fit within max file size
 */
async function compressCanvas(
  canvas: HTMLCanvasElement,
  maxSize: number
): Promise<Blob> {
  let quality = 0.92;
  let blob: Blob | null = null;
  
  // First try PNG
  blob = await new Promise<Blob | null>(resolve => {
    canvas.toBlob(resolve, 'image/png');
  });
  
  if (blob && blob.size <= maxSize) {
    return blob;
  }
  
  // If PNG is too large, try JPEG with decreasing quality
  while (quality > 0.3) {
    blob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });
    
    if (blob && blob.size <= maxSize) {
      return blob;
    }
    
    quality -= 0.1;
  }
  
  // Last resort: scale down the canvas
  const scale = 0.7;
  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = canvas.width * scale;
  scaledCanvas.height = canvas.height * scale;
  const ctx = scaledCanvas.getContext('2d');
  ctx?.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
  
  blob = await new Promise<Blob | null>(resolve => {
    scaledCanvas.toBlob(resolve, 'image/jpeg', 0.7);
  });
  
  if (!blob) {
    throw new Error('Failed to compress image');
  }
  
  return blob;
}

/**
 * Convert blob to base64 data URL
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Capture the visible area of the screen
 */
export async function captureVisibleArea(
  options: ScreenshotOptions = {}
): Promise<ScreenshotResult> {
  const {
    excludeSelectors = DEFAULT_EXCLUDE_SELECTORS,
    blurSelectors = DEFAULT_BLUR_SELECTORS,
    maxSize = MAX_FILE_SIZE,
    scale = window.innerWidth < 768 ? 0.5 : 1, // Lower scale for mobile
  } = options;

  const startTime = performance.now();
  let blurredElements: HTMLElement[] = [];
  
  try {
    // Load html2canvas lazily
    const html2canvas = await loadHtml2Canvas();
    
    // Apply privacy blur
    blurredElements = applyPrivacyBlur(blurSelectors);
    
    // Capture with timeout
    const capturePromise = html2canvas(document.body, {
      scale,
      useCORS: true,
      allowTaint: true,
      logging: false,
      ignoreElements: (element: Element) => {
        return excludeSelectors.some(selector => {
          try {
            return element.matches(selector);
          } catch {
            return false;
          }
        });
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), CAPTURE_TIMEOUT);
    });

    const canvas = await Promise.race([capturePromise, timeoutPromise]);
    
    // Restore original filters
    restorePrivacyBlur(blurredElements);
    blurredElements = [];
    
    // Compress if needed
    const blob = await compressCanvas(canvas, maxSize);
    const base64DataUrl = await blobToDataUrl(blob);
    
    const captureTime = performance.now() - startTime;
    console.log(`[Screenshot] Captured in ${captureTime.toFixed(0)}ms, size: ${(blob.size / 1024).toFixed(1)}KB`);
    
    return {
      success: true,
      blob,
      base64DataUrl,
      dimensions: {
        width: canvas.width,
        height: canvas.height,
      },
      capturedAt: Date.now(),
    };
  } catch (error) {
    // Always restore blur on error
    restorePrivacyBlur(blurredElements);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Screenshot] Capture failed:', errorMessage);
    
    if (errorMessage === 'timeout') {
      return {
        success: false,
        error: 'timeout',
        message: 'Screenshot capture timed out',
      };
    }
    
    if (errorMessage === 'library_load_failed') {
      return {
        success: false,
        error: 'library_load_failed',
        message: 'Failed to load screenshot library',
      };
    }
    
    return {
      success: false,
      error: 'capture_failed',
      message: errorMessage,
    };
  }
}

/**
 * Message types for postMessage communication
 */
export interface AutoScreenshotPayload {
  base64DataUrl: string;
  timestamp: number;
  prompt: string;
  route: string;
}

export interface AutoScreenshotMessage {
  type: 'AUTO_SCREENSHOT';
  payload: AutoScreenshotPayload;
}

/**
 * Check if a message is an auto-screenshot message
 */
export function isAutoScreenshotMessage(data: unknown): data is AutoScreenshotMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as AutoScreenshotMessage).type === 'AUTO_SCREENSHOT' &&
    typeof (data as AutoScreenshotMessage).payload === 'object'
  );
}
