// Weekly Insights Service
// Handles generation and caching of AI-powered weekly insights

import { db, DiaryEntry } from './db';
import { getAIToken, isAITokenValid } from './aiTokenService';
import { startOfWeek, subDays, format } from 'date-fns';

export interface WeeklyInsight {
  weekStart: string;       // YYYY-MM-DD (Monday)
  generatedAt: number;     // timestamp
  summary: string;
  dominantThemes: string[];
  moodPattern: string;
  insight: string;
  suggestion: string;
  sourceEntryCount: number;
}

// Cache TTL: 24 hours
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Get the start of the current week (Monday)
 */
function getCurrentWeekStart(): string {
  const now = new Date();
  const monday = startOfWeek(now, { weekStartsOn: 1 });
  return format(monday, 'yyyy-MM-dd');
}

/**
 * Get entries from the last 7 days that are AI-allowed
 */
async function getWeeklyEntries(): Promise<DiaryEntry[]> {
  const now = new Date();
  const sevenDaysAgo = subDays(now, 7);
  const startDate = format(sevenDaysAgo, 'yyyy-MM-dd');
  const endDate = format(now, 'yyyy-MM-dd');

  const entries = await db.entries
    .where('date')
    .between(startDate, endDate, true, true)
    .toArray();

  // Filter: only AI-allowed AND non-private entries (double check for safety)
  return entries.filter(e => !e.isPrivate && e.aiAllowed !== false);
}

/**
 * Get cached weekly insight if still valid
 */
export async function getCachedWeeklyInsight(): Promise<WeeklyInsight | null> {
  try {
    const weekStart = getCurrentWeekStart();
    const cached = await db.table('weeklyInsights').get(weekStart);
    
    if (!cached) return null;
    
    // Check if cache is still valid (less than 24h old)
    const age = Date.now() - cached.generatedAt;
    if (age > CACHE_TTL_MS) {
      return null;
    }
    
    return cached as WeeklyInsight;
  } catch (e) {
    console.warn('Failed to get cached weekly insight:', e);
    return null;
  }
}

/**
 * Save weekly insight to cache
 */
async function saveWeeklyInsight(insight: WeeklyInsight): Promise<void> {
  try {
    await db.table('weeklyInsights').put(insight);
  } catch (e) {
    console.warn('Failed to save weekly insight:', e);
  }
}

/**
 * Generate weekly insight via Edge Function
 */
export async function generateWeeklyInsight(
  language: 'ru' | 'en'
): Promise<{ success: true; insight: WeeklyInsight } | { success: false; error: string }> {
  // Check AI token first
  if (!isAITokenValid()) {
    return { success: false, error: 'token_invalid' };
  }

  // Get entries
  const entries = await getWeeklyEntries();
  if (entries.length < 3) {
    return { success: false, error: 'not_enough_entries' };
  }

  // Prepare data for API (privacy-safe: no full text)
  const entryData = entries.map(e => ({
    date: e.date,
    mood: e.mood,
    semanticTags: e.semanticTags || [],
    title: e.title || undefined,
    text: e.text.slice(0, 100), // Just a short preview
  }));

  try {
    const token = getAIToken();
    if (!token) {
      return { success: false, error: 'token_invalid' };
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const response = await fetch(`${supabaseUrl}/functions/v1/ai-weekly-insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Token': token.token,
      },
      body: JSON.stringify({
        entries: entryData,
        language,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const error = data.error || `http_${response.status}`;
      console.error('Weekly insights API error:', error);
      return { success: false, error };
    }

    const result = await response.json();

    // Build insight object
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

    // Cache it
    await saveWeeklyInsight(insight);

    return { success: true, insight };
  } catch (e) {
    console.error('Weekly insights generation failed:', e);
    return { success: false, error: 'network_error' };
  }
}

/**
 * Get or generate weekly insight
 * First checks cache, then generates if needed
 * @param forceRegenerate - Skip cache and generate fresh insight
 */
export async function getOrGenerateWeeklyInsight(
  language: 'ru' | 'en',
  forceRegenerate: boolean = false
): Promise<{ success: true; insight: WeeklyInsight; fromCache: boolean } | { success: false; error: string }> {
  // Try cache first (unless force regenerate)
  if (!forceRegenerate) {
    const cached = await getCachedWeeklyInsight();
    if (cached) {
      return { success: true, insight: cached, fromCache: true };
    }
  }

  // Generate new
  const result = await generateWeeklyInsight(language);
  if (result.success === true) {
    return { success: true, insight: result.insight, fromCache: false };
  }

  return { success: false, error: result.error };
}

/**
 * Check if we have enough data for weekly insights
 */
export async function canGenerateWeeklyInsight(): Promise<boolean> {
  const entries = await getWeeklyEntries();
  return entries.length >= 3;
}
