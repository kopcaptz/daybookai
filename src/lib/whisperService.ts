import { format } from 'date-fns';
import { logger } from './logger';
import { isAITokenValid, getAIToken } from './aiTokenService';

// Fallback whispers for when AI is unavailable
const FALLBACK_WHISPERS = {
  ru: [
    "Новый день — чистая страница гримуара.",
    "Что запишет твоё перо сегодня?",
    "Каждая запись — след в вечности.",
    "Мысли ждут своего воплощения.",
    "День начинается с первого слова.",
    "Гримуар готов принять твои секреты.",
    "Время течёт, записи остаются.",
    "Пусть этот день станет главой.",
    "Свет экрана — твой маяк.",
    "Начни с малого, закончи легендой.",
    "Сигилы ждут твоих команд.",
    "Что важно — то запомнится.",
    "Мгновение стоит тысячи слов.",
    "Открой разум, открой гримуар.",
    "Сегодня — всего лишь начало.",
    "Чернила памяти не высыхают.",
    "Каждый день — новый ритуал.",
    "Пиши историю, пока она свежа.",
    "Тишина перед бурей идей.",
    "Гримуар слушает внимательно.",
    "Первая запись — первый шаг.",
    "Мысль без записи — потерянный клад.",
    "День без записи — день без следа.",
    "Цифры и буквы хранят магию.",
    "Открой портал в свой день.",
    "Новая неделя — чистый холст.",
    "Пятница шепчет: подведи итоги.",
    "Утро мудренее вечера.",
    "Ночь хранит самые честные мысли.",
    "Выходные — время для рефлексии.",
  ],
  en: [
    "A new day — a blank grimoire page.",
    "What will your quill inscribe today?",
    "Every entry leaves a trace in eternity.",
    "Thoughts await their embodiment.",
    "The day begins with the first word.",
    "The grimoire is ready for your secrets.",
    "Time flows, entries remain.",
    "Let this day become a chapter.",
    "Screen light — your beacon.",
    "Start small, end legendary.",
    "Sigils await your commands.",
    "What matters will be remembered.",
    "A moment is worth a thousand words.",
    "Open your mind, open your grimoire.",
    "Today is just the beginning.",
    "The ink of memory never dries.",
    "Every day — a new ritual.",
    "Write history while it's fresh.",
    "Silence before the storm of ideas.",
    "The grimoire listens carefully.",
    "First entry — first step.",
    "Thought without record — lost treasure.",
    "A day without entry — a day without trace.",
    "Numbers and letters hold magic.",
    "Open the portal to your day.",
    "New week — clean canvas.",
    "Friday whispers: summarize.",
    "Morning is wiser than evening.",
    "Night keeps the most honest thoughts.",
    "Weekends — time for reflection.",
  ],
};

// Cache key for localStorage
function getCacheKey(date: string): string {
  return `whisper-${date}`;
}

// Get cached whisper
export function getCachedWhisper(date: string): string | null {
  try {
    return localStorage.getItem(getCacheKey(date));
  } catch {
    return null;
  }
}

// Cache whisper
function cacheWhisper(date: string, whisper: string): void {
  try {
    localStorage.setItem(getCacheKey(date), whisper);
  } catch {
    // Ignore storage errors
  }
}

// Get a deterministic fallback based on date
// Accepts Language type from i18n, falls back to 'en' for non-ru languages
export function getFallbackWhisper(language: string, date: string): string {
  const baseLang = language === 'ru' ? 'ru' : 'en';
  const whispers = FALLBACK_WHISPERS[baseLang];
  
  // Use date string to get a deterministic index
  const dateHash = date.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const dayOfWeek = new Date(date).getDay();
  
  // Combine hash with day of week for variety
  const index = (dateHash + dayOfWeek) % whispers.length;
  
  return whispers[index];
}

// Get time of day context
function getTimeOfDay(): 'morning' | 'day' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'day';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

// Get season
function getSeason(): 'spring' | 'summer' | 'autumn' | 'winter' {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

// Fetch whisper from AI (with fallback)
// Accepts Language type from i18n
export async function fetchWhisper(language: string): Promise<string> {
  const today = format(new Date(), 'yyyy-MM-dd');
  
  // Check cache first
  const cached = getCachedWhisper(today);
  if (cached) {
    return cached;
  }
  
  // If no valid AI token, use fallback immediately
  if (!isAITokenValid()) {
    logger.debug('Whisper', 'No valid AI token, using fallback');
    const fallback = getFallbackWhisper(language, today);
    cacheWhisper(today, fallback);
    return fallback;
  }

  try {
    // Build headers with AI token
    const tokenData = getAIToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    };
    if (tokenData?.token) {
      headers['X-AI-Token'] = tokenData.token;
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-whisper`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          language,
          date: today,
          dayOfWeek: new Date().getDay(),
          timeOfDay: getTimeOfDay(),
          season: getSeason(),
        }),
      }
    );
    
    if (!response.ok) {
      throw new Error('AI whisper failed');
    }
    
    const data = await response.json();
    const whisper = data.whisper || getFallbackWhisper(language, today);
    
    // Cache the result
    cacheWhisper(today, whisper);
    
    return whisper;
  } catch (error) {
    logger.debug('Whisper', 'AI unavailable, using fallback');
    const fallback = getFallbackWhisper(language, today);
    cacheWhisper(today, fallback);
    return fallback;
  }
}
