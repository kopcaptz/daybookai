import { format } from 'date-fns';
import { db, StoredBiography, DiaryEntry, loadBioSettings, saveBioSettings } from './db';
import { loadAISettings, AI_PROFILES, AIProfile } from './aiConfig';
import { getAIToken, isAITokenValid } from './aiTokenService';
import { 
  isAuthError, 
  createAIAuthError, 
  requestPinDialog,
  getErrorMessage,
  AIAuthRetryError,
} from './aiAuthRecovery';
import { toast } from 'sonner';
import type { Language } from './i18n';

// Helper to get base language for AI services (ru/en only)
const getBaseLanguage = (lang: Language): 'ru' | 'en' => 
  lang === 'ru' ? 'ru' : 'en';

// Re-export StoredBiography for components
export type { StoredBiography } from './db';

// Edge function URLs
const AI_BIOGRAPHY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-biography`;

// Get AI token header (returns empty object if no valid token)
function getAITokenHeader(): Record<string, string> {
  const tokenData = getAIToken();
  if (tokenData?.token) {
    return { 'X-AI-Token': tokenData.token };
  }
  return {};
}

// Entry summary for AI (no raw text, privacy-safe)
interface EntrySummary {
  timeLabel: string;    // e.g., "09:30", "утро"
  mood: number;         // 1-5
  themes: string[];     // extracted topics
  tags: string[];
  attachmentCount: number;
}

// Result type that includes requestId
interface GenerationResult {
  biography: StoredBiography['biography'];
  requestId?: string;
}

// Error with requestId for correlation
interface BiographyError extends Error {
  requestId?: string;
  statusCode?: number;
}

// Extract themes from text (local processing, no AI)
function extractThemes(text: string): string[] {
  const words = text.toLowerCase().split(/\s+/);
  const themes: string[] = [];
  
  const themeKeywords: Record<string, string[]> = {
    'работа': ['работа', 'офис', 'проект', 'задача', 'встреча', 'коллега', 'дедлайн', 'work', 'office', 'project', 'meeting'],
    'семья': ['семья', 'дом', 'родители', 'дети', 'муж', 'жена', 'family', 'home', 'parents', 'kids'],
    'здоровье': ['здоровье', 'спорт', 'врач', 'болезнь', 'усталость', 'тренировка', 'health', 'gym', 'doctor'],
    'отдых': ['отдых', 'выходные', 'прогулка', 'фильм', 'книга', 'сериал', 'rest', 'weekend', 'walk', 'movie'],
    'еда': ['еда', 'обед', 'ужин', 'завтрак', 'ресторан', 'готовить', 'food', 'lunch', 'dinner', 'breakfast'],
    'друзья': ['друзья', 'друг', 'подруга', 'встреча', 'friends', 'hangout'],
    'учёба': ['учёба', 'курс', 'лекция', 'экзамен', 'study', 'course', 'lecture', 'exam'],
    'путешествие': ['путешествие', 'поездка', 'отпуск', 'travel', 'trip', 'vacation'],
    'творчество': ['творчество', 'рисовать', 'музыка', 'писать', 'creative', 'art', 'music', 'writing'],
    'покупки': ['покупки', 'магазин', 'заказ', 'shopping', 'store', 'order'],
  };
  
  for (const [theme, keywords] of Object.entries(themeKeywords)) {
    if (keywords.some(kw => words.some(w => w.includes(kw)))) {
      themes.push(theme);
    }
  }
  
  return themes.slice(0, 5); // max 5 themes
}

// Convert timestamp to time label
function getTimeLabel(timestamp: number, language: Language): string {
  const date = new Date(timestamp);
  const hour = date.getHours();
  const baseLang = getBaseLanguage(language);
  
  if (baseLang === 'ru') {
    if (hour >= 5 && hour < 12) return 'утро';
    if (hour >= 12 && hour < 17) return 'день';
    if (hour >= 17 && hour < 21) return 'вечер';
    return 'ночь';
  }
  
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

// Prepare batch summaries from entries (local, no AI)
async function prepareEntrySummaries(
  date: string,
  language: Language
): Promise<{ summaries: EntrySummary[]; entryIds: number[] }> {
  const entries = await db.entries
    .where('date')
    .equals(date)
    .filter(entry => !entry.isPrivate && entry.aiAllowed !== false)
    .sortBy('createdAt');
  
  if (entries.length === 0) {
    return { summaries: [], entryIds: [] };
  }
  
  const summaries: EntrySummary[] = [];
  const entryIds: number[] = [];
  
  for (const entry of entries) {
    if (entry.id) entryIds.push(entry.id);
    
    // Count attachments
    let attachmentCount = 0;
    if (entry.id) {
      attachmentCount = await db.attachments
        .where('entryId')
        .equals(entry.id)
        .count();
    }
    
    summaries.push({
      timeLabel: getTimeLabel(entry.createdAt, language),
      mood: entry.mood,
      themes: extractThemes(entry.text),
      tags: entry.tags,
      attachmentCount,
    });
  }
  
  return { summaries, entryIds };
}

// Parse AI error with localization
function parseAIError(status: number, language: Language): string {
  const baseLang = getBaseLanguage(language);
  const messages: Record<number, { ru: string; en: string }> = {
    401: { ru: 'Ошибка авторизации сервиса', en: 'Service authorization error' },
    402: { ru: 'Требуется оплата сервиса', en: 'Payment required' },
    403: { ru: 'Доступ запрещён', en: 'Access denied' },
    429: { ru: 'Слишком много запросов. Подождите.', en: 'Too many requests. Please wait.' },
    500: { ru: 'Сервер временно недоступен', en: 'Server temporarily unavailable' },
    502: { ru: 'Сервер временно недоступен', en: 'Server temporarily unavailable' },
    503: { ru: 'Сервер временно недоступен', en: 'Server temporarily unavailable' },
  };
  
  return messages[status]?.[baseLang] || 
    (baseLang === 'ru' ? `Ошибка: ${status}` : `Error: ${status}`);
}

// Generate biography via dedicated edge function (non-streaming, with auto-PIN retry)
export async function generateBiography(
  date: string,
  profile: AIProfile = 'biography',
  language: Language = 'ru',
  _isRetry: boolean = false
): Promise<GenerationResult> {
  // Check token before making request (only on first attempt)
  if (!_isRetry && !isAITokenValid()) {
    // Try to get a PIN first
    try {
      await requestPinDialog(undefined, 'ai_token_required');
    } catch {
      const error = new Error(getErrorMessage('pin_cancelled', language)) as BiographyError;
      error.statusCode = 401;
      throw error;
    }
  }
  
  const { summaries } = await prepareEntrySummaries(date, language);
  
  if (summaries.length === 0) {
    const error = new Error(language === 'ru' 
      ? 'Нет записей для генерации биографии за этот день.'
      : 'No entries available to generate biography for this day.') as BiographyError;
    throw error;
  }
  
  const profileConfig = AI_PROFILES[profile];
  
  // Call dedicated biography endpoint with preprocessed items
  const response = await fetch(AI_BIOGRAPHY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAITokenHeader(),
    },
    body: JSON.stringify({
      model: profileConfig.model,
      items: summaries,
      language,
      date,
      maxTokens: profileConfig.maxTokens,
      temperature: profileConfig.temperature,
    }),
  });
  
  // Extract requestId from response header
  const requestId = response.headers.get('X-Request-Id') || undefined;
  
  // Handle 401 with auto-retry
  if (response.status === 401 && !_isRetry) {
    const errorData = await createAIAuthError(response);
    if (errorData.isRetryable) {
      try {
        await requestPinDialog(errorData.requestId, errorData.errorCode);
        // Retry once after successful PIN
        return generateBiography(date, profile, language, true);
      } catch {
        const error = new Error(getErrorMessage('pin_cancelled', language)) as BiographyError;
        error.requestId = errorData.requestId;
        error.statusCode = 401;
        throw error;
      }
    }
    const error = new Error(getErrorMessage(errorData.errorCode, language)) as BiographyError;
    error.requestId = errorData.requestId;
    error.statusCode = 401;
    throw error;
  }
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(errorData.error || parseAIError(response.status, language)) as BiographyError;
    error.requestId = requestId || errorData.requestId;
    error.statusCode = response.status;
    throw error;
  }
  
  const data = await response.json();
  
  return {
    biography: {
      title: data.title || '',
      narrative: data.narrative || '',
      highlights: data.highlights || [],
      timeline: data.timeline || [],
      meta: { 
        profile, 
        model: data.meta?.model || profileConfig.model,
        tokens: data.meta?.tokens,
        requestId: requestId || data.meta?.requestId,
      },
    },
    requestId: requestId || data.meta?.requestId,
  };
}

// Get biography for date
export async function getBiography(date: string): Promise<StoredBiography | undefined> {
  return await db.biographies.get(date);
}

// Save biography
export async function saveBiography(bio: StoredBiography): Promise<void> {
  await db.biographies.put(bio);
}

// Get pending biographies
export async function getPendingBiographies(): Promise<StoredBiography[]> {
  return await db.biographies
    .where('status')
    .anyOf(['pending', 'failed'])
    .toArray();
}

// Check if biography time has passed today
export function isBioTimeReached(): boolean {
  const settings = loadBioSettings();
  const [hours, minutes] = settings.bioTime.split(':').map(Number);
  const now = new Date();
  const bioTime = new Date();
  bioTime.setHours(hours, minutes, 0, 0);
  return now >= bioTime;
}

// Get today's date string
export function getTodayDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

// Check if we should prompt for biography today
export function shouldPromptBiography(): boolean {
  const settings = loadBioSettings();
  const today = getTodayDate();
  
  // Don't prompt if already prompted today
  if (settings.lastPromptDate === today) return false;
  
  // Only prompt if bio time has passed
  return isBioTimeReached();
}

// Mark that we prompted today
export function markBioPrompted(): void {
  saveBioSettings({ lastPromptDate: getTodayDate() });
}

// Per-date update prompt tracking (stored in memory for session)
const updatePromptedDates = new Set<string>();

// Check if we already prompted for update on this date (this session)
export function wasUpdatePrompted(date: string): boolean {
  return updatePromptedDates.has(date);
}

// Mark that we prompted for update on this date
export function markUpdatePrompted(date: string): void {
  updatePromptedDates.add(date);
}

// Check if biography for a date is stale (new/updated entries since generation)
export async function isBiographyStale(date: string): Promise<boolean> {
  const bio = await getBiography(date);
  
  // No biography or not complete → not "stale", just missing
  if (!bio || bio.status !== 'complete' || !bio.biography) {
    return false;
  }
  
  // Get current entries for this date (non-private, AI-allowed)
  const entries = await db.entries
    .where('date')
    .equals(date)
    .filter(e => !e.isPrivate && e.aiAllowed !== false)
    .toArray();
  
  // Check for new entries not in sourceEntryIds
  const sourceIds = new Set(bio.sourceEntryIds || []);
  const hasNewEntries = entries.some(e => e.id && !sourceIds.has(e.id));
  
  if (hasNewEntries) {
    return true;
  }
  
  // Check for updated entries (updatedAt > generatedAt)
  const hasUpdatedEntries = entries.some(e => 
    e.updatedAt && e.updatedAt > bio.generatedAt
  );
  
  return hasUpdatedEntries;
}

// Show error toast with requestId for support
function showErrorToast(
  message: string, 
  requestId: string | undefined, 
  language: 'ru' | 'en'
): void {
  const title = language === 'ru' ? 'Ошибка генерации биографии' : 'Biography generation error';
  const description = requestId 
    ? `${message}\n\nRequestId: ${requestId.slice(0, 8)}...`
    : message;
  
  toast.error(title, {
    description,
    duration: 8000, // Longer duration to allow copying
  });
}

// Request biography generation (creates pending entry and attempts)
// showToast: true for user-initiated, false for background retries
export async function requestBiographyGeneration(
  date: string,
  language: 'ru' | 'en' = 'ru',
  showToast: boolean = true
): Promise<StoredBiography> {
  const settings = loadAISettings();
  
  // Get existing or create new
  let bio = await getBiography(date);
  
  // Get entry IDs for this date
  const entries = await db.entries
    .where('date')
    .equals(date)
    .filter(e => !e.isPrivate && e.aiAllowed !== false)
    .toArray();
  const entryIds = entries.map(e => e.id!).filter(Boolean);
  
  if (!bio) {
    bio = {
      date,
      generatedAt: Date.now(),
      status: 'pending',
      retryCount: 0,
      biography: null,
      sourceEntryIds: entryIds,
    };
    await saveBiography(bio);
  }
  
  // If AI is disabled, keep as pending
  if (!settings.enabled) {
    return bio;
  }
  
  // Attempt generation
  try {
    const result = await generateBiography(date, settings.bioProfile, language);
    bio = {
      ...bio,
      generatedAt: Date.now(),
      status: 'complete',
      biography: result.biography,
      sourceEntryIds: entryIds,
      errorMessage: undefined,
      lastRequestId: result.requestId,
    };
    await saveBiography(bio);
    
    // Show notification on success
    try {
      const { showBiographyNotification } = await import('./notifications');
      await showBiographyNotification(date, result.biography?.title || '', language);
    } catch {
      // Notification not critical
    }
  } catch (e) {
    const error = e as BiographyError;
    const requestId = error.requestId;
    
    bio = {
      ...bio,
      status: 'failed',
      retryCount: bio.retryCount + 1,
      errorMessage: error.message || 'Unknown error',
      lastRequestId: requestId,
    };
    await saveBiography(bio);
    
    // Show toast only for user-initiated requests
    if (showToast) {
      showErrorToast(error.message, requestId, language);
    }
  }
  
  return bio;
}

// Retry pending biographies (background, silent unless max retries reached)
export async function retryPendingBiographies(
  language: 'ru' | 'en' = 'ru'
): Promise<number> {
  const settings = loadAISettings();
  if (!settings.enabled) return 0;
  
  const pending = await getPendingBiographies();
  let retried = 0;
  let maxRetriesReached = 0;
  
  for (const bio of pending) {
    // Skip if too many retries
    if (bio.retryCount >= 3) {
      maxRetriesReached++;
      continue;
    }
    
    // Silent retry (no toast)
    await requestBiographyGeneration(bio.date, language, false);
    retried++;
  }
  
  // Show single banner if any biographies reached max retries
  if (maxRetriesReached > 0) {
    const message = language === 'ru'
      ? `${maxRetriesReached} биографий не удалось сгенерировать после нескольких попыток`
      : `${maxRetriesReached} biographies failed after multiple attempts`;
    
    toast.warning(language === 'ru' ? 'Отложенные биографии' : 'Pending biographies', {
      description: message,
      duration: 6000,
    });
  }
  
  return retried;
}
