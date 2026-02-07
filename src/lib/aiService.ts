import { db } from './db';
import { 
  AIProfile, 
  AI_PROFILES, 
  loadAISettings,
} from './aiConfig';
import { isAITokenValid } from './aiTokenService';
import { 
  createAIAuthError, 
  requestPinDialog,
  getErrorMessage,
  AIAuthRetryError,
} from './aiAuthRecovery';
import { getAITokenHeader, parseAIError, collectSSEStream } from './aiUtils';

// Edge function URLs - all AI goes through server
const AI_CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;
const AI_TEST_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-test`;

// Types for AI chat - supports multimodal
export type MessageContentPart = 
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | MessageContentPart[];
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (fullResponse: string) => void;
  onError: (error: Error) => void;
}

// Paraphrase text to avoid verbatim quotes (used for chat context only)
function paraphraseText(text: string): string {
  if (!text || text.length < 20) {
    return 'Краткая запись без деталей.';
  }
  
  const words = text.toLowerCase().split(/\s+/);
  const themes: string[] = [];
  
  const themeKeywords = {
    'работа': ['работа', 'офис', 'проект', 'задача', 'встреча', 'коллега'],
    'семья': ['семья', 'дом', 'родители', 'дети', 'муж', 'жена'],
    'здоровье': ['здоровье', 'спорт', 'врач', 'самочувствие', 'усталость'],
    'отдых': ['отдых', 'выходные', 'прогулка', 'фильм', 'книга'],
    'эмоции': ['радость', 'грусть', 'волнение', 'спокойствие', 'стресс'],
  };
  
  for (const [theme, keywords] of Object.entries(themeKeywords)) {
    if (keywords.some(kw => words.some(w => w.includes(kw)))) {
      themes.push(theme);
    }
  }
  
  if (themes.length === 0) {
    return `Запись содержит ${text.length > 200 ? 'подробные' : 'краткие'} размышления.`;
  }
  
  return `Запись затрагивает темы: ${themes.join(', ')}.`;
}

// Prepare entry context with paraphrasing (for chat, not biography)
function prepareEntryContext(entry: { date: string; mood: number; tags: string[]; text: string }, strictPrivacy: boolean): string {
  const date = new Date(entry.date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  
  const moodLabels = ['очень плохое', 'плохое', 'нормальное', 'хорошее', 'отличное'];
  const mood = moodLabels[entry.mood - 1] || 'неизвестное';
  
  const tags = entry.tags.length > 0 ? entry.tags.join(', ') : 'без тегов';
  
  let content: string;
  if (strictPrivacy) {
    content = paraphraseText(entry.text);
  } else {
    content = entry.text.length > 100 
      ? entry.text.substring(0, 100) + '...' 
      : entry.text;
  }
  
  return `[${date}] Настроение: ${mood}. Теги: ${tags}. ${content}`;
}

// Retrieve relevant entries for chat context
export async function retrieveRelevantEntries(
  query: string,
  limit: number = 5,
  strictPrivacy: boolean = true
): Promise<string[]> {
  const settings = loadAISettings();
  const effectiveStrictPrivacy = strictPrivacy || settings.strictPrivacy;
  
  const allEntries = await db.entries
    .filter(entry => !entry.isPrivate && entry.aiAllowed !== false)
    .toArray();
  
  if (allEntries.length === 0) {
    return [];
  }
  
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  
  const scored = allEntries.map(entry => {
    let score = 0;
    const entryText = (entry.text + ' ' + entry.tags.join(' ')).toLowerCase();
    
    for (const word of queryWords) {
      if (entryText.includes(word)) {
        score += 1;
      }
    }
    
    const daysSinceEntry = (Date.now() - entry.createdAt) / (1000 * 60 * 60 * 24);
    if (daysSinceEntry < 7) score += 0.5;
    if (daysSinceEntry < 1) score += 0.5;
    
    return { entry, score };
  });
  
  scored.sort((a, b) => b.score - a.score);
  const relevant = scored.slice(0, limit).filter(s => s.score > 0);
  
  if (relevant.length === 0) {
    const recent = allEntries
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, Math.min(3, limit));
    return recent.map(e => prepareEntryContext(e, effectiveStrictPrivacy));
  }
  
  return relevant.map(r => prepareEntryContext(r.entry, effectiveStrictPrivacy));
}

// Build system prompt for chat - multilingual with vision support
function buildChatSystemPrompt(contexts: string[]): string {
  let prompt = `You are a friendly AI assistant named Sigil for the personal diary app "Magic Notebook".
You help users analyze their entries, find patterns, and give recommendations.

CRITICAL LANGUAGE RULE:
- ALWAYS respond in the SAME LANGUAGE the user writes to you
- If user writes in Russian → respond in Russian
- If user writes in English → respond in English  
- If user writes in Spanish → respond in Spanish
- Match the user's language exactly, do not switch languages

IMPORTANT RULES:
1. NEVER quote diary entries verbatim — only paraphrase and summarize
2. Do not reveal personal details directly
3. Talk about themes and patterns, not specific content
4. Be empathetic and supportive
5. Keep responses concise but helpful

