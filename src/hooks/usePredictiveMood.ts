// Predictive Mood Hook - Hybrid Local + AI sentiment analysis
// For Cyber-Grimoire's Mood Sensor feature (v2)

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  analyzeSentimentLocal, 
  getInheritedMood, 
  getInstantMoodHint,
  SentimentResult, 
  InheritedMoodContext 
} from '@/lib/sentimentService';
import { loadAISettings } from '@/lib/aiConfig';
import { trackUsageEvent } from '@/lib/usageTracker';
import { supabase } from '@/integrations/supabase/client';

export interface PredictiveMoodResult {
  // Current suggested mood from analysis (different from current)
  suggestedMood: number | null;
  // Confirmed mood (matches current selection)
  confirmedMood: number | null;
  // Whether local analysis is in progress
  isAnalyzing: boolean;
  // Whether AI analysis is in progress
  isAIAnalyzing: boolean;
  // Source of the suggestion
  source: 'local' | 'ai' | 'discussion' | 'entry' | null;
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
  // AI calls remaining for this entry
  aiCallsRemaining: number;
  // Trigger AI analysis manually (e.g., on blur)
  triggerAIAnalysis: () => void;
}

interface UsePredictiveMoodOptions {
  text: string;
  currentMood: number;
  enabled?: boolean;
  debounceMs?: number;
  // NEW: AI-specific options
  aiEnabled?: boolean;          // default: true if online
  aiDebounceMs?: number;        // default: 2000
  maxAICallsPerEntry?: number;  // default: 3
}

const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_AI_DEBOUNCE_MS = 2000;
const MIN_TEXT_LENGTH = 10;
const MIN_AI_TEXT_LENGTH = 30;
const SUGGESTION_THRESHOLD = 0.4; // Raised from 0.15 for fewer false positives
const AI_CONFIDENCE_THRESHOLD = 0.5;
const MAX_AI_CALLS_DEFAULT = 3;
const AI_COOLDOWN_MS = 15000; // 15 seconds between AI calls

