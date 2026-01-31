import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useI18n } from '@/lib/i18n';
import { fetchWhisper, getCachedWhisper, getFallbackWhisper } from '@/lib/whisperService';

export function useOracleWhisper() {
  const { language } = useI18n();
  const [whisper, setWhisper] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    
    // Try cache first for instant display
    const cached = getCachedWhisper(today);
    if (cached) {
      setWhisper(cached);
      setIsLoading(false);
      return;
    }
    
    // Show fallback immediately while fetching
    const fallback = getFallbackWhisper(language, today);
    setWhisper(fallback);
    
    // Fetch from AI (will cache result)
    fetchWhisper(language)
      .then(result => {
        setWhisper(result);
      })
      .catch(() => {
        // Keep fallback on error
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [language]);
  
  return { whisper, isLoading };
}
