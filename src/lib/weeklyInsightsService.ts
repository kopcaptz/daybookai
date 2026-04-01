// Weekly Insights Service
// Handles generation and caching of AI-powered weekly insights

import { db, DiaryEntry } from './db';
import { startOfWeek, subDays, format } from 'date-fns';
import { Language, getBaseLanguage } from './i18n';
import { logger } from './logger';
import { loadAISettings, getModelForProfile } from './aiConfig';
import { getAITokenHeader } from './aiUtils';

export interface WeeklyInsight {
  weekStart: string;
  generatedAt: number;
  summary: string;
  dominantThemes: string[];
  moodPattern: string;
  insight: string;
  suggestion: string;
  sourceEntryCount: number;
}

// Cache TTL: 24 hours
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function getCurrentWeekStart(): string {
  const now = new Date();
  const monday = startOfWeek(now, { weekStartsOn: 1 });
  return format(monday, 'yyyy-MM-dd');
}

async function getWeeklyEntries(): Promise<DiaryEntry[]> {
  const now = new Date();
  const sevenDaysAgo = subDays(now, 7);
  const startDate = format(sevenDaysAgo, 'yyyy-MM-dd');
  const endDate = format(now, 'yyyy-MM-dd');

  const entries = await db.entries
    .where('date')
    .between(startDate, endDate, true, true)
    .toArray();

  return entries.filter(e => !e.isPrivate && e.aiAllowed !== false);
}

export async function getCachedWeeklyInsight(): Promise<WeeklyInsight | null> {
  try {
    const weekStart = getCurrentWeekStart();
    const cached = await db.table('weeklyInsights').get(weekStart);
    
    if (!cached) return null;
    
    const age = Date.now() - cached.generatedAt;
    if (age > CACHE_TTL_MS) {
      return null;
    }
    
    return cached as WeeklyInsight;
  } catch (e) {
    logger.warn('WeeklyInsights', 'Failed to get cached insight', e);
    return null;
  }
}

async function saveWeeklyInsight(insight: WeeklyInsight): Promise<void> {
  try {
    await db.table('weeklyInsights').put(insight);
  } catch (e) {
    logger.warn('WeeklyInsights', 'Failed to save insight', e);
  }
}

export async function generateWeeklyInsight(
  language: Language
): Promise<{ success: true; insight: WeeklyInsight } | { success: false; error: string }> {
  const baseLang = getBaseLanguage(language);

  // Get entries
  const entries = await getWeeklyEntries();
  if (entries.length < 3) {
    return { success: false, error: 'not_enough_entries' };
  }

  // Prepare data for API (privacy-safe)
  const aiSettings = loadAISettings();
  const entryData = entries.map(e => {
    const base: Record<string, unknown> = {
      date: e.date,
      mood: e.mood,
      semanticTags: e.semanticTags || [],
      title: e.title || undefined,
    };
    if (!aiSettings.strictPrivacy) {
      base.text = e.text.slice(0, 100);
    }
    return base;
  });

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const response = await fetch(`${supabaseUrl}/functions/v1/ai-weekly-insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAITokenHeader(),
      },
      body: JSON.stringify({
        entries: entryData,
        language: baseLang,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const error = data.error || `http_${response.status}`;
      logger.error('WeeklyInsights', 'API error', new Error(error));
      return { success: false, error };
    }

    const result = await response.json();

    const insight: WeeklyInsight = {
      weekStart: getCurrentWeekStart(),
      generatedAt: Date.now(),
      summary: result.summary,
      dominantThemes: result.dominantThemes,
      moodPattern: result.moodPattern,
      insight: result.insight,
      suggestion: result.suggestion,
      sourceEntryCount: entries.length,
    };

    await saveWeeklyInsight(insight);

    return { success: true, insight };
  } catch (e) {
    logger.error('WeeklyInsights', 'Generation failed', e as Error);
    return { success: false, error: 'network_error' };
  }
}

export async function getOrGenerateWeeklyInsight(
  language: Language,
  forceRegenerate: boolean = false
): Promise<{ success: true; insight: WeeklyInsight; fromCache: boolean } | { success: false; error: string }> {
  if (!forceRegenerate) {
    const cached = await getCachedWeeklyInsight();
    if (cached) {
      return { success: true, insight: cached, fromCache: true };
    }
  }

  const result = await generateWeeklyInsight(language);
  if (result.success === true) {
    return { success: true, insight: result.insight, fromCache: false };
  }

  return { success: false, error: result.error };
}

export async function canGenerateWeeklyInsight(): Promise<boolean> {
  const entries = await getWeeklyEntries();
  return entries.length >= 3;
}
