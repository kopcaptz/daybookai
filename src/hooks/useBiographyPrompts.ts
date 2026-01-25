import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/lib/i18n';
import { 
  getBiography, 
  shouldPromptBiography, 
  markBioPrompted,
  retryPendingBiographies,
  getTodayDate,
  requestBiographyGeneration,
  StoredBiography,
} from '@/lib/biographyService';
import { db, loadBioSettings } from '@/lib/db';
import { loadAISettings } from '@/lib/aiConfig';

export interface BiographyPrompt {
  type: 'generate' | 'update';
  date: string;
  existingBio?: StoredBiography;
}

export function useBiographyPrompts() {
  const { language } = useI18n();
  const [prompt, setPrompt] = useState<BiographyPrompt | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  
  // Check for pending biographies and prompts on mount
  useEffect(() => {
    if (isChecked) return;
    
    const checkBiographies = async () => {
      const settings = loadAISettings();
      if (!settings.enabled) {
        setIsChecked(true);
        return;
      }
      
      // First, retry any pending biographies
      await retryPendingBiographies(language);
      
      // Then check if we should prompt for today
      if (shouldPromptBiography()) {
        const today = getTodayDate();
        const existingBio = await getBiography(today);
        
        // Check if there are entries for today
        const entries = await db.entries
          .where('date')
          .equals(today)
          .filter(e => !e.isPrivate && e.aiAllowed !== false)
          .count();
        
        if (entries > 0 && (!existingBio || existingBio.status !== 'complete')) {
          setPrompt({ type: 'generate', date: today, existingBio });
        }
      }
      
      setIsChecked(true);
    };
    
    checkBiographies();
  }, [language, isChecked]);
  
  // Generate biography (user-initiated, show toast on error)
  const generate = useCallback(async (date: string) => {
    setIsGenerating(true);
    try {
      // showToast = true for user-initiated generation
      const bio = await requestBiographyGeneration(date, language, true);
      if (date === getTodayDate()) {
        markBioPrompted();
      }
      setPrompt(null);
      return bio;
    } finally {
      setIsGenerating(false);
    }
  }, [language]);
  
  // Dismiss prompt
  const dismiss = useCallback(() => {
    if (prompt?.date === getTodayDate()) {
      markBioPrompted();
    }
    setPrompt(null);
  }, [prompt]);
  
  // Prompt for update (called when saving entry for past day)
  const promptUpdate = useCallback(async (date: string) => {
    const existingBio = await getBiography(date);
    if (existingBio?.status === 'complete') {
      setPrompt({ type: 'update', date, existingBio });
    }
  }, []);
  
  return {
    prompt,
    isGenerating,
    generate,
    dismiss,
    promptUpdate,
  };
}
