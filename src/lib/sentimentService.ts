// Sentiment Analysis Service - Local keyword-based + AI fallback
// Predictive Mood Tracking for Cyber-Grimoire

import { db, DiscussionMessage } from '@/lib/db';

export interface SentimentResult {
  mood: number;          // 1-5
  confidence: number;    // 0-1
  source: 'local' | 'ai' | 'inherited';
}

export interface InheritedMoodContext {
  mood: number;
  timestamp: number;
  source: 'discussion' | 'entry' | 'default';
  confidence: 'low' | 'medium' | 'high';
}

// Decay window: 4 hours in milliseconds
const MOOD_DECAY_MS = 4 * 60 * 60 * 1000;

// ============ LOCAL SENTIMENT ANALYSIS ============

// Emoji sentiment mapping (direct mood indicators)
const EMOJI_SENTIMENT: Record<string, number> = {
  // Very negative (1)
  '😢': 1, '😭': 1, '💔': 1, '😞': 1, '😣': 1, '😖': 1, '😩': 1, '😫': 1,
  '😤': 1, '😡': 1, '🤬': 1, '💀': 1, '☠️': 1, '😵': 1,
  
  // Negative (2)
  '😔': 2, '😟': 2, '😕': 2, '🙁': 2, '☹️': 2, '😰': 2, '😥': 2, '😓': 2,
  '🤒': 2, '🤕': 2, '😪': 2, '😴': 2, '🥱': 2, '😑': 2,
  
  // Neutral (3)
  '😐': 3, '😶': 3, '🤔': 3, '🤨': 3, '🧐': 3, '💭': 3, '🤷': 3,
  
  // Positive (4)
  '🙂': 4, '😊': 4, '😌': 4, '😏': 4, '🙃': 4, '😉': 4, '👍': 4, '👌': 4,
  '✅': 4, '💪': 4, '🎯': 4, '⭐': 4, '🌟': 4,
  
  // Very positive (5)
  '😁': 5, '😃': 5, '😄': 5, '😆': 5, '🥳': 5, '🎉': 5, '🎊': 5, '❤️': 5,
  '💖': 5, '💕': 5, '🔥': 5, '✨': 5, '🚀': 5, '🏆': 5, '💯': 5, '🤩': 5,
};

// Russian keyword sentiment (without diacritics for broader matching)
const RU_NEGATIVE_KEYWORDS = [
  // Very negative
  'ужас', 'кошмар', 'провал', 'катастроф', 'смерт', 'умер', 'убил',
  'ненавижу', 'отврат', 'мерз', 'гадост', 'дерьм', 'хрен', 'блин',
  // Negative
  'плох', 'тяжел', 'трудн', 'сложн', 'проблем', 'ошибк', 'неудач',
  'устал', 'измотан', 'выжат', 'разбит', 'болит', 'боль', 'больн',
  'грустн', 'печал', 'тоск', 'скуч', 'одинок', 'злит', 'бесит',
  'раздраж', 'нервн', 'стресс', 'тревог', 'страх', 'боюсь',
  'разочар', 'обид', 'обман', 'предал', 'потеря', 'сломал',
];

const RU_POSITIVE_KEYWORDS = [
  // Very positive
  'отлично', 'прекрасн', 'замечательн', 'великолепн', 'чудесн', 'идеальн',
  'счастлив', 'счасть', 'радост', 'восторг', 'эйфор', 'кайф', 'супер',
  'офигенн', 'круто', 'класс', 'топ', 'бомба', 'огонь', 'победа', 'успех',
  // Positive
  'хорош', 'норм', 'неплох', 'нравит', 'люблю', 'любим', 'рад',
  'довол', 'спокойн', 'уютн', 'тепл', 'приятн', 'интересн', 'весел',
  'смеш', 'забавн', 'продуктивн', 'эффективн', 'справил', 'получил',
  'сделал', 'закончил', 'достиг', 'добил', 'решил', 'помог', 'благодар',
];

