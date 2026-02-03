/**
 * Hook for managing auto-screenshot functionality
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { captureVisibleArea, ScreenshotResult, AutoScreenshotPayload } from '@/lib/screenshotService';
import { loadAISettings } from '@/lib/aiConfig';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { Language } from '@/lib/i18n';

export interface UseAutoScreenshotOptions {
  language?: Language;
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
  onCaptureStart?: () => void;
  onCaptureComplete?: (result: ScreenshotResult) => void;
}

export interface UseAutoScreenshotReturn {
  isCapturing: boolean;
  lastCapture: ScreenshotResult | null;
  captureAndSend: () => Promise<boolean>;
  isEnabled: boolean;
}

const DEFAULT_PROMPT_RU = 'Посмотри этот скрин и что на нём важно?';
const DEFAULT_PROMPT_EN = 'Look at this screen and what\'s important on it?';

export function useAutoScreenshot(options: UseAutoScreenshotOptions = {}): UseAutoScreenshotReturn {
  const { 
    language = 'ru', 
    iframeRef,
    onCaptureStart,
    onCaptureComplete,
  } = options;
  
  const location = useLocation();
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastCapture, setLastCapture] = useState<ScreenshotResult | null>(null);
  const [isEnabled, setIsEnabled] = useState(false);
  
  // Track mount state to avoid state updates after unmount
  const isMountedRef = useRef(true);
  
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  // Load settings on mount and when focused
  useEffect(() => {
    const checkSettings = () => {
      const settings = loadAISettings();
      setIsEnabled(settings.autoScreenshot ?? false);
    };
    
    checkSettings();
    window.addEventListener('focus', checkSettings);
    return () => window.removeEventListener('focus', checkSettings);
  }, []);
  
  const captureAndSend = useCallback(async (): Promise<boolean> => {
    const settings = loadAISettings();
    
    if (!settings.autoScreenshot) {
      return false;
    }
    
    if (!iframeRef?.current) {
      console.warn('[AutoScreenshot] No iframe reference available');
      return false;
    }
    
    onCaptureStart?.();
    setIsCapturing(true);
    
    try {
      const result = await captureVisibleArea({
        blurSelectors: settings.autoScreenshotBlurPrivate 
          ? undefined // Use defaults 
          : [], // Disable blur
      });
      
      if (!isMountedRef.current) return false;
      
      setLastCapture(result);
      onCaptureComplete?.(result);
      
      if (!result.success) {
        const errorMessage = language === 'ru' 
          ? 'Не удалось захватить экран' 
          : 'Failed to capture screen';
        toast.error(errorMessage);
        return false;
      }
      
      // Prepare payload for iframe
      const payload: AutoScreenshotPayload = {
        base64DataUrl: result.base64DataUrl,
        timestamp: result.capturedAt,
        prompt: language === 'ru' ? DEFAULT_PROMPT_RU : DEFAULT_PROMPT_EN,
        route: location.pathname,
      };
      
      // Send to iframe via postMessage
      try {
        iframeRef.current.contentWindow?.postMessage(
          { type: 'AUTO_SCREENSHOT', payload },
          window.location.origin
        );
        return true;
      } catch (postError) {
        console.error('[AutoScreenshot] Failed to send to iframe:', postError);
        return false;
      }
    } catch (error) {
      console.error('[AutoScreenshot] Unexpected error:', error);
      return false;
    } finally {
      if (isMountedRef.current) {
        setIsCapturing(false);
      }
    }
  }, [iframeRef, language, location.pathname, onCaptureStart, onCaptureComplete]);
  
  return {
    isCapturing,
    lastCapture,
    captureAndSend,
    isEnabled,
  };
}
