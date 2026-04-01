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
import { loadAISettings, getModelForProfile } from '@/lib/aiConfig';
import { getAITokenHeader } from '@/lib/aiUtils';

interface AnalysisResult {
  mood: number;
  confidence: number;
  semanticTags: string[];
  titleSuggestion?: string;
  requestId: string;
}

async function callAnalyzeEdgeFunction(
  text: string,
  tags: string[],
  language: string
): Promise<AnalysisResult> {
  const aiSettings = loadAISettings();
  let bodyText = text;
  
  if (aiSettings.strictPrivacy) {
    bodyText = extractGeneralizedThemes(text, language);
  }

  const { data, error } = await supabase.functions.invoke('ai-entry-analyze', {
    body: { text: bodyText, tags, language },
    headers: getAITokenHeader(),
  });

  if (error) {
    throw new Error(`Edge function error: ${error.message}`);
  }

  if (data.error) {
    throw new Error(data.error);
  }

  return data as AnalysisResult;
}

function extractGeneralizedThemes(text: string, language: string): string {
  const themes: string[] = [];
  const lowerText = text.toLowerCase();
  
  const themePatterns: Record<string, RegExp[]> = {
    'work': [/работ[аеы]/i, /офис/i, /проект/i, /коллег/i, /work/i, /office/i, /project/i, /colleague/i],
    'family': [/семь[яиюе]/i, /родител/i, /мам[аеу]/i, /пап[аеу]/i, /family/i, /parent/i, /mom/i, /dad/i],
    'health': [/здоров/i, /болезн/i, /врач/i, /тренировк/i, /health/i, /doctor/i, /exercise/i, /gym/i],
    'mood_positive': [/радост/i, /счаст/i, /отлично/i, /happy/i, /great/i, /wonderful/i, /joy/i],
    'mood_negative': [/грус[ть]/i, /устал/i, /стресс/i, /тревог/i, /sad/i, /tired/i, /stress/i, /anxious/i],
    'social': [/друзь/i, /встреч/i, /компани/i, /friends/i, /meeting/i, /party/i],
    'hobby': [/хобби/i, /книг/i, /фильм/i, /игр/i, /hobby/i, /book/i, /movie/i, /game/i],
    'food': [/еда/i, /готов/i, /ресторан/i, /food/i, /cook/i, /restaurant/i, /dinner/i],
    'travel': [/путешеств/i, /поездк/i, /travel/i, /trip/i, /journey/i],
    'finance': [/деньг/i, /покупк/i, /money/i, /purchase/i, /budget/i],
  };

  for (const [theme, patterns] of Object.entries(themePatterns)) {
    if (patterns.some(p => p.test(lowerText))) {
      themes.push(theme);
    }
  }

  const wordCount = text.split(/\s+/).length;
  const isLong = wordCount > 50;
  
  const lang = language === 'ru' ? 'ru' : 'en';
  if (lang === 'ru') {
    return `Запись дневника (${wordCount} слов). Обнаруженные темы: ${themes.length > 0 ? themes.join(', ') : 'общее'}. ${isLong ? 'Подробная запись.' : 'Краткая запись.'}`;
  }
  return `Diary entry (${wordCount} words). Detected themes: ${themes.length > 0 ? themes.join(', ') : 'general'}. ${isLong ? 'Detailed entry.' : 'Brief entry.'}`;
}

// ============================================================
// Queue Management Functions
// ============================================================

