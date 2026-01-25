/**
 * Global AI PIN Dialog Handler
 * 
 * This component listens for PIN dialog requests from anywhere in the app
 * (services, hooks, etc.) and opens the PIN dialog when needed.
 * 
 * It should be mounted once at the app root level.
 */

import { useState, useEffect, useCallback } from 'react';
import { AIPinDialog } from '@/components/AIPinDialog';
import { useAIAccess } from '@/hooks/useAIAccess';
import { useI18n } from '@/lib/i18n';
import { 
  onPinDialogRequest, 
  notifyPinSuccess, 
  notifyPinCancelled,
} from '@/lib/aiAuthRecovery';

export function GlobalAIPinDialog() {
  const { language } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const aiAccess = useAIAccess(language);

  // Listen for PIN dialog requests from services
  useEffect(() => {
    const unsubscribe = onPinDialogRequest((event) => {
      console.log('[GlobalAIPinDialog] PIN dialog requested', {
        requestId: event.requestId,
        errorCode: event.errorCode,
      });
      setIsOpen(true);
    });

    return unsubscribe;
  }, []);

  // Handle dialog close
  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      // User closed without completing verification
      notifyPinCancelled();
    }
  }, []);

  // Handle PIN verification
  const handleVerify = useCallback(async (pin: string) => {
    setIsVerifying(true);
    try {
      const result = await aiAccess.verifyPin(pin);
      
      if (result.success) {
        // Notify waiting services that PIN was verified
        notifyPinSuccess();
        setIsOpen(false);
      }
      
      return result;
    } finally {
      setIsVerifying(false);
    }
  }, [aiAccess]);

  return (
    <AIPinDialog
      open={isOpen}
      onOpenChange={handleOpenChange}
      onVerify={handleVerify}
      isVerifying={isVerifying}
      language={language}
    />
  );
}
