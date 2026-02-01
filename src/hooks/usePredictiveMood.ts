// Predictive Mood Hook - Debounced local sentiment analysis
// For Cyber-Grimoire's Mood Sensor feature

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  analyzeSentimentLocal, 
  getInheritedMood, 
  SentimentResult, 
  InheritedMoodContext 
} from '@/lib/sentimentService';
import { loadAISettings } from '@/lib/aiConfig';
import { trackUsageEvent } from '@/lib/usageTracker';

export interface PredictiveMoodResult {
  // Current suggested mood from analysis (different from current)
  suggestedMood: number | null;
  // Confirmed mood (matches current selection)
  confirmedMood: number | null;
  // Whether analysis is in progress
  isAnalyzing: boolean;
  // Source of the suggestion
  source: 'text' | 'discussion' | 'entry' | null;
  // Confidence level
  confidence: number;
  // Whether user has manually overridden
  userOverride: boolean;
  // Set user override (call when user manually changes mood)
  setUserOverride: () => void;
  // Reset user override (call when starting fresh)
  resetOverride: () => void;
  // Inherited mood context (for display)
  inheritedContext: InheritedMoodContext | null;
}

interface UsePredictiveMoodOptions {
  text: string;
  currentMood: number;
  enabled?: boolean;
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 500;
const MIN_TEXT_LENGTH = 10; // Don't analyze very short text
const SUGGESTION_THRESHOLD = 0.15; // Lowered for better responsiveness

export function usePredictiveMood({
  text,
  currentMood,
  enabled = true,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UsePredictiveMoodOptions): PredictiveMoodResult {
  const [suggestedMood, setSuggestedMood] = useState<number | null>(null);
  const [confirmedMood, setConfirmedMood] = useState<number | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [source, setSource] = useState<'text' | 'discussion' | 'entry' | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [userOverride, setUserOverrideState] = useState(false);
  const [inheritedContext, setInheritedContext] = useState<InheritedMoodContext | null>(null);
  
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTextRef = useRef('');
  const lastAnalyzedMoodRef = useRef<number | null>(null);

  // Check if auto-mood is enabled in settings
  const aiSettings = loadAISettings();
  const autoMoodEnabled = enabled && aiSettings.autoMood === true;

  // Load inherited mood on mount
  useEffect(() => {
    if (!autoMoodEnabled) return;
    
    const loadInherited = async () => {
      const inherited = await getInheritedMood();
      if (inherited && !userOverride) {
        setInheritedContext(inherited);
        // Only suggest inherited mood if text is empty/short
        if (text.trim().length < MIN_TEXT_LENGTH) {
          setSuggestedMood(inherited.mood);
          setSource(inherited.source === 'discussion' ? 'discussion' : 'entry');
          setConfidence(inherited.confidence === 'high' ? 0.8 : inherited.confidence === 'medium' ? 0.5 : 0.3);
        }
      }
    };
    
    loadInherited();
  }, [autoMoodEnabled]); // Only on mount

  // Debounced text analysis
  useEffect(() => {
    if (!autoMoodEnabled || userOverride) return;
    
    // Clear previous timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    // Skip if text is too short
    if (text.trim().length < MIN_TEXT_LENGTH) {
      // If we have inherited context, use it
      if (inheritedContext && suggestedMood === null && confirmedMood === null) {
        setSuggestedMood(inheritedContext.mood);
        setSource(inheritedContext.source === 'discussion' ? 'discussion' : 'entry');
      }
      setIsAnalyzing(false);
      return;
    }
    
    // Skip if text hasn't meaningfully changed
    if (text === lastTextRef.current) return;
    
    // Show analyzing indicator
    setIsAnalyzing(true);
    
    debounceRef.current = setTimeout(() => {
      lastTextRef.current = text;
      
      const result = analyzeSentimentLocal(text);
      lastAnalyzedMoodRef.current = result.mood;
      
      setIsAnalyzing(false);
      
      // Only process if confidence is above threshold
      if (result.confidence >= SUGGESTION_THRESHOLD) {
        if (result.mood === currentMood) {
          // Mood matches current selection - show confirmation
          setConfirmedMood(result.mood);
          setSuggestedMood(null);
          setSource('text');
          setConfidence(result.confidence);
          trackUsageEvent('autoMoodSuggestions');
        } else {
          // Different mood - show suggestion
          setSuggestedMood(result.mood);
          setConfirmedMood(null);
          setSource('text');
          setConfidence(result.confidence);
          trackUsageEvent('autoMoodSuggestions');
        }
      } else {
        // Low confidence - clear both states
        setSuggestedMood(null);
        setConfirmedMood(null);
        setSource(null);
      }
    }, debounceMs);
    
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [text, currentMood, autoMoodEnabled, userOverride, debounceMs, inheritedContext]);

  // Re-evaluate when currentMood changes (user clicked a different mood)
  useEffect(() => {
    if (!autoMoodEnabled || userOverride) return;
    
    // If we have an analyzed mood, update states based on new selection
    if (lastAnalyzedMoodRef.current !== null) {
      if (lastAnalyzedMoodRef.current === currentMood) {
        setConfirmedMood(currentMood);
        setSuggestedMood(null);
      } else {
        setSuggestedMood(lastAnalyzedMoodRef.current);
        setConfirmedMood(null);
      }
    }
  }, [currentMood, autoMoodEnabled, userOverride]);

  // Set user override - only if rejecting an active suggestion
  const setUserOverride = useCallback(() => {
    // Only set override if user clicked away from an active suggestion
    if (suggestedMood !== null) {
      setUserOverrideState(true);
    }
    // Clear suggestion but keep confirmed if matching
    setSuggestedMood(null);
  }, [suggestedMood]);

  // Reset override (for new entries)
  const resetOverride = useCallback(() => {
    setUserOverrideState(false);
    setSuggestedMood(null);
    setConfirmedMood(null);
    setIsAnalyzing(false);
    lastTextRef.current = '';
    lastAnalyzedMoodRef.current = null;
  }, []);

  // If not enabled, return neutral state
  if (!autoMoodEnabled) {
    return {
      suggestedMood: null,
      confirmedMood: null,
      isAnalyzing: false,
      source: null,
      confidence: 0,
      userOverride: false,
      setUserOverride: () => {},
      resetOverride: () => {},
      inheritedContext: null,
    };
  }

  return {
    suggestedMood,
    confirmedMood,
    isAnalyzing,
    source,
    confidence,
    userOverride,
    setUserOverride,
    resetOverride,
    inheritedContext,
  };
}
