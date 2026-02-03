import { useState, useCallback, useEffect } from 'react';
import { 
  isAITokenValid, 
  verifyPinAndGetToken, 
  clearAIToken,
  getTokenRemainingTime,
  formatTokenExpiry,
} from '@/lib/aiTokenService';
import { loadAISettings } from '@/lib/aiConfig';

export interface UseAIAccessReturn {
  // Token state
  hasValidToken: boolean;
  tokenExpiryFormatted: string;
  
  // Dialog control
  showPinDialog: boolean;
  openPinDialog: () => void;
  closePinDialog: () => void;
  
  // PIN verification
  verifyPin: (pin: string) => Promise<{ success: boolean; error?: string }>;
  isVerifying: boolean;
  
  // Token management
  revokeAccess: () => void;
  
  // Combined check: AI enabled + valid token
  canUseAI: boolean;
  
  // Require access (opens dialog if needed, returns true if already valid)
  requireAccess: () => boolean;
}

export function useAIAccess(language: string = 'ru'): UseAIAccessReturn {
  const [hasValidToken, setHasValidToken] = useState(() => isAITokenValid());
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [tokenExpiryFormatted, setTokenExpiryFormatted] = useState(() => 
    formatTokenExpiry(language)
  );
  
  const settings = loadAISettings();
  
  // Re-check token validity periodically and on focus
  useEffect(() => {
    const checkToken = () => {
      setHasValidToken(isAITokenValid());
      setTokenExpiryFormatted(formatTokenExpiry(language));
    };
    
    // Check every minute
    const interval = setInterval(checkToken, 60000);
    
    // Check on window focus
    window.addEventListener('focus', checkToken);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkToken);
    };
  }, [language]);
  
  const openPinDialog = useCallback(() => {
    setShowPinDialog(true);
  }, []);
  
  const closePinDialog = useCallback(() => {
    setShowPinDialog(false);
  }, []);
  
  const verifyPin = useCallback(async (pin: string) => {
    setIsVerifying(true);
    try {
      const result = await verifyPinAndGetToken(pin);
      
      if (result.success) {
        setHasValidToken(true);
        setTokenExpiryFormatted(formatTokenExpiry(language));
        setShowPinDialog(false);
      }
      
      return result;
    } finally {
      setIsVerifying(false);
    }
  }, [language]);
  
  const revokeAccess = useCallback(() => {
    clearAIToken();
    setHasValidToken(false);
    setTokenExpiryFormatted(formatTokenExpiry(language));
  }, [language]);
  
  const requireAccess = useCallback(() => {
    if (isAITokenValid()) {
      return true;
    }
    setShowPinDialog(true);
    return false;
  }, []);
  
  // Can use AI = AI is enabled in settings AND has valid token
  const canUseAI = settings.enabled && hasValidToken;
  
  return {
    hasValidToken,
    tokenExpiryFormatted,
    showPinDialog,
    openPinDialog,
    closePinDialog,
    verifyPin,
    isVerifying,
    revokeAccess,
    canUseAI,
    requireAccess,
  };
}
