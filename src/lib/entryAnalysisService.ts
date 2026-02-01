/**
 * Post-Save AI Analysis Service
 * 
 * Analyzes diary entries after saving to:
 * 1. Determine mood (if user didn't set it)
 * 2. Generate hidden semantic tags for improved search
 */

import { db, updateEntry, type DiaryEntry } from '@/lib/db';
import { supabase } from '@/integrations/supabase/client';
import { isAITokenValid } from '@/lib/aiTokenService';
import { loadAISettings } from '@/lib/aiConfig';

interface AnalysisResult {
  mood: number;
  confidence: number;
  semanticTags: string[];
  requestId: string;
}

/**
 * Analyze entry via Edge Function
 */
async function callAnalyzeEdgeFunction(
  text: string,
  tags: string[],
  language: 'ru' | 'en'
): Promise<AnalysisResult> {
  const { data, error } = await supabase.functions.invoke('ai-entry-analyze', {
    body: { text, tags, language },
  });

  if (error) {
    throw new Error(`Edge function error: ${error.message}`);
  }

  if (data.error) {
    throw new Error(data.error);
  }

  return data as AnalysisResult;
}

/**
 * Analyze entry in background after saving
 * 
 * @param entryId - ID of saved entry
 * @param text - Entry text
 * @param tags - User-visible tags
 * @param userSetMood - True if user explicitly chose a mood (not default)
 * @param language - User language for prompts
 */
export async function analyzeEntryInBackground(
  entryId: number,
  text: string,
  tags: string[],
  userSetMood: boolean,
  language: 'ru' | 'en'
): Promise<void> {
  // Early exit for empty or very short entries
  if (!text || text.trim().length < 10) {
    console.log('[EntryAnalysis] Skipping: text too short');
    return;
  }

  // Check if AI is enabled
  const aiSettings = loadAISettings();
  if (!aiSettings.enabled) {
    console.log('[EntryAnalysis] Skipping: AI is disabled in settings');
    return;
  }

  // Check if AI token is valid (without showing toast)
  if (!isAITokenValid()) {
    console.log('[EntryAnalysis] Skipping: AI token not valid');
    return;
  }

  console.log(`[EntryAnalysis] Starting analysis for entry ${entryId}, userSetMood=${userSetMood}`);

  try {
    const result = await callAnalyzeEdgeFunction(text, tags, language);

    console.log(`[EntryAnalysis] Result: mood=${result.mood}, confidence=${result.confidence}, semanticTags=[${result.semanticTags.join(', ')}]`);

    // Build updates object
    const updates: Partial<DiaryEntry> = {
      semanticTags: result.semanticTags,
      aiAnalyzedAt: Date.now(),
    };

    // Only apply AI mood if user didn't explicitly set one
    if (!userSetMood) {
      updates.mood = result.mood;
      updates.moodSource = 'ai';
      console.log(`[EntryAnalysis] Applying AI mood: ${result.mood}`);
    } else {
      // Mark that user set the mood
      updates.moodSource = 'user';
    }

    // Update entry in database
    await updateEntry(entryId, updates);

    console.log(`[EntryAnalysis] Entry ${entryId} updated successfully`);
  } catch (error) {
    // Silently log errors - analysis is optional
    console.warn('[EntryAnalysis] Failed:', error instanceof Error ? error.message : error);
  }
}

/**
 * Re-analyze an existing entry (e.g., after edit)
 * Forces re-analysis even if already analyzed
 */
export async function reanalyzeEntry(
  entryId: number,
  language: 'ru' | 'en'
): Promise<boolean> {
  try {
    const entry = await db.entries.get(entryId);
    if (!entry) {
      console.warn('[EntryAnalysis] Entry not found:', entryId);
      return false;
    }

    // Skip private entries
    if (entry.isPrivate || entry.aiAllowed === false) {
      console.log('[EntryAnalysis] Skipping: entry is private or AI disabled');
      return false;
    }

    // User set mood if they changed it from default (3) OR it's marked as user-set
    const userSetMood = entry.moodSource === 'user' || (entry.mood !== 3 && !entry.moodSource);

    await analyzeEntryInBackground(
      entryId,
      entry.text,
      entry.tags,
      userSetMood,
      language
    );

    return true;
  } catch (error) {
    console.error('[EntryAnalysis] Reanalysis failed:', error);
    return false;
  }
}

/**
 * Check if entry needs analysis
 */
export function needsAnalysis(entry: DiaryEntry): boolean {
  // Already analyzed
  if (entry.aiAnalyzedAt) return false;
  
  // Private or AI disabled
  if (entry.isPrivate || entry.aiAllowed === false) return false;
  
  // Too short
  if (!entry.text || entry.text.trim().length < 10) return false;
  
  return true;
}
