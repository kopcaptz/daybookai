// Auto-Tag Detection Service - Local keyword/emoji-based tag suggestions
// For Cyber-Grimoire Daybook Journal

export interface TagSuggestion {
  tag: string;
  confidence: number; // 0-1
  source: 'keyword' | 'emoji';
}

// ============ TAG DETECTION RULES ============

interface TagRule {
  tag: string;
  tagRu: string;
  keywords: {
    ru: string[];
    en: string[];
  };
  emojis: string[];
}

// Bilingual tag detection rules
const TAG_RULES: TagRule[] = [
  {
    tag: 'Work',
    tagRu: 'Работа',
    keywords: {
      ru: ['работ', 'офис', 'проект', 'задач', 'дедлайн', 'митинг', 'коллег', 'начальник', 'клиент', 'договор', 'отчёт', 'презентац', 'совещан'],
      en: ['work', 'office', 'project', 'task', 'deadline', 'meeting', 'colleague', 'boss', 'client', 'contract', 'report', 'presentation'],
    },
    emojis: ['💼', '👔', '🏢', '📊', '📈', '💻', '🖥️', '📋', '📁'],
  },
  {
    tag: 'Family',
    tagRu: 'Семья',
    keywords: {
      ru: ['семь', 'мама', 'папа', 'родител', 'брат', 'сестр', 'дет', 'ребёнок', 'сын', 'дочь', 'муж', 'жена', 'бабушк', 'дедушк'],
      en: ['family', 'mom', 'dad', 'parent', 'brother', 'sister', 'child', 'kid', 'son', 'daughter', 'husband', 'wife', 'grandma', 'grandpa'],
    },
    emojis: ['👨‍👩‍👧', '👨‍👩‍👦', '👪', '👶', '🍼', '💑', '👫', '❤️', '🏠', '🏡'],
  },
  {
    tag: 'Health',
    tagRu: 'Здоровье',
    keywords: {
      ru: ['здоров', 'болезн', 'врач', 'больниц', 'лекарств', 'таблетк', 'симптом', 'температур', 'простуд', 'грипп', 'анализ', 'обследован'],
      en: ['health', 'sick', 'doctor', 'hospital', 'medicine', 'pill', 'symptom', 'fever', 'cold', 'flu', 'checkup', 'therapy'],
    },
    emojis: ['🏥', '💊', '🩺', '🤒', '🤧', '😷', '🩹', '💉', '🧬'],
  },
  {
    tag: 'Sport',
    tagRu: 'Спорт',
    keywords: {
      ru: ['спорт', 'тренировк', 'зал', 'фитнес', 'бег', 'пробежк', 'йог', 'плаван', 'футбол', 'баскетбол', 'велосипед', 'упражнен'],
      en: ['sport', 'workout', 'gym', 'fitness', 'run', 'jog', 'yoga', 'swim', 'football', 'soccer', 'basketball', 'bike', 'exercise'],
    },
    emojis: ['🏃', '🏋️', '⚽', '🏀', '🎾', '🏊', '🚴', '🧘', '💪', '🥇'],
  },
  {
    tag: 'Hobby',
    tagRu: 'Хобби',
    keywords: {
      ru: ['хобби', 'увлечен', 'рисова', 'музык', 'гитар', 'пиан', 'книг', 'чита', 'фильм', 'кино', 'сериал', 'игр', 'фото', 'рукодел'],
      en: ['hobby', 'draw', 'paint', 'music', 'guitar', 'piano', 'book', 'read', 'movie', 'film', 'series', 'game', 'photo', 'craft'],
    },
    emojis: ['🎨', '🎸', '🎹', '📚', '🎬', '🎮', '📷', '🎭', '🎤', '✏️'],
  },
  {
    tag: 'Friends',
    tagRu: 'Друзья',
    keywords: {
      ru: ['друг', 'друзь', 'подруг', 'товарищ', 'компани', 'вечеринк', 'встреч', 'посидел', 'тусовк', 'бар', 'клуб'],
      en: ['friend', 'buddy', 'pal', 'company', 'party', 'hangout', 'meet', 'bar', 'club', 'crew'],
    },
    emojis: ['👯', '🥳', '🍻', '🎉', '🎊', '👥', '🤝', '😎'],
  },
  {
    tag: 'Study',
    tagRu: 'Учёба',
    keywords: {
      ru: ['учёб', 'учеб', 'универ', 'школ', 'курс', 'лекци', 'экзамен', 'зачёт', 'диплом', 'домашк', 'семинар', 'препод'],
      en: ['study', 'school', 'university', 'college', 'course', 'lecture', 'exam', 'homework', 'diploma', 'seminar', 'professor', 'learn'],
    },
    emojis: ['📖', '📝', '🎓', '✏️', '📐', '🏫', '👨‍🎓', '👩‍🎓'],
  },
  {
    tag: 'Rest',
    tagRu: 'Отдых',
    keywords: {
      ru: ['отдых', 'выходн', 'релакс', 'отпуск', 'путешеств', 'поездк', 'пляж', 'море', 'гор', 'природ', 'пикник', 'прогулк'],
      en: ['rest', 'relax', 'vacation', 'holiday', 'trip', 'travel', 'beach', 'sea', 'mountain', 'nature', 'picnic', 'walk'],
    },
    emojis: ['🏖️', '🌴', '✈️', '🏔️', '🌊', '☀️', '🧘', '😴', '🛌', '🍹'],
  },
  {
    tag: 'Food',
    tagRu: 'Еда',
    keywords: {
      ru: ['еда', 'готов', 'рецепт', 'блюд', 'завтрак', 'обед', 'ужин', 'ресторан', 'кафе', 'кухн', 'вкусн', 'пробовал'],
      en: ['food', 'cook', 'recipe', 'meal', 'breakfast', 'lunch', 'dinner', 'restaurant', 'cafe', 'kitchen', 'tasty', 'delicious'],
    },
    emojis: ['🍕', '🍔', '🍣', '🍜', '🍳', '🥗', '🍰', '☕', '🍷', '🍽️', '👨‍🍳'],
  },
  {
    tag: 'Finance',
    tagRu: 'Финансы',
    keywords: {
      ru: ['деньг', 'финанс', 'бюджет', 'зарплат', 'расход', 'доход', 'кредит', 'ипотек', 'инвестиц', 'накоплен', 'сбережен', 'покупк'],
      en: ['money', 'finance', 'budget', 'salary', 'expense', 'income', 'credit', 'mortgage', 'invest', 'savings', 'purchase', 'pay'],
    },
    emojis: ['💰', '💵', '💳', '🏦', '📉', '📈', '💸', '🤑'],
  },
  {
    tag: 'Love',
    tagRu: 'Любовь',
    keywords: {
      ru: ['любовь', 'люблю', 'любим', 'свидан', 'романтик', 'отношен', 'парень', 'девушк', 'влюблён', 'поцелуй', 'объятия'],
      en: ['love', 'date', 'romantic', 'relationship', 'boyfriend', 'girlfriend', 'kiss', 'hug', 'crush', 'affection'],
    },
    emojis: ['❤️', '💕', '💗', '💘', '💑', '😍', '🥰', '💋', '💐', '🌹'],
  },
  {
    tag: 'Ideas',
    tagRu: 'Идеи',
    keywords: {
      ru: ['идея', 'придумал', 'мысль', 'концепц', 'план', 'замысел', 'инсайт', 'озарен', 'вдохновен'],
      en: ['idea', 'thought', 'concept', 'plan', 'insight', 'inspiration', 'brainstorm', 'eureka'],
    },
    emojis: ['💡', '✨', '🧠', '🎯', '📌'],
  },
];