const EN_NEGATIVE_KEYWORDS = [
  // Very negative
  'terrible', 'awful', 'horrible', 'disaster', 'catastrophe', 'nightmare',
  'hate', 'disgusting', 'death', 'died', 'killed', 'worst', 'failed',
  // Negative
  'bad', 'hard', 'difficult', 'problem', 'issue', 'error', 'mistake',
  'tired', 'exhausted', 'drained', 'broken', 'pain', 'hurt', 'sick',
  'sad', 'upset', 'down', 'lonely', 'angry', 'frustrated', 'annoyed',
  'stressed', 'anxious', 'worried', 'scared', 'afraid', 'disappointed',
  'failed', 'lost', 'struggle', 'tough',
];

const EN_POSITIVE_KEYWORDS = [
  // Very positive
  'excellent', 'amazing', 'wonderful', 'fantastic', 'perfect', 'incredible',
  'happy', 'joy', 'thrilled', 'excited', 'awesome', 'great', 'love',
  'best', 'success', 'victory', 'win', 'achieved', 'accomplished',
  // Positive
  'good', 'nice', 'fine', 'okay', 'pleasant', 'enjoy', 'like', 'glad',
  'satisfied', 'calm', 'peaceful', 'relaxed', 'comfortable', 'fun',
  'interesting', 'productive', 'effective', 'done', 'finished', 'helped',
  'grateful', 'thankful', 'blessed', 'lucky',
];

// Punctuation sentiment signals
function getPunctuationSignal(text: string): number {
  const exclamations = (text.match(/!/g) || []).length;
  const questions = (text.match(/\?/g) || []).length;
  const ellipses = (text.match(/\.{3,}/g) || []).length;
  
  // Multiple exclamations can indicate strong emotion (positive or negative)
  // Ellipses often indicate sadness/contemplation
  if (ellipses > 2) return -0.2;
  if (exclamations > 3) return 0.1; // Slight positive bias for enthusiasm
  
  return 0;
}

// Count keyword matches
function countKeywordMatches(text: string, keywords: string[]): number {
  const lowerText = text.toLowerCase();
  return keywords.reduce((count, keyword) => {
    return count + (lowerText.includes(keyword) ? 1 : 0);
  }, 0);
}

// Extract emoji sentiment
function getEmojiSentiment(text: string): { totalScore: number; count: number } {
  let totalScore = 0;
  let count = 0;
  
  for (const [emoji, score] of Object.entries(EMOJI_SENTIMENT)) {
    const matches = (text.match(new RegExp(emoji, 'g')) || []).length;
    if (matches > 0) {
      totalScore += score * matches;
      count += matches;
    }
  }
  
  return { totalScore, count };
}

/**
 * Analyze sentiment locally using keywords and emojis
 * Fast, works offline, <5ms latency
 */
