/**
 * Post-Save AI Analysis Service
 * 
 * Analyzes diary entries after saving to:
 * 1. Determine mood (if user didn't set it)
 * 2. Generate hidden semantic tags for improved search
 * 
 * Includes queue system for offline retry
 */

import { db, updateEntry, type DiaryEntry, type AnalysisQueueItem } from '@/lib/db';
import { supabase } from '@/integrations/supabase/client';
import { isAITokenValid } from '@/lib/aiTokenService';
import { loadAISettings } from '@/lib/aiConfig';

interface AnalysisResult {
  mood: number;
  confidence: number;
  semanticTags: string[];
  titleSuggestion?: string;  // AI-generated title in cyber-mystic style
  requestId: string;
}

/**
 * Analyze entry via Edge Function
 */
async function callAnalyzeEdgeFunction(
  text: string,
  tags: string[],
  language: string
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

// ============================================================
// Queue Management Functions
// ============================================================

/**
 * Add entry to analysis queue (for retry later)
 */
export async function addToAnalysisQueue(
  entryId: number,
  userSetMood: boolean,
  language: string
): Promise<void> {
  try {
    // Check if already queued
    const existing = await db.analysisQueue.where('entryId').equals(entryId).first();
    if (existing) {
      console.log(`[AnalysisQueue] Entry ${entryId} already in queue`);
      return;
    }

    await db.analysisQueue.add({
      entryId,
      userSetMood,
      language,
      createdAt: Date.now(),
      attempts: 0,
      status: 'pending',
    });

    console.log(`[AnalysisQueue] Entry ${entryId} added to queue`);
  } catch (error) {
    console.warn('[AnalysisQueue] Failed to add to queue:', error);
  }
}

/**
 * Process pending items in queue
 * Called on app startup, online event, and periodically
 */
export async function processAnalysisQueue(): Promise<void> {
  // Skip if offline
  if (!navigator.onLine) {
    console.log('[AnalysisQueue] Offline, skipping');
    return;
  }

  // Skip if AI not configured
  const aiSettings = loadAISettings();
  if (!aiSettings.enabled) {
    console.log('[AnalysisQueue] AI disabled, skipping');
    return;
  }

  if (!isAITokenValid()) {
    console.log('[AnalysisQueue] AI token not valid, skipping');
    return;
  }

  // Get pending items (oldest first, max 5)
  const pending = await db.analysisQueue
    .where('status')
    .equals('pending')
    .sortBy('createdAt');

  const batch = pending.slice(0, 5);
  if (batch.length === 0) return;

  console.log(`[AnalysisQueue] Processing ${batch.length} items`);

  for (const item of batch) {
    await processQueueItem(item);
    // Rate limiting delay between requests
    await new Promise(r => setTimeout(r, 500));
  }
}

/**
 * Process a single queue item
 */
async function processQueueItem(item: AnalysisQueueItem): Promise<void> {
  if (!item.id) return;

  try {
    // Mark as processing
    await db.analysisQueue.update(item.id, {
      status: 'processing',
      lastAttempt: Date.now(),
    });

    // Get entry
    const entry = await db.entries.get(item.entryId);
    if (!entry) {
      // Entry deleted — remove from queue
      await db.analysisQueue.delete(item.id);
      console.log(`[AnalysisQueue] Entry ${item.entryId} deleted, removed from queue`);
      return;
    }

    if (entry.isPrivate || entry.aiAllowed === false) {
      // Entry now private — remove from queue
      await db.analysisQueue.delete(item.id);
      console.log(`[AnalysisQueue] Entry ${item.entryId} is private, removed from queue`);
      return;
    }

    // Already analyzed? Remove from queue
    if (entry.aiAnalyzedAt) {
      await db.analysisQueue.delete(item.id);
      console.log(`[AnalysisQueue] Entry ${item.entryId} already analyzed, removed from queue`);
      return;
    }

    // Call AI
    const result = await callAnalyzeEdgeFunction(entry.text, entry.tags, item.language);

    // Update entry
    const updates: Partial<DiaryEntry> = {
      semanticTags: result.semanticTags,
      aiAnalyzedAt: Date.now(),
    };

    if (!item.userSetMood) {
      updates.mood = result.mood;
      updates.moodSource = 'ai';
    }

    // Add AI title if generated and entry doesn't have one
    if (result.titleSuggestion && !entry.title) {
      updates.title = result.titleSuggestion;
      updates.titleSource = 'ai';
    }

    await updateEntry(item.entryId, updates);

    // Success — remove from queue
    await db.analysisQueue.delete(item.id);
    console.log(`[AnalysisQueue] Entry ${item.entryId} analyzed successfully`);

  } catch (error) {
    const attempts = item.attempts + 1;
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (attempts >= 3) {
      // Max retries — mark as failed
      await db.analysisQueue.update(item.id, {
        status: 'failed',
        attempts,
        errorMessage,
      });
      console.warn(`[AnalysisQueue] Entry ${item.entryId} failed after ${attempts} attempts`);
    } else {
      // Will retry later
      await db.analysisQueue.update(item.id, {
        status: 'pending',
        attempts,
        errorMessage,
      });
      console.log(`[AnalysisQueue] Entry ${item.entryId} retry ${attempts}/3`);
    }
  }
}

/**
 * Get queue stats (for debugging/settings)
 */
export async function getQueueStats(): Promise<{
  pending: number;
  failed: number;
}> {
  const [pending, failed] = await Promise.all([
    db.analysisQueue.where('status').equals('pending').count(),
    db.analysisQueue.where('status').equals('failed').count(),
  ]);
  return { pending, failed };
}

/**
 * Retry all failed items (reset to pending)
 */
export async function retryFailedAnalysis(): Promise<number> {
  const failed = await db.analysisQueue.where('status').equals('failed').toArray();

  for (const item of failed) {
    if (item.id) {
      await db.analysisQueue.update(item.id, {
        status: 'pending',
        attempts: 0,
        errorMessage: undefined,
      });
    }
  }

  // Trigger immediate processing
  setTimeout(() => processAnalysisQueue(), 100);

  return failed.length;
}

// ============================================================
// Main Analysis Functions
// ============================================================

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
  language: string
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

    console.log(`[EntryAnalysis] Result: mood=${result.mood}, confidence=${result.confidence}, semanticTags=[${result.semanticTags.join(', ')}], title=${result.titleSuggestion || 'none'}`);

    // Get current entry to check if title already exists
    const currentEntry = await db.entries.get(entryId);

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

    // Add AI title if generated and entry doesn't have one
    if (result.titleSuggestion && (!currentEntry?.title)) {
      updates.title = result.titleSuggestion;
      updates.titleSource = 'ai';
      console.log(`[EntryAnalysis] Applying AI title: ${result.titleSuggestion}`);
    }

    // Update entry in database
    await updateEntry(entryId, updates);

    console.log(`[EntryAnalysis] Entry ${entryId} updated successfully`);
  } catch (error) {
    // Log error and add to queue for retry
    console.warn('[EntryAnalysis] Failed:', error instanceof Error ? error.message : error);
    
    // Add to queue for retry when online
    await addToAnalysisQueue(entryId, userSetMood, language);
  }
}

/**
 * Re-analyze an existing entry (e.g., after edit)
 * Forces re-analysis even if already analyzed
 */
export async function reanalyzeEntry(
  entryId: number,
  language: string
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
