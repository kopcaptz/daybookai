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

export interface PredictiveMoodResult {
  // Current suggested mood from analysis
  suggestedMood: number | null;
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
const SUGGESTION_THRESHOLD = 0.3; // Minimum confidence to show suggestion

export function usePredictiveMood({
  text,
  currentMood,
  enabled = true,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UsePredictiveMoodOptions): PredictiveMoodResult {
  const [suggestedMood, setSuggestedMood] = useState<number | null>(null);
  const [source, setSource] = useState<'text' | 'discussion' | 'entry' | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [userOverride, setUserOverrideState] = useState(false);
  const [inheritedContext, setInheritedContext] = useState<InheritedMoodContext | null>(null);
  
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTextRef = useRef('');

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
      if (inheritedContext && suggestedMood === null) {
        setSuggestedMood(inheritedContext.mood);
        setSource(inheritedContext.source === 'discussion' ? 'discussion' : 'entry');
      }
      return;
    }
    
    // Skip if text hasn't meaningfully changed
    if (text === lastTextRef.current) return;
    
    debounceRef.current = setTimeout(() => {
      lastTextRef.current = text;
      
      const result = analyzeSentimentLocal(text);
      
      // Only suggest if confidence is above threshold
      if (result.confidence >= SUGGESTION_THRESHOLD) {
        // Don't suggest if it matches current mood
        if (result.mood !== currentMood) {
          setSuggestedMood(result.mood);
          setSource('text');
          setConfidence(result.confidence);
        } else {
          // Mood matches, clear suggestion
          setSuggestedMood(null);
          setSource(null);
        }
      } else {
        // Low confidence, clear suggestion
        setSuggestedMood(null);
        setSource(null);
      }
    }, debounceMs);
    
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [text, currentMood, autoMoodEnabled, userOverride, debounceMs, inheritedContext]);

  // Set user override (when user manually changes mood)
  const setUserOverride = useCallback(() => {
    setUserOverrideState(true);
    setSuggestedMood(null);
    setSource(null);
  }, []);

  // Reset override (for new entries)
  const resetOverride = useCallback(() => {
    setUserOverrideState(false);
    setSuggestedMood(null);
    setSource(null);
    lastTextRef.current = '';
  }, []);

  // If not enabled, return neutral state
  if (!autoMoodEnabled) {
    return {
      suggestedMood: null,
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
    source,
    confidence,
    userOverride,
    setUserOverride,
    resetOverride,
    inheritedContext,
  };
}