export function analyzeSentimentLocal(text: string): SentimentResult {
  if (!text || text.trim().length < 3) {
    return { mood: 3, confidence: 0, source: 'local' };
  }
  
  const trimmedText = text.trim();
  
  // 1. Check emojis first (strongest signal)
  const emojiResult = getEmojiSentiment(trimmedText);
  if (emojiResult.count > 0) {
    const avgEmojiMood = Math.round(emojiResult.totalScore / emojiResult.count);
    const emojiConfidence = Math.min(0.3 + emojiResult.count * 0.15, 0.9);
    return { 
      mood: Math.max(1, Math.min(5, avgEmojiMood)), 
      confidence: emojiConfidence, 
      source: 'local' 
    };
  }
  
  // 2. Keyword analysis
  const ruNegCount = countKeywordMatches(trimmedText, RU_NEGATIVE_KEYWORDS);
  const ruPosCount = countKeywordMatches(trimmedText, RU_POSITIVE_KEYWORDS);
  const enNegCount = countKeywordMatches(trimmedText, EN_NEGATIVE_KEYWORDS);
  const enPosCount = countKeywordMatches(trimmedText, EN_POSITIVE_KEYWORDS);
  
  const totalNeg = ruNegCount + enNegCount;
  const totalPos = ruPosCount + enPosCount;
  const totalMatches = totalNeg + totalPos;
  
  if (totalMatches === 0) {
    // No keywords found, check punctuation
    const punctSignal = getPunctuationSignal(trimmedText);
    return { 
      mood: 3 + Math.round(punctSignal), 
      confidence: 0.1, 
      source: 'local' 
    };
  }
  
  // Calculate weighted mood score
  const negWeight = totalNeg;
  const posWeight = totalPos;
  const balance = (posWeight - negWeight) / totalMatches;
  
  // Map balance (-1 to +1) to mood (1-5)
  // balance = -1 → mood = 1
  // balance = 0  → mood = 3
  // balance = +1 → mood = 5
  let mood = 3 + balance * 2;
  
  // Apply punctuation modifier
  mood += getPunctuationSignal(trimmedText);
  
  // Clamp to valid range
  mood = Math.max(1, Math.min(5, Math.round(mood)));
  
  // Confidence based on total matches
  const confidence = Math.min(0.3 + totalMatches * 0.1, 0.8);
  
  return { mood, confidence, source: 'local' };
}

// ============ INHERITED MOOD (FROM DISCUSSIONS / ENTRIES) ============

/**
 * Get mood from the last discussion message (if recent enough)
 */
export async function getLastDiscussionMood(): Promise<InheritedMoodContext | null> {
  try {
    // Get the most recent discussion session
    const sessions = await db.discussionSessions
      .orderBy('lastMessageAt')
      .reverse()
      .limit(1)
      .toArray();
    
    if (sessions.length === 0) return null;
    
    const session = sessions[0];
    const now = Date.now();
    
    // Check decay
    if (now - session.lastMessageAt > MOOD_DECAY_MS) return null;
    
    // Get last assistant message to analyze
    const messages = await db.discussionMessages
      .where('sessionId')
      .equals(session.id!)
      .filter(m => m.role === 'assistant')
      .reverse()
      .limit(1)
      .toArray();
    
    if (messages.length === 0) return null;
    
    const lastMessage = messages[0];
    
    // Analyze the assistant's response for mood indicators
    const sentiment = analyzeSentimentLocal(lastMessage.content);
    
    return {
      mood: sentiment.mood,
      timestamp: lastMessage.createdAt,
      source: 'discussion',
      confidence: sentiment.confidence > 0.5 ? 'medium' : 'low',
    };
  } catch (e) {
    console.warn('Failed to get discussion mood:', e);
    return null;
  }
}

/**
 * Get mood from the last entry of today
 */
export async function getLastEntryMood(): Promise<InheritedMoodContext | null> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const now = Date.now();
    
    const entries = await db.entries
      .where('date')
      .equals(today)
      .reverse()
      .sortBy('createdAt');
    
    if (entries.length === 0) return null;
    
    const lastEntry = entries[0];
    
    // Check decay
    if (now - lastEntry.updatedAt > MOOD_DECAY_MS) return null;
    
    return {
      mood: lastEntry.mood,
      timestamp: lastEntry.updatedAt,
      source: 'entry',
      confidence: 'high', // User-set mood is reliable
    };
  } catch (e) {
    console.warn('Failed to get entry mood:', e);
    return null;
  }
}

/**
 * Get inherited mood from recent context (discussion or entry)
 * Respects 4-hour decay window
 */
export async function getInheritedMood(): Promise<InheritedMoodContext | null> {
  // Priority: Last entry (user-set) > Last discussion (inferred)
  const entryMood = await getLastEntryMood();
  if (entryMood) return entryMood;
  
  const discussionMood = await getLastDiscussionMood();
  if (discussionMood) return discussionMood;
  
  return null;
}
