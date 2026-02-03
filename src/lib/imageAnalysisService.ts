import { compressImage } from './mediaUtils';
import { getModelForProfile, loadAISettings } from './aiConfig';
import { saveAttachmentInsight, getAttachmentInsight, AttachmentInsight } from './db';
import { getAIToken, isAITokenValid } from './aiTokenService';
import { 
  createAIAuthError, 
  requestPinDialog,
  getErrorMessage,
} from './aiAuthRecovery';

const AI_CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;
const PROMPT_VERSION = 'v1.0';

// Get AI token header (returns empty object if no valid token)
function getAITokenHeader(): Record<string, string> {
  const tokenData = getAIToken();
  if (tokenData?.token) {
    return { 'X-AI-Token': tokenData.token };
  }
  return {};
}

export interface ImageAnalysisResult {
  description: string;
  emotions: string[];
  tags: string[];
  reflection: string;
}

export interface AnalysisCallbacks {
  onStart?: () => void;
  onComplete: (result: ImageAnalysisResult) => void;
  onError: (error: Error) => void;
}

// System prompt for image analysis (privacy-focused)
// Accepts Language type from i18n
const getSystemPrompt = (language: string): string => {
  const baseLang = language === 'ru' ? 'ru' : 'en';
  if (baseLang === 'ru') {
    return `Ты Сигил — ассистент дневника «Магический блокнот». 
Анализируй фото в контексте личного дневника.
СТРОГИЕ ПРАВИЛА:
- НЕ пытайся идентифицировать людей
- НЕ делай предположений о расе, возрасте, поле
- Фокусируйся на настроении, обстановке, деталях
- Отвечай кратко и уважительно`;
  }
  return `You are Sigil — the Magic Notebook diary assistant.
Analyze photos in a personal diary context.
STRICT RULES:
- Do NOT try to identify people
- Do NOT make assumptions about race, age, gender
- Focus on mood, setting, details
- Keep responses brief and respectful`;
};

const getAnalysisPrompt = (language: string): string => {
  const baseLang = language === 'ru' ? 'ru' : 'en';
  if (baseLang === 'ru') {
    return `Проанализируй это фото для дневника. Ответь в формате:

ОПИСАНИЕ: (1-2 предложения о том, что на фото)
ЭМОЦИИ: (2-4 эмоции/настроения через запятую)
ТЕГИ: (3-6 тегов через запятую, без #)
РЕФЛЕКСИЯ: (один вопрос для размышления о этом моменте)

Будь кратким. Не идентифицируй людей.`;
  }
  return `Analyze this photo for a diary. Respond in format:

DESCRIPTION: (1-2 sentences about what's in the photo)
EMOTIONS: (2-4 emotions/moods, comma-separated)
TAGS: (3-6 tags, comma-separated, no #)
REFLECTION: (one reflection question about this moment)

Be brief. Do not identify people.`;
};