export function usePredictiveMood({
  text,
  currentMood,
  enabled = true,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  aiEnabled = true,
  aiDebounceMs = DEFAULT_AI_DEBOUNCE_MS,
  maxAICallsPerEntry = MAX_AI_CALLS_DEFAULT,
}: UsePredictiveMoodOptions): PredictiveMoodResult {
  const [suggestedMood, setSuggestedMood] = useState<number | null>(null);
  const [confirmedMood, setConfirmedMood] = useState<number | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAIAnalyzing, setIsAIAnalyzing] = useState(false);
  const [source, setSource] = useState<'local' | 'ai' | 'discussion' | 'entry' | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [userOverride, setUserOverrideState] = useState(false);
  const [inheritedContext, setInheritedContext] = useState<InheritedMoodContext | null>(null);
  const [aiCallCount, setAICallCount] = useState(0);
  
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTextRef = useRef('');
  const lastAITextRef = useRef('');
  const lastAnalyzedMoodRef = useRef<number | null>(null);
  const lastAICallTimeRef = useRef<number>(0);

  // Check if auto-mood is enabled in settings
  const aiSettings = loadAISettings();
  const autoMoodEnabled = enabled && aiSettings.autoMood === true;
  const aiMoodEnabled = autoMoodEnabled && aiEnabled && navigator.onLine;
  const language = document.documentElement.lang === 'ru' ? 'ru' : 'en';

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

  // AI analysis function
  const callQuickMoodAnalysis = useCallback(async (textToAnalyze: string) => {
    // Rate limiting checks
    if (aiCallCount >= maxAICallsPerEntry) {
      console.log('[PredictiveMood] Max AI calls reached');
      return;
    }
    
    const now = Date.now();
    if (now - lastAICallTimeRef.current < AI_COOLDOWN_MS) {
      console.log('[PredictiveMood] AI cooldown active');
      return;
    }
    
    if (textToAnalyze === lastAITextRef.current) {
      console.log('[PredictiveMood] Text unchanged, skipping AI');
      return;
    }
    
    if (textToAnalyze.trim().length < MIN_AI_TEXT_LENGTH) {
      return;
    }

    setIsAIAnalyzing(true);
    lastAICallTimeRef.current = now;
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-entry-analyze', {
        body: { 
          text: textToAnalyze, 
          tags: [], 
          language, 
          mode: 'quick' 
        }
      });

      if (error) {
        console.warn('[PredictiveMood] AI error:', error.message);
        return;
      }

      if (data?.mood && data?.confidence >= AI_CONFIDENCE_THRESHOLD) {
        lastAITextRef.current = textToAnalyze;
        lastAnalyzedMoodRef.current = data.mood;
        setAICallCount(prev => prev + 1);
        
        if (data.mood === currentMood) {
          setConfirmedMood(data.mood);
          setSuggestedMood(null);
        } else {
          setSuggestedMood(data.mood);
          setConfirmedMood(null);
        }
        setSource('ai');
        setConfidence(data.confidence);
        trackUsageEvent('autoMoodSuggestions');
        console.log(`[PredictiveMood] AI result: mood=${data.mood}, confidence=${data.confidence.toFixed(2)}`);
      }
    } catch (e) {
      console.warn('[PredictiveMood] AI call failed:', e);
    } finally {
      setIsAIAnalyzing(false);
    }
  }, [aiCallCount, currentMood, language, maxAICallsPerEntry]);

  // Manual AI trigger (for onBlur or button click)
  const triggerAIAnalysis = useCallback(() => {
    if (!aiMoodEnabled || userOverride) return;
    callQuickMoodAnalysis(text);
  }, [aiMoodEnabled, userOverride, text, callQuickMoodAnalysis]);

  // Debounced local + AI analysis
  useEffect(() => {
    if (!autoMoodEnabled || userOverride) return;
    
    // Clear previous timeouts
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);
    
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
    
    // Show analyzing indicator for local
    setIsAnalyzing(true);
    
    // Phase 1: Local analysis (fast, instant feedback)
    debounceRef.current = setTimeout(() => {
      lastTextRef.current = text;
      
      // Use instant hint for quick feedback
      const instantMood = getInstantMoodHint(text);
      const result = analyzeSentimentLocal(text);
      lastAnalyzedMoodRef.current = result.mood;
      
      setIsAnalyzing(false);
      
      // Only show local result if AI hasn't provided one yet
      if (source !== 'ai') {
        if (result.confidence >= SUGGESTION_THRESHOLD) {
          if (result.mood === currentMood) {
            setConfirmedMood(result.mood);
            setSuggestedMood(null);
            setSource('local');
            setConfidence(result.confidence);
            trackUsageEvent('autoMoodSuggestions');
          } else {
            setSuggestedMood(result.mood);
            setConfirmedMood(null);
            setSource('local');
            setConfidence(result.confidence);
            trackUsageEvent('autoMoodSuggestions');
          }
        } else if (instantMood !== null) {
          // Use instant hint as fallback
          if (instantMood === currentMood) {
            setConfirmedMood(instantMood);
            setSuggestedMood(null);
          } else {
            setSuggestedMood(instantMood);
            setConfirmedMood(null);
          }
          setSource('local');
          setConfidence(0.4);
        }
      }
    }, debounceMs);
    
    // Phase 2: AI analysis (slower, more accurate) - on typing pause
    if (aiMoodEnabled && text.trim().length >= MIN_AI_TEXT_LENGTH) {
      aiDebounceRef.current = setTimeout(() => {
        callQuickMoodAnalysis(text);
      }, aiDebounceMs);
    }
    
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);
    };
  }, [text, currentMood, autoMoodEnabled, userOverride, debounceMs, aiDebounceMs, aiMoodEnabled, inheritedContext, source, callQuickMoodAnalysis, suggestedMood, confirmedMood]);

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
    setIsAIAnalyzing(false);
    setSource(null);
    setAICallCount(0);
    lastTextRef.current = '';
    lastAITextRef.current = '';
    lastAnalyzedMoodRef.current = null;
    lastAICallTimeRef.current = 0;
  }, []);

  // If not enabled, return neutral state
  if (!autoMoodEnabled) {
    return {
      suggestedMood: null,
      confirmedMood: null,
      isAnalyzing: false,
      isAIAnalyzing: false,
      source: null,
      confidence: 0,
      userOverride: false,
      setUserOverride: () => {},
      resetOverride: () => {},
      inheritedContext: null,
      aiCallsRemaining: maxAICallsPerEntry,
      triggerAIAnalysis: () => {},
    };
  }

  return {
    suggestedMood,
    confirmedMood,
    isAnalyzing,
    isAIAnalyzing,
    source,
    confidence,
    userOverride,
    setUserOverride,
    resetOverride,
    inheritedContext,
    aiCallsRemaining: maxAICallsPerEntry - aiCallCount,
    triggerAIAnalysis,
  };
}