VISION CAPABILITY:
- If user sends an image, analyze it and describe what you see
- Focus on mood, atmosphere, objects, colors, and emotional context
- Do NOT attempt to identify specific people
- If no image is provided, work with text only

`;
  
  if (contexts.length > 0) {
    prompt += `DIARY CONTEXT (summarized):\n${contexts.join('\n')}\n\n`;
  } else {
    prompt += `No diary entries available for analysis yet.\n\n`;
  }
  
  return prompt;
}

// parseAIError is now imported from ./aiUtils

// Stream chat completion via edge function (with auto-PIN retry)
export async function streamChatCompletion(
  messages: ChatMessage[],
  profile: AIProfile,
  callbacks: StreamCallbacks,
  _isRetry: boolean = false
): Promise<void> {
  const profileConfig = AI_PROFILES[profile];
  const settings = loadAISettings();
  
  // Check token before making request (only on first attempt)
  if (!_isRetry && !isAITokenValid()) {
    // Try to get a PIN first
    try {
      await requestPinDialog(undefined, 'ai_token_required');
    } catch {
      callbacks.onError(new AIAuthRetryError('ai_token_required', undefined, false, 'Authorization cancelled'));
      return;
    }
  }
  
  // Extract text from last user message for context retrieval
  const lastUserMessage = messages.filter(m => m.role === 'user').pop();
  let queryText = '';
  if (lastUserMessage) {
    if (typeof lastUserMessage.content === 'string') {
      queryText = lastUserMessage.content;
    } else if (Array.isArray(lastUserMessage.content)) {
      const textPart = lastUserMessage.content.find(p => p.type === 'text');
      queryText = textPart?.type === 'text' ? textPart.text : '';
    }
  }
  
  const contexts = queryText 
    ? await retrieveRelevantEntries(queryText, 5, settings.strictPrivacy)
    : [];
  
  const systemPrompt = buildChatSystemPrompt(contexts);
  
  const requestMessages: ChatMessage[] = [
    { role: 'system' as const, content: systemPrompt },
    ...messages,
  ];
  try {
    const response = await fetch(AI_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAITokenHeader(),
      },
      body: JSON.stringify({
        messages: requestMessages,
        model: profileConfig.model,
        maxTokens: profileConfig.maxTokens,
        temperature: profileConfig.temperature,
      }),
    });
    
    // Handle 401 with auto-retry
    if (response.status === 401 && !_isRetry) {
      const errorData = await createAIAuthError(response);
      if (errorData.isRetryable) {
        try {
          await requestPinDialog(errorData.requestId, errorData.errorCode);
          // Retry once after successful PIN
          return streamChatCompletion(messages, profile, callbacks, true);
        } catch {
          callbacks.onError(new Error('Authorization cancelled'));
          return;
        }
      }
      throw errorData;
    }
    
    // Check for other error responses
    if (!response.ok) {
      const errorMessage = parseAIError(response.status, 'ru');
      throw new Error(errorMessage);
    }
    
    if (!response.body) {
      throw new Error('Нет ответа от сервера');
    }
    
    const fullResponse = await collectSSEStream(response, callbacks.onToken);
    callbacks.onComplete(fullResponse);
  } catch (error) {
    callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }
}

// Test AI connection via edge function (with auto-PIN retry)
export async function testAIConnection(language: 'ru' | 'en' = 'ru'): Promise<{ success: boolean; message: string; requestId?: string }> {
  // Check token before making request
  if (!isAITokenValid()) {
    // Try to get a PIN first
    try {
      await requestPinDialog(undefined, 'ai_token_required');
    } catch {
      return {
        success: false,
        message: getErrorMessage('pin_cancelled', language),
      };
    }
  }
  
  try {
    const response = await fetch(AI_TEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAITokenHeader(),
      },
    });
    
    const requestId = response.headers.get('X-Request-Id') || undefined;
    
    // Handle 401 with auto-retry
    if (response.status === 401) {
      const errorData = await createAIAuthError(response);
      if (errorData.isRetryable) {
        try {
          await requestPinDialog(errorData.requestId, errorData.errorCode);
          // Retry once after successful PIN
          return testAIConnection(language);
        } catch {
          return {
            success: false,
            message: getErrorMessage('pin_cancelled', language),
            requestId: errorData.requestId,
          };
        }
      }
      return {
        success: false,
        message: getErrorMessage(errorData.errorCode, language),
        requestId: errorData.requestId,
      };
    }
    
    const data = await response.json();
    
    if (data.success) {
      return {
        success: true,
        message: language === 'ru' ? 'Соединение установлено' : 'Connection established',
        requestId,
      };
    } else {
      return {
        success: false,
        message: data.error || (language === 'ru' ? 'Ошибка соединения' : 'Connection error'),
        requestId: requestId || data.requestId,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `${language === 'ru' ? 'Сетевая ошибка' : 'Network error'}: ${error instanceof Error ? error.message : (language === 'ru' ? 'Неизвестная ошибка' : 'Unknown error')}`,
    };
  }
}
