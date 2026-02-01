// Auto-Tags Hook - Debounced tag suggestions from text analysis
// For Cyber-Grimoire Daybook Journal

import { useState, useEffect, useCallback, useRef } from 'react';
import { detectTags, TagSuggestion } from '@/lib/autoTagService';
import { loadAISettings } from '@/lib/aiConfig';
import { trackUsageEvent } from '@/lib/usageTracker';

export interface AutoTagsResult {
  // Suggested tags from analysis
  suggestedTags: TagSuggestion[];
  // Whether user has accepted/rejected suggestions (stops auto-updates)
  userInteracted: boolean;
  // Accept a suggested tag
  acceptTag: (tag: string) => void;
  // Dismiss a suggested tag
  dismissTag: (tag: string) => void;
  // Accept all suggestions
  acceptAll: () => void;
  // Dismiss all suggestions
  dismissAll: () => void;
  // Reset state (for new entries)
  reset: () => void;
}

interface UseAutoTagsOptions {
  text: string;
  currentTags: string[];
  onTagsChange: (tags: string[]) => void;
  enabled?: boolean;
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 600;
const MIN_TEXT_LENGTH = 15; // Don't analyze very short text

export function useAutoTags({
  text,
  currentTags,
  onTagsChange,
  enabled = true,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseAutoTagsOptions): AutoTagsResult {
  const [suggestedTags, setSuggestedTags] = useState<TagSuggestion[]>([]);
  const [dismissedTags, setDismissedTags] = useState<Set<string>>(new Set());
  const [userInteracted, setUserInteracted] = useState(false);
  
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTextRef = useRef('');

  // Check if auto-tags is enabled in settings
  const aiSettings = loadAISettings();
  const autoTagsEnabled = enabled && aiSettings.autoTags === true;

  // Debounced text analysis
  useEffect(() => {
    if (!autoTagsEnabled) {
      setSuggestedTags([]);
      return;
    }
    
    // Clear previous timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    // Skip if text is too short
    if (text.trim().length < MIN_TEXT_LENGTH) {
      setSuggestedTags([]);
      return;
    }
    
    // Skip if text hasn't meaningfully changed
    if (text === lastTextRef.current) return;
    
    debounceRef.current = setTimeout(() => {
      lastTextRef.current = text;
      
      const detected = detectTags(text, currentTags);
      
      // Filter out dismissed tags
      const filtered = detected.filter(s => !dismissedTags.has(s.tag));
      
      // Track if we have new suggestions
      if (filtered.length > 0) {
        trackUsageEvent('autoTagsSuggested', filtered.length);
      }
      
      setSuggestedTags(filtered);
    }, debounceMs);
    
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [text, currentTags, autoTagsEnabled, debounceMs, dismissedTags]);

  // Accept a suggested tag
  const acceptTag = useCallback((tag: string) => {
    if (!currentTags.includes(tag)) {
      onTagsChange([...currentTags, tag]);
      trackUsageEvent('autoTagsAccepted');
    }
    setSuggestedTags(prev => prev.filter(s => s.tag !== tag));
    setUserInteracted(true);
  }, [currentTags, onTagsChange]);

  // Dismiss a suggested tag
  const dismissTag = useCallback((tag: string) => {
    setDismissedTags(prev => new Set([...prev, tag]));
    setSuggestedTags(prev => prev.filter(s => s.tag !== tag));
    setUserInteracted(true);
  }, []);

  // Accept all suggestions
  const acceptAll = useCallback(() => {
    const newTags = suggestedTags
      .map(s => s.tag)
      .filter(tag => !currentTags.includes(tag));
    
    if (newTags.length > 0) {
      onTagsChange([...currentTags, ...newTags]);
      trackUsageEvent('autoTagsAccepted', newTags.length);
    }
    setSuggestedTags([]);
    setUserInteracted(true);
  }, [suggestedTags, currentTags, onTagsChange]);

  // Dismiss all suggestions
  const dismissAll = useCallback(() => {
    const tagsToDissmiss = suggestedTags.map(s => s.tag);
    setDismissedTags(prev => new Set([...prev, ...tagsToDissmiss]));
    setSuggestedTags([]);
    setUserInteracted(true);
  }, [suggestedTags]);

  // Reset state
  const reset = useCallback(() => {
    setSuggestedTags([]);
    setDismissedTags(new Set());
    setUserInteracted(false);
    lastTextRef.current = '';
  }, []);

  // If not enabled, return neutral state
  if (!autoTagsEnabled) {
    return {
      suggestedTags: [],
      userInteracted: false,
      acceptTag: () => {},
      dismissTag: () => {},
      acceptAll: () => {},
      dismissAll: () => {},
      reset: () => {},
    };
  }

  return {
    suggestedTags,
    userInteracted,
    acceptTag,
    dismissTag,
    acceptAll,
    dismissAll,
    reset,
  };
}