function parseAnalysisResponse(text: string, language: string): ImageAnalysisResult {
  const baseLang = language === 'ru' ? 'ru' : 'en';
  const lines = text.split('\n').filter(l => l.trim());
  
  const descKey = baseLang === 'ru' ? 'ОПИСАНИЕ' : 'DESCRIPTION';
  const emotKey = language === 'ru' ? 'ЭМОЦИИ' : 'EMOTIONS';
  const tagsKey = language === 'ru' ? 'ТЕГИ' : 'TAGS';
  const reflKey = language === 'ru' ? 'РЕФЛЕКСИЯ' : 'REFLECTION';
  
  let description = '';
  let emotions: string[] = [];
  let tags: string[] = [];
  let reflection = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${descKey}:`)) {
      description = trimmed.substring(descKey.length + 1).trim();
    } else if (trimmed.startsWith(`${emotKey}:`)) {
      emotions = trimmed.substring(emotKey.length + 1).split(',').map(e => e.trim()).filter(Boolean);
    } else if (trimmed.startsWith(`${tagsKey}:`)) {
      tags = trimmed.substring(tagsKey.length + 1).split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean);
    } else if (trimmed.startsWith(`${reflKey}:`)) {
      reflection = trimmed.substring(reflKey.length + 1).trim();
    }
  }
  
  // Fallback if parsing fails
  if (!description && !emotions.length && !tags.length) {
    return {
      description: text.substring(0, 200),
      emotions: [],
      tags: [],
      reflection: '',
    };
  }
  
  return { description, emotions, tags, reflection };
}

export async function analyzeImage(
  imageBlob: Blob,
  attachmentId: number,
  language: string,
  callbacks: AnalysisCallbacks,
  _isRetry: boolean = false
): Promise<void> {
  callbacks.onStart?.();
  
  try {
    // Check token before making request (only on first attempt)
    if (!_isRetry && !isAITokenValid()) {
      // Try to get a PIN first
      try {
        await requestPinDialog(undefined, 'ai_token_required');
      } catch {
        throw new Error(getErrorMessage('pin_cancelled', language));
      }
    }
    
    // Check if we already have an insight
    const existing = await getAttachmentInsight(attachmentId);
    if (existing) {
      callbacks.onComplete(existing.result);
      return;
    }
    
    // Compress image to ~500KB for faster upload
    const compressedBlob = await compressImage(imageBlob);
    
    // Convert to base64 data URL
    const base64 = await blobToBase64(compressedBlob);
    
    // Get model from settings
    const settings = loadAISettings();
    const model = getModelForProfile(settings.chatProfile);
    
    // Build multimodal message
    const messages = [
      {
        role: 'system',
        content: getSystemPrompt(language),
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: getAnalysisPrompt(language) },
          { type: 'image_url', image_url: { url: base64 } },
        ],
      },
    ];
    
    const response = await fetch(AI_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAITokenHeader(),
      },
      body: JSON.stringify({
        messages,
        model,
        maxTokens: 512,
        temperature: 0.7,
      }),
    });
    
    // Handle 401 with auto-retry
    if (response.status === 401 && !_isRetry) {
      const errorData = await createAIAuthError(response);
      if (errorData.isRetryable) {
        try {
          await requestPinDialog(errorData.requestId, errorData.errorCode);
          // Retry once after successful PIN
          return analyzeImage(imageBlob, attachmentId, language, callbacks, true);
        } catch {
          throw new Error(getErrorMessage('pin_cancelled', language));
        }
      }
      throw new Error(getErrorMessage(errorData.errorCode, language));
    }
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Analysis failed: ${response.status}`);
    }
    
    // Parse SSE stream to collect full response
    const fullText = await collectStreamResponse(response);
    
    // Parse the response
    const result = parseAnalysisResponse(fullText, language);
    
    // Save insight to IndexedDB
    const insight: AttachmentInsight = {
      attachmentId,
      createdAt: Date.now(),
      model,
      promptVersion: PROMPT_VERSION,
      result,
    };
    await saveAttachmentInsight(insight);
    
    callbacks.onComplete(result);
  } catch (error) {
    console.error('Image analysis failed:', error);
    callbacks.onError(error instanceof Error ? error : new Error('Analysis failed'));
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read blob'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function collectStreamResponse(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');
  
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    
    // Process complete lines
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      let line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.startsWith(':') || line.trim() === '') continue;
      if (!line.startsWith('data: ')) continue;
      
      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') break;
      
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) fullText += content;
      } catch {
        // Ignore parse errors
      }
    }
  }
  
  return fullText;
}

// Check if insight exists
export async function hasInsight(attachmentId: number): Promise<boolean> {
  const insight = await getAttachmentInsight(attachmentId);
  return !!insight;
}

// Get cached insight
export async function getCachedInsight(attachmentId: number): Promise<ImageAnalysisResult | null> {
  const insight = await getAttachmentInsight(attachmentId);
  return insight?.result || null;
}
