import { getAIToken } from './aiTokenService';

/**
 * Shared AI utilities — single source of truth for token headers,
 * error messages, and SSE stream parsing used across aiService,
 * biographyService, and imageAnalysisService.
 */

// Get AI token header (returns empty object if no valid token)
export function getAITokenHeader(): Record<string, string> {
  const tokenData = getAIToken();
  if (tokenData?.token) {
    return { 'X-AI-Token': tokenData.token };
  }
  return {};
}

// Parse AI HTTP error status into a localized user-facing message
export function parseAIError(status: number, language: 'ru' | 'en' = 'ru'): string {
  const messages: Record<number, { ru: string; en: string }> = {
    401: { ru: 'Ошибка авторизации сервиса', en: 'Service authorization error' },
    402: { ru: 'Требуется оплата сервиса', en: 'Payment required' },
    403: { ru: 'Доступ запрещён', en: 'Access denied' },
    429: { ru: 'Слишком много запросов. Подождите немного.', en: 'Too many requests. Please wait.' },
    500: { ru: 'Сервер временно недоступен', en: 'Server temporarily unavailable' },
    502: { ru: 'Сервер временно недоступен', en: 'Server temporarily unavailable' },
    503: { ru: 'Сервер временно недоступен', en: 'Server temporarily unavailable' },
  };

  const msg = messages[status];
  if (msg) return msg[language];

  return language === 'ru'
    ? `Ошибка сервиса: ${status}`
    : `Service error: ${status}`;
}

/**
 * Collect a full text response from an OpenAI-compatible SSE stream.
 * Optionally calls `onToken` for each chunk (used by streaming chat).
 */
export async function collectSSEStream(
  response: Response,
  onToken?: (token: string) => void,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      let line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);

      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.startsWith(':') || line.trim() === '') continue;
      if (!line.startsWith('data: ')) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') continue;

      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          fullText += content;
          onToken?.(content);
        }
      } catch {
        // Incomplete JSON chunk — skip
      }
    }
  }

  return fullText;
}
