// Sentiment Analysis Service - Local keyword-based + AI fallback
// Predictive Mood Tracking for Cyber-Grimoire (v2)

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

// Confidence threshold for suggestions (raised from 0.15 to reduce false positives)
const LOCAL_CONFIDENCE_THRESHOLD = 0.5;

// High confidence threshold for instant hints
const INSTANT_HINT_THRESHOLD = 0.6;

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

// Russian keyword sentiment with weights (without diacritics for broader matching)
// Higher weight = stronger signal
const RU_NEGATIVE_KEYWORDS: Array<[string, number]> = [
  // Very negative (weight 2)
  ['ужас', 2], ['кошмар', 2], ['провал', 2], ['катастроф', 2], ['смерт', 2],
  ['ненавижу', 2], ['отврат', 2], ['мерз', 2], ['гадост', 2],
  // Negative (weight 1)
  ['плох', 1], ['тяжел', 1], ['трудн', 1], ['сложн', 1], ['проблем', 1],
  ['устал', 1], ['измотан', 1], ['выжат', 1], ['разбит', 1], ['болит', 1],
  ['грустн', 1], ['печал', 1], ['тоск', 1], ['скуч', 1], ['одинок', 1],
  ['злит', 1], ['бесит', 1], ['раздраж', 1], ['нервн', 1], ['стресс', 1],
  ['тревог', 1], ['страх', 1], ['боюсь', 1], ['разочар', 1], ['обид', 1],
];

const RU_POSITIVE_KEYWORDS: Array<[string, number]> = [
  // Very positive (weight 2)
  ['отлично', 2], ['прекрасн', 2], ['замечательн', 2], ['великолепн', 2],
  ['счастлив', 2], ['счасть', 2], ['радост', 2], ['восторг', 2], ['эйфор', 2],
  ['офигенн', 2], ['круто', 2], ['топ', 2], ['бомба', 2], ['победа', 2], ['успех', 2],
  // Positive (weight 1)
  ['хорош', 1], ['норм', 1], ['неплох', 1], ['нравит', 1], ['люблю', 1],
  ['рад', 1], ['довол', 1], ['спокойн', 1], ['уютн', 1], ['тепл', 1],
  ['приятн', 1], ['интересн', 1], ['весел', 1], ['смеш', 1], ['забавн', 1],
  ['продуктивн', 1], ['эффективн', 1], ['справил', 1], ['получил', 1],
  ['сделал', 1], ['закончил', 1], ['достиг', 1], ['решил', 1], ['помог', 1],
];

const EN_NEGATIVE_KEYWORDS: Array<[string, number]> = [
  // Very negative (weight 2)
  ['terrible', 2], ['awful', 2], ['horrible', 2], ['disaster', 2], ['nightmare', 2],
  ['hate', 2], ['disgusting', 2], ['worst', 2], ['failed', 2],
  // Negative (weight 1)
  ['bad', 1], ['hard', 1], ['difficult', 1], ['problem', 1], ['issue', 1],
  ['tired', 1], ['exhausted', 1], ['drained', 1], ['pain', 1], ['hurt', 1],
  ['sad', 1], ['upset', 1], ['down', 1], ['lonely', 1], ['angry', 1],
  ['frustrated', 1], ['annoyed', 1], ['stressed', 1], ['anxious', 1],
  ['worried', 1], ['scared', 1], ['disappointed', 1], ['struggle', 1],
];

const EN_POSITIVE_KEYWORDS: Array<[string, number]> = [
  // Very positive (weight 2)
  ['excellent', 2], ['amazing', 2], ['wonderful', 2], ['fantastic', 2],
  ['perfect', 2], ['incredible', 2], ['happy', 2], ['joy', 2], ['thrilled', 2],
  ['awesome', 2], ['great', 2], ['love', 2], ['best', 2], ['success', 2],
  // Positive (weight 1)
  ['good', 1], ['nice', 1], ['fine', 1], ['okay', 1], ['pleasant', 1],
  ['enjoy', 1], ['like', 1], ['glad', 1], ['satisfied', 1], ['calm', 1],
  ['peaceful', 1], ['relaxed', 1], ['comfortable', 1], ['fun', 1],
  ['interesting', 1], ['productive', 1], ['done', 1], ['finished', 1],
  ['grateful', 1], ['thankful', 1], ['blessed', 1], ['lucky', 1],
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

// Count keyword matches with weights
function countWeightedKeywordMatches(text: string, keywords: Array<[string, number]>): { count: number; weight: number } {
  const lowerText = text.toLowerCase();
  let count = 0;
  let weight = 0;
  
  for (const [keyword, w] of keywords) {
    if (lowerText.includes(keyword)) {
      count++;
      weight += w;
    }
  }
  
  return { count, weight };
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
    const emojiConfidence = Math.min(0.4 + emojiResult.count * 0.15, 0.9);
    return { 
      mood: Math.max(1, Math.min(5, avgEmojiMood)), 
      confidence: emojiConfidence, 
      source: 'local' 
    };
  }
  
  // 2. Weighted keyword analysis
  const ruNeg = countWeightedKeywordMatches(trimmedText, RU_NEGATIVE_KEYWORDS);
  const ruPos = countWeightedKeywordMatches(trimmedText, RU_POSITIVE_KEYWORDS);
  const enNeg = countWeightedKeywordMatches(trimmedText, EN_NEGATIVE_KEYWORDS);
  const enPos = countWeightedKeywordMatches(trimmedText, EN_POSITIVE_KEYWORDS);
  
  const totalNegWeight = ruNeg.weight + enNeg.weight;
  const totalPosWeight = ruPos.weight + enPos.weight;
  const totalWeight = totalNegWeight + totalPosWeight;
  const totalCount = ruNeg.count + ruPos.count + enNeg.count + enPos.count;
  
  if (totalWeight === 0) {
    // No keywords found, check punctuation
    const punctSignal = getPunctuationSignal(trimmedText);
    return { 
      mood: 3 + Math.round(punctSignal), 
      confidence: 0.1, 
      source: 'local' 
    };
  }
  
  // Calculate weighted mood score
  const balance = (totalPosWeight - totalNegWeight) / totalWeight;
  
  // Map balance (-1 to +1) to mood (1-5)
  let mood = 3 + balance * 2;
  
  // Apply punctuation modifier
  mood += getPunctuationSignal(trimmedText);
  
  // Clamp to valid range
  mood = Math.max(1, Math.min(5, Math.round(mood)));
  
  // Confidence based on total weighted matches (higher weights = more confident)
  const confidence = Math.min(0.3 + totalWeight * 0.1 + totalCount * 0.05, 0.85);
  
  return { mood, confidence, source: 'local' };
}

/**
 * Get instant mood hint for very high confidence cases only
 * Used for immediate UI feedback before full analysis
 */
export function getInstantMoodHint(text: string): number | null {
  const result = analyzeSentimentLocal(text);
  // Only return hint if very confident
  return result.confidence >= INSTANT_HINT_THRESHOLD ? result.mood : null;
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
