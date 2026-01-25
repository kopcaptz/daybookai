/**
 * Keyword-based heuristics for detecting actionable text in diary entries.
 * MVP: No AI - pure keyword/pattern matching for RU and EN.
 */

export type SuggestedTime = 'later_today' | 'tomorrow_morning' | 'weekend' | 'next_week';

export interface DetectionResult {
  isActionable: boolean;
  suggestedTime?: SuggestedTime;
  matchedKeywords: string[];
}

// Keyword categories with RU and EN variants
const URGENCY_KEYWORDS = {
  ru: ['срочно', 'важно', 'не забыть', 'напомни', 'обязательно', 'критично'],
  en: ['urgent', 'important', "don't forget", 'dont forget', 'remind', 'must', 'critical', 'asap'],
};

const TIME_REFS = {
  ru: {
    today: ['сегодня', 'вечером', 'позже'],
    tomorrow: ['завтра', 'утром'],
    weekend: ['выходные', 'суббот', 'воскресен'],
    week: ['на неделе', 'на этой неделе', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу'],
  },
  en: {
    today: ['today', 'tonight', 'later', 'this evening'],
    tomorrow: ['tomorrow', 'morning'],
    weekend: ['weekend', 'saturday', 'sunday'],
    week: ['this week', 'next week', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  },
};

const ACTION_VERBS = {
  ru: [
    'купить', 'позвонить', 'написать', 'сделать', 'оплатить', 'отправить',
    'забрать', 'отнести', 'проверить', 'записаться', 'заказать', 'вернуть',
    'подготовить', 'найти', 'узнать', 'спросить', 'напомнить', 'взять',
  ],
  en: [
    'buy', 'call', 'text', 'do', 'pay', 'send', 'pick up', 'drop off',
    'check', 'book', 'order', 'return', 'prepare', 'find', 'ask', 'remind',
    'get', 'make', 'schedule', 'submit', 'email', 'reply', 'follow up',
  ],
};

/**
 * Detect if text contains actionable content using keyword heuristics.
 * Returns detection result with suggested time if actionable.
 */
export function detectActionableText(text: string): DetectionResult {
  const lowerText = text.toLowerCase();
  const matchedKeywords: string[] = [];
  
  // Check urgency keywords
  const hasUrgency = checkKeywords(lowerText, URGENCY_KEYWORDS, matchedKeywords);
  
  // Check action verbs
  const hasActionVerb = checkKeywords(lowerText, ACTION_VERBS, matchedKeywords);
  
  // Check time references and determine suggested time
  const timeInfo = detectTimeReference(lowerText, matchedKeywords);
  
  // Actionable if has urgency OR (action verb AND at least some context)
  const isActionable = hasUrgency || (hasActionVerb && matchedKeywords.length >= 1);
  
  if (!isActionable) {
    return { isActionable: false, matchedKeywords: [] };
  }
  
  // Determine suggested time based on detected patterns
  let suggestedTime: SuggestedTime = 'tomorrow_morning'; // Default
  
  if (timeInfo.detected) {
    suggestedTime = timeInfo.suggestedTime!;
  } else if (hasUrgency) {
    // Urgent items default to later today
    suggestedTime = 'later_today';
  }
  
  return {
    isActionable: true,
    suggestedTime,
    matchedKeywords,
  };
}

/**
 * Check if text contains any keywords from the given category.
 */
function checkKeywords(
  text: string,
  keywords: { ru: string[]; en: string[] },
  matchedKeywords: string[]
): boolean {
  let found = false;
  
  for (const keyword of [...keywords.ru, ...keywords.en]) {
    if (text.includes(keyword)) {
      matchedKeywords.push(keyword);
      found = true;
    }
  }
  
  return found;
}

/**
 * Detect time references and return suggested time.
 */
function detectTimeReference(
  text: string,
  matchedKeywords: string[]
): { detected: boolean; suggestedTime?: SuggestedTime } {
  // Check today references
  for (const keyword of [...TIME_REFS.ru.today, ...TIME_REFS.en.today]) {
    if (text.includes(keyword)) {
      matchedKeywords.push(keyword);
      return { detected: true, suggestedTime: 'later_today' };
    }
  }
  
  // Check tomorrow references
  for (const keyword of [...TIME_REFS.ru.tomorrow, ...TIME_REFS.en.tomorrow]) {
    if (text.includes(keyword)) {
      matchedKeywords.push(keyword);
      return { detected: true, suggestedTime: 'tomorrow_morning' };
    }
  }
  
  // Check weekend references
  for (const keyword of [...TIME_REFS.ru.weekend, ...TIME_REFS.en.weekend]) {
    if (text.includes(keyword)) {
      matchedKeywords.push(keyword);
      return { detected: true, suggestedTime: 'weekend' };
    }
  }
  
  // Check week references
  for (const keyword of [...TIME_REFS.ru.week, ...TIME_REFS.en.week]) {
    if (text.includes(keyword)) {
      matchedKeywords.push(keyword);
      return { detected: true, suggestedTime: 'next_week' };
    }
  }
  
  return { detected: false };
}

/**
 * Extract a short snippet from text for the reminder action.
 * Takes first ~100 chars or first sentence, whichever is shorter.
 */
export function extractActionSnippet(text: string, maxLength: number = 100): string {
  // Trim and normalize whitespace
  const normalized = text.trim().replace(/\s+/g, ' ');
  
  // Find first sentence end
  const sentenceEnd = normalized.search(/[.!?]\s|[.!?]$/);
  
  if (sentenceEnd > 0 && sentenceEnd < maxLength) {
    return normalized.slice(0, sentenceEnd + 1);
  }
  
  if (normalized.length <= maxLength) {
    return normalized;
  }
  
  // Truncate at word boundary
  const truncated = normalized.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  return lastSpace > maxLength * 0.5
    ? truncated.slice(0, lastSpace) + '…'
    : truncated + '…';
}