// ============ DETECTION FUNCTIONS ============

/**
 * Detect language from text (simple heuristic)
 */
function detectLanguage(text: string): 'ru' | 'en' | 'mixed' {
  const cyrillicCount = (text.match(/[а-яё]/gi) || []).length;
  const latinCount = (text.match(/[a-z]/gi) || []).length;
  
  if (cyrillicCount > latinCount * 2) return 'ru';
  if (latinCount > cyrillicCount * 2) return 'en';
  return 'mixed';
}

/**
 * Check if text contains any keyword from list (case-insensitive, partial match)
 */
function matchesKeywords(text: string, keywords: string[]): number {
  const lowerText = text.toLowerCase();
  let matchCount = 0;
  
  for (const keyword of keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      matchCount++;
    }
  }
  
  return matchCount;
}

/**
 * Check if text contains any emoji from list
 */
function matchesEmojis(text: string, emojis: string[]): number {
  let matchCount = 0;
  
  for (const emoji of emojis) {
    if (text.includes(emoji)) {
      matchCount++;
    }
  }
  
  return matchCount;
}

/**
 * Analyze text and suggest tags based on keywords and emojis
 * Returns bilingual tags based on detected language
 */
export function detectTags(text: string, existingTags: string[] = []): TagSuggestion[] {
  if (!text || text.trim().length < 5) {
    return [];
  }
  
  const trimmedText = text.trim();
  const lang = detectLanguage(trimmedText);
  const suggestions: TagSuggestion[] = [];
  
  // Normalize existing tags for comparison (case-insensitive)
  const existingLower = new Set(existingTags.map(t => t.toLowerCase()));
  
  for (const rule of TAG_RULES) {
    // Skip if tag already added
    if (existingLower.has(rule.tag.toLowerCase()) || existingLower.has(rule.tagRu.toLowerCase())) {
      continue;
    }
    
    // Check keywords based on detected language
    let keywordMatches = 0;
    if (lang === 'ru' || lang === 'mixed') {
      keywordMatches += matchesKeywords(trimmedText, rule.keywords.ru);
    }
    if (lang === 'en' || lang === 'mixed') {
      keywordMatches += matchesKeywords(trimmedText, rule.keywords.en);
    }
    
    // Check emojis
    const emojiMatches = matchesEmojis(trimmedText, rule.emojis);
    
    // Calculate confidence
    const totalMatches = keywordMatches + emojiMatches * 1.5; // Emojis weight more
    
    if (totalMatches >= 1) {
      const confidence = Math.min(0.3 + totalMatches * 0.15, 0.95);
      
      // Use localized tag name based on primary language
      const tagName = lang === 'ru' ? rule.tagRu : rule.tag;
      
      suggestions.push({
        tag: tagName,
        confidence,
        source: emojiMatches > keywordMatches ? 'emoji' : 'keyword',
      });
    }
  }
  
  // Sort by confidence descending
  suggestions.sort((a, b) => b.confidence - a.confidence);
  
  // Return top 3 suggestions
  return suggestions.slice(0, 3);
}

/**
 * Get all available preset tags (for autocomplete)
 */
export function getPresetTags(lang: 'ru' | 'en'): string[] {
  return TAG_RULES.map(rule => lang === 'ru' ? rule.tagRu : rule.tag);
}
