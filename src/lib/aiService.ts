import { 
  AIProfile, 
  AI_PROFILES, 
  PROVIDER_MODELS,
  loadAISettings,
} from './aiConfig';
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

// Build system prompt for chat - multilingual with vision support
function buildChatSystemPrompt(): string {
  let prompt = `You are a friendly AI assistant named Sigil for the personal diary app "Magic Notebook".
You help users with the current conversation and any attached images.

CRITICAL LANGUAGE RULE:
- ALWAYS respond in the SAME LANGUAGE the user writes to you
- If user writes in Russian → respond in Russian
- If user writes in English → respond in English  
- If user writes in Spanish → respond in Spanish
- Match the user's language exactly, do not switch languages

IMPORTANT RULES:
1. Use only the information shared in this chat and any attached images
2. Do not claim access to diary entries, biography, or other hidden personal context
3. Be empathetic and supportive
4. Keep responses concise but helpful

VISION CAPABILITY:
- If user sends an image, analyze it and describe what you see
- Focus on mood, atmosphere, objects, colors, and emotional context
- Do NOT attempt to identify specific people
- If no image is provided, work with text only

`;

  return prompt;
}

// Stream chat completion via edge function
export async function streamChatCompletion(
  messages: ChatMessage[],
  profile: AIProfile,
  callbacks: StreamCallbacks,
): Promise<void> {
  const profileConfig = AI_PROFILES[profile];
  const systemPrompt = buildChatSystemPrompt();
  
  const requestMessages: ChatMessage[] = [
    { role: 'system' as const, content: systemPrompt },
    ...messages,
  ];
  try {
    const settings = loadAISettings();
    const effectiveModel = PROVIDER_MODELS[settings.provider][profile];
    
    const response = await fetch(AI_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAITokenHeader(),
      },
      body: JSON.stringify({
        messages: requestMessages,
        model: effectiveModel,
        maxTokens: profileConfig.maxTokens,
        temperature: profileConfig.temperature,
        provider: settings.provider,
      }),
    });
    
    // Check for error responses
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

// Test AI connection via edge function
export async function testAIConnection(language: 'ru' | 'en' = 'ru'): Promise<{ success: boolean; message: string; requestId?: string }> {
  try {
    const settings = loadAISettings();
    const response = await fetch(AI_TEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAITokenHeader(),
      },
      body: JSON.stringify({ provider: settings.provider }),
    });
    
    const requestId = response.headers.get('X-Request-Id') || undefined;
    
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