export async function addToAnalysisQueue(
  entryId: number,
  userSetMood: boolean,
  language: string
): Promise<void> {
  try {
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

export async function processAnalysisQueue(): Promise<void> {
  if (!navigator.onLine) {
    console.log('[AnalysisQueue] Offline, skipping');
    return;
  }

  const aiSettings = loadAISettings();
  if (!aiSettings.enabled) {
    console.log('[AnalysisQueue] AI disabled, skipping');
    return;
  }

  const pending = await db.analysisQueue
    .where('status')
    .equals('pending')
    .sortBy('createdAt');

  const batch = pending.slice(0, 5);
  if (batch.length === 0) return;

  console.log(`[AnalysisQueue] Processing ${batch.length} items`);

  for (const item of batch) {
    await processQueueItem(item);
    await new Promise(r => setTimeout(r, 500));
  }
}

async function processQueueItem(item: AnalysisQueueItem): Promise<void> {
  if (!item.id) return;

  try {
    await db.analysisQueue.update(item.id, {
      status: 'processing',
      lastAttempt: Date.now(),
    });

    const entry = await db.entries.get(item.entryId);
    if (!entry) {
      await db.analysisQueue.delete(item.id);
      console.log(`[AnalysisQueue] Entry ${item.entryId} deleted, removed from queue`);
      return;
    }

    if (entry.isPrivate || entry.aiAllowed === false) {
      await db.analysisQueue.delete(item.id);
      console.log(`[AnalysisQueue] Entry ${item.entryId} is private, removed from queue`);
      return;
    }

    if (entry.aiAnalyzedAt) {
      await db.analysisQueue.delete(item.id);
      console.log(`[AnalysisQueue] Entry ${item.entryId} already analyzed, removed from queue`);
      return;
    }

    const result = await callAnalyzeEdgeFunction(entry.text, entry.tags, item.language);

    const updates: Partial<DiaryEntry> = {
      semanticTags: result.semanticTags,
      aiAnalyzedAt: Date.now(),
    };

    if (!item.userSetMood) {
      updates.mood = result.mood;
      updates.moodSource = 'ai';
    }

    if (result.titleSuggestion && !entry.title) {
      updates.title = result.titleSuggestion;
      updates.titleSource = 'ai';
    }

    await updateEntry(item.entryId, updates);

    await db.analysisQueue.delete(item.id);
    console.log(`[AnalysisQueue] Entry ${item.entryId} analyzed successfully`);

  } catch (error) {
    const attempts = item.attempts + 1;
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (attempts >= 3) {
      await db.analysisQueue.update(item.id, {
        status: 'failed',
        attempts,
        errorMessage,
      });
      console.warn(`[AnalysisQueue] Entry ${item.entryId} failed after ${attempts} attempts`);
    } else {
      await db.analysisQueue.update(item.id, {
        status: 'pending',
        attempts,
        errorMessage,
      });
      console.log(`[AnalysisQueue] Entry ${item.entryId} retry ${attempts}/3`);
    }
  }
}

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

  setTimeout(() => processAnalysisQueue(), 100);

  return failed.length;
}

// ============================================================
// Main Analysis Functions
// ============================================================

export async function analyzeEntryInBackground(
  entryId: number,
  text: string,
  tags: string[],
  userSetMood: boolean,
  language: string
): Promise<void> {
  if (!text || text.trim().length < 10) {
    console.log('[EntryAnalysis] Skipping: text too short');
    return;
  }

  const aiSettings = loadAISettings();
  if (!aiSettings.enabled) {
    console.log('[EntryAnalysis] Skipping: AI is disabled in settings');
    return;
  }

  console.log(`[EntryAnalysis] Starting analysis for entry ${entryId}, userSetMood=${userSetMood}`);

  try {
    const result = await callAnalyzeEdgeFunction(text, tags, language);

    console.log(`[EntryAnalysis] Result: mood=${result.mood}, confidence=${result.confidence}, semanticTags=[${result.semanticTags.join(', ')}], title=${result.titleSuggestion || 'none'}`);

    const currentEntry = await db.entries.get(entryId);

    const updates: Partial<DiaryEntry> = {
      semanticTags: result.semanticTags,
      aiAnalyzedAt: Date.now(),
    };

    if (!userSetMood) {
      updates.mood = result.mood;
      updates.moodSource = 'ai';
      console.log(`[EntryAnalysis] Applying AI mood: ${result.mood}`);
    } else {
      updates.moodSource = 'user';
    }

    if (result.titleSuggestion && (!currentEntry?.title)) {
      updates.title = result.titleSuggestion;
      updates.titleSource = 'ai';
      console.log(`[EntryAnalysis] Applying AI title: ${result.titleSuggestion}`);
    }

    await updateEntry(entryId, updates);

    console.log(`[EntryAnalysis] Entry ${entryId} updated successfully`);
  } catch (error) {
    console.warn('[EntryAnalysis] Failed:', error instanceof Error ? error.message : error);
    
    await addToAnalysisQueue(entryId, userSetMood, language);
  }
}

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

    if (entry.isPrivate || entry.aiAllowed === false) {
      console.log('[EntryAnalysis] Skipping: entry is private or AI disabled');
      return false;
    }

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

export function needsAnalysis(entry: DiaryEntry): boolean {
  if (entry.aiAnalyzedAt) return false;
  if (entry.isPrivate || entry.aiAllowed === false) return false;
  if (!entry.text || entry.text.trim().length < 10) return false;
  return true;
}
