import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// CORS configuration - allow known origins
const ALLOWED_ORIGINS = [
  "https://local-heart-diary.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://127.0.0.1:5173",
];
const LOVABLE_PREVIEW_PATTERN = /^https:\/\/[a-z0-9-]+\.lovable\.app$/;
const LOVABLE_PROJECT_PATTERN = /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/;

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (LOVABLE_PREVIEW_PATTERN.test(origin)) return true;
  if (LOVABLE_PROJECT_PATTERN.test(origin)) return true;
  return false;
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ai-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// AI Token validation
async function validateAIToken(token: string | null, requestId: string): Promise<{ valid: boolean; error?: string }> {
  if (!token) {
    return { valid: false, error: "ai_token_required" };
  }

  const AI_TOKEN_SECRET = Deno.env.get("AI_TOKEN_SECRET");
  if (!AI_TOKEN_SECRET) {
    console.error({ requestId, action: "token_validation_error", error: "AI_TOKEN_SECRET not configured" });
    return { valid: false, error: "service_not_configured" };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, error: "invalid_token_format" };
  }

  const [payloadBase64, signatureBase64] = parts;

  try {
    // Verify HMAC signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(AI_TOKEN_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureBytes = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      encoder.encode(payloadBase64)
    );

    if (!isValid) {
      return { valid: false, error: "invalid_token_signature" };
    }

    // Decode and check expiry
    const payload = JSON.parse(atob(payloadBase64));
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) {
      return { valid: false, error: "token_expired" };
    }

    return { valid: true };
  } catch (e) {
    console.error({ requestId, action: "token_validation_error", error: String(e) });
    return { valid: false, error: "invalid_token" };
  }
}

// Validation constants
const MAX_ITEMS = 50;
const MAX_THEMES_PER_ITEM = 10;
const MAX_THEME_LENGTH = 100;
const MAX_TAG_LENGTH = 50;
const MAX_TOKENS_LIMIT = 4096;
const ALLOWED_MODELS = [
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "google/gemini-2.5-pro",
  "google/gemini-3-flash-preview",
];

// Input types
interface BiographyItem {
  timeLabel: string;    // "утро", "день", "вечер", "ночь" or "morning", etc.
  mood: number;         // 1-5
  themes: string[];     // extracted topic keywords (NOT raw text)
  tags: string[];       // user tags
  attachmentCount: number;
}

interface BiographyRequest {
  model?: string;
  items: BiographyItem[];
  language: "ru" | "en";
  date: string;         // YYYY-MM-DD for context
  maxTokens?: number;
  temperature?: number;
}

// Output types
interface BiographyResponse {
  title: string;
  narrative: string;
  highlights: string[];
  timeline: { timeLabel: string; summary: string }[];
  meta: { 
    model: string; 
    tokens?: number; 
    requestId: string;
    style: string;
    confidence: "low" | "medium" | "high";
  };
}

// Validation functions
function validateItems(items: unknown): { valid: boolean; error?: string } {
  if (!Array.isArray(items)) {
    return { valid: false, error: "items must be an array" };
  }
  if (items.length === 0) {
    return { valid: false, error: "items array cannot be empty" };
  }
  if (items.length > MAX_ITEMS) {
    return { valid: false, error: `items array cannot exceed ${MAX_ITEMS} items` };
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== "object") {
      return { valid: false, error: `items[${i}] must be an object` };
    }

    const { timeLabel, mood, themes, tags, attachmentCount } = item as BiographyItem;

    if (typeof timeLabel !== "string" || timeLabel.length > 20) {
      return { valid: false, error: `items[${i}].timeLabel must be a string (max 20 chars)` };
    }

    if (typeof mood !== "number" || mood < 1 || mood > 5) {
      return { valid: false, error: `items[${i}].mood must be a number between 1 and 5` };
    }

    if (!Array.isArray(themes)) {
      return { valid: false, error: `items[${i}].themes must be an array` };
    }
    if (themes.length > MAX_THEMES_PER_ITEM) {
      return { valid: false, error: `items[${i}].themes cannot exceed ${MAX_THEMES_PER_ITEM} items` };
    }
    for (const theme of themes) {
      if (typeof theme !== "string" || theme.length > MAX_THEME_LENGTH) {
        return { valid: false, error: `items[${i}].themes must contain strings (max ${MAX_THEME_LENGTH} chars)` };
      }
    }

    if (!Array.isArray(tags)) {
      return { valid: false, error: `items[${i}].tags must be an array` };
    }
    for (const tag of tags) {
      if (typeof tag !== "string" || tag.length > MAX_TAG_LENGTH) {
        return { valid: false, error: `items[${i}].tags must contain strings (max ${MAX_TAG_LENGTH} chars)` };
      }
    }

    if (typeof attachmentCount !== "number" || attachmentCount < 0) {
      return { valid: false, error: `items[${i}].attachmentCount must be a non-negative number` };
    }
  }

  return { valid: true };
}

function validateLanguage(lang: unknown): { valid: boolean; error?: string } {
  if (lang !== "ru" && lang !== "en") {
    return { valid: false, error: 'language must be "ru" or "en"' };
  }
  return { valid: true };
}

function validateModel(model: unknown): { valid: boolean; error?: string } {
  if (model === undefined || model === null) {
    return { valid: true };
  }
  if (typeof model !== "string") {
    return { valid: false, error: "model must be a string" };
  }
  // Allow both new google/ models and legacy models (will be mapped)
  const allAllowed = [...ALLOWED_MODELS, "gpt-3.5-turbo", "gpt-4o-mini", "gpt-4o", "gpt-4"];
  if (!allAllowed.includes(model)) {
    return { valid: false, error: `model must be one of: ${ALLOWED_MODELS.join(", ")}` };
  }
  return { valid: true };
}

// Calculate confidence based on item count
function getConfidence(itemCount: number): "low" | "medium" | "high" {
  if (itemCount === 0) return "low";
  if (itemCount <= 2) return "medium";
  return "high";
}

// Build the biography prompt from preprocessed items (Daybook Biography v1 - Privacy-Safe)
function buildBiographyPrompt(
  items: BiographyItem[],
  date: string,
  language: "ru" | "en"
): string {
  // Format date for display
  const dateObj = new Date(date);
  const formattedDate = dateObj.toLocaleDateString(
    language === "ru" ? "ru-RU" : "en-US",
    { day: "numeric", month: "long", year: "numeric", weekday: "long" }
  );

  // Get unique timeLabels from input (preserve order)
  const timeLabels = [...new Set(items.map((i) => i.timeLabel))];

  // Build context block from items
  let contextBlock = "";
  for (const item of items) {
    contextBlock += `\n- ${item.timeLabel}: настроение ${item.mood}/5`;
    if (item.themes.length) contextBlock += `, темы: [${item.themes.join(", ")}]`;
    if (item.tags.length) contextBlock += `, теги: [${item.tags.join(", ")}]`;
    if (item.attachmentCount > 0) contextBlock += `, медиа: ${item.attachmentCount}`;
  }

  const confidence = getConfidence(items.length);

  if (language === "ru") {
    // Handle empty items case
    if (items.length === 0) {
      return `Ты — Печать Дня для приложения Cyber-Grimoire. День ${formattedDate}.

У тебя НЕТ входных данных — за этот день нет заметок.

Верни JSON строго по этой схеме:
{
  "title": "Тихий день",
  "narrative": "Краткий текст (2-4 предложения) о том, что день прошёл без зафиксированных деталей. Без выдумок и фактов.",
  "highlights": [],
  "timeline": [],
  "meta": { "style": "daybook_biography_v2", "confidence": "low" }
}`;
    }

    return `Ты — Печать Дня для приложения Cyber-Grimoire. Твоя задача: по обобщённым темам и настроению составить художественную, но честную "биографию дня" на русском языке.

ДАТА: ${formattedDate}

ВХОДНЫЕ ДАННЫЕ:
${contextBlock}

КРИТИЧЕСКИЕ ПРАВИЛА (обязательны):
1) НИКОГДА не цитируй и не воспроизводи дословно дневниковые записи. Цитат быть не должно в принципе.
2) НИКОГДА не придумывай конкретные события, людей, места, профессии, диалоги, числа, названия, покупки, поездки и т.п.
3) Разрешены только обобщённые формулировки на уровне тем (например: "работа", "семья", "здоровье", "идеи", "отдых").
4) Если данных мало, ты не "добавляешь красок" фактами — ты пишешь честно и коротко.

ОБРАБОТКА MOOD (1–5):
- 1: тяжёлый/сложный оттенок, осторожные формулировки, поддержка.
- 2: напряжённый/неуютный, больше бережности.
- 3: нейтральный/ровный, спокойная констатация.
- 4: хороший/живой, больше энергии и ясности.
- 5: очень хороший/вдохновляющий, лёгкость и уверенность.

ATTACHMENTS:
- attachmentCount можно упомянуть только обобщённо: "были моменты, которые хотелось зафиксировать".
- Не называй "фото/видео/аудио" явно. Не придумывай содержание медиа.

СТИЛЬ ВЫВОДА (80/20):
• 80% — чёткий аналитический язык
• 20% — техно-мистическая терминология Cyber-Grimoire

ДОПУСТИМЫЕ ТЕРМИНЫ:
контур дня, печать, зафиксирована корреляция, калибровка,
ресурс (= энергия), совет Печати, протокол, сигнатура,
резонанс (= совпадение паттернов), канал (= связь)

ЗАПРЕЩЕНО:
магия, заклинания, эзотерика, духи, карты таро, астрология, мистика

ПРИМЕРЫ HIGHLIGHTS (правильный стиль):
❌ "Был на работе, устал"
✅ "Сессия с оборудованием — высокая нагрузка. Совет Печати: калибровка отдыха."
❌ "Хорошо провёл время с семьёй"
✅ "Зафиксирован резонанс с близкими — ресурс восстановлен."

Тон: тёплый, спокойный, с лёгким техно-мистическим налётом.
Язык: современный русский, без канцелярита.
Не используй эмодзи.

Верни СТРОГО валидный JSON (без markdown, без комментариев):
{
  "title": "3–7 слов, поэтичный заголовок дня без даты",
  "narrative": "${items.length <= 2 ? "3–5 предложений" : "6–12 предложений"}, художественное обобщённое описание дня с 20% техно-мистики",
  "highlights": ["3–6 пунктов — ключевые темы дня в стиле Cyber-Grimoire"${items.length === 0 ? " или [] если данных нет" : ""}],
  "timeline": [${timeLabels.map((t) => `{"timeLabel": "${t}", "summary": "1–2 предложения обобщённо"}`).join(", ")}],
  "meta": { "style": "daybook_biography_v2", "confidence": "${confidence}" }
}`;
  }

  // English version
  if (items.length === 0) {
    return `You are the Day Seal for the Cyber-Grimoire app. Date: ${formattedDate}.

You have NO input data — there are no notes for this day.

Return JSON strictly following this schema:
{
  "title": "A Quiet Day",
  "narrative": "Brief text (2-4 sentences) about the day passing without recorded details. No invented facts.",
  "highlights": [],
  "timeline": [],
  "meta": { "style": "daybook_biography_v2", "confidence": "low" }
}`;
  }

  return `You are the Day Seal for the Cyber-Grimoire app. Your task: create an artistic but honest "biography of the day" in English based on summarized themes and mood.

DATE: ${formattedDate}

INPUT DATA:
${contextBlock}

CRITICAL RULES (mandatory):
1) NEVER quote or reproduce diary entries verbatim. No quotes whatsoever.
2) NEVER invent specific events, people, places, professions, dialogues, numbers, names, purchases, trips, etc.
3) Only generalized formulations at the theme level are allowed (e.g., "work", "family", "health", "ideas", "rest").
4) If data is limited, don't "add color" with facts — write honestly and briefly.

MOOD PROCESSING (1–5):
- 1: difficult/complex tone, careful wording, supportive.
- 2: tense/uncomfortable, more gentleness.
- 3: neutral/steady, calm statement.
- 4: good/lively, more energy and clarity.
- 5: very good/inspiring, lightness and confidence.

ATTACHMENTS:
- attachmentCount can only be mentioned generally: "there were moments worth capturing".
- Don't explicitly name "photo/video/audio". Don't invent media content.

OUTPUT STYLE (80/20):
• 80% — clear analytical language
• 20% — techno-mystical Cyber-Grimoire terminology

ALLOWED TERMS:
day contour, seal, correlation logged, calibration,
resource (= energy), Seal's advice, protocol, signature,
resonance (= pattern match), channel (= connection)

FORBIDDEN:
magic, spells, esoterica, spirits, tarot, astrology, mysticism

HIGHLIGHT EXAMPLES (correct style):
❌ "Was at work, got tired"
✅ "Equipment session — high load. Seal's advice: rest calibration."
❌ "Had a good time with family"  
✅ "Resonance with close ones logged — resource restored."

Tone: warm, calm, with a subtle techno-mystical touch.
Language: modern English, no bureaucratic speak.
No emojis.

Return STRICTLY valid JSON (no markdown, no comments):
{
  "title": "3–7 words, poetic title without date",
  "narrative": "${items.length <= 2 ? "3–5 sentences" : "6–12 sentences"}, artistic generalized description with 20% techno-mystical touch",
  "highlights": ["3–6 items — key themes in Cyber-Grimoire style"${items.length === 0 ? " or [] if no data" : ""}],
  "timeline": [${timeLabels.map((t) => `{"timeLabel": "${t}", "summary": "1–2 sentences generalized"}`).join(", ")}],
  "meta": { "style": "daybook_biography_v2", "confidence": "${confidence}" }
}`;
}

serve(async (req) => {
  // Generate request ID for correlation
  const requestId = crypto.randomUUID();
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);
  
  const responseHeaders = (contentType: string = "application/json") => ({
    ...corsHeaders,
    "Content-Type": contentType,
    "X-Request-Id": requestId,
  });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { ...corsHeaders, "X-Request-Id": requestId } });
  }

  if (req.method !== "POST") {
    console.error({ requestId, action: "ai_biography_error", error: "Method not allowed" });
    return new Response(
      JSON.stringify({ error: "Method not allowed", requestId }),
      { status: 405, headers: responseHeaders() }
    );
  }

  // Validate AI token
  const aiToken = req.headers.get("X-AI-Token");
  const tokenValidation = await validateAIToken(aiToken, requestId);
  if (!tokenValidation.valid) {
    console.log({ requestId, action: "ai_biography_unauthorized", error: tokenValidation.error });
    return new Response(
      JSON.stringify({ error: tokenValidation.error, requestId }),
      { status: 401, headers: responseHeaders() }
    );
  }

  try {
    let requestBody: unknown;
    try {
      requestBody = await req.json();
    } catch {
      console.error({ requestId, action: "ai_biography_error", error: "Invalid JSON" });
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body", requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    if (!requestBody || typeof requestBody !== "object") {
      console.error({ requestId, action: "ai_biography_error", error: "Invalid request body" });
      return new Response(
        JSON.stringify({ error: "Request body must be an object", requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    const { model, items, language, date, maxTokens, temperature } = requestBody as BiographyRequest;

    // Validate items
    const itemsValidation = validateItems(items);
    if (!itemsValidation.valid) {
      console.error({ requestId, action: "ai_biography_error", error: itemsValidation.error });
      return new Response(
        JSON.stringify({ error: itemsValidation.error, requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    // Validate language
    const langValidation = validateLanguage(language);
    if (!langValidation.valid) {
      console.error({ requestId, action: "ai_biography_error", error: langValidation.error });
      return new Response(
        JSON.stringify({ error: langValidation.error, requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    // Validate model
    const modelValidation = validateModel(model);
    if (!modelValidation.valid) {
      console.error({ requestId, action: "ai_biography_error", error: modelValidation.error });
      return new Response(
        JSON.stringify({ error: modelValidation.error, requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    // Validate date
    if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      console.error({ requestId, action: "ai_biography_error", error: "Invalid date format" });
      return new Response(
        JSON.stringify({ error: "date must be in YYYY-MM-DD format", requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    // Get API key
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const OPENROUTER_API_KEY = Deno.env.get("VITE_AI_API_KEY");

    let apiUrl: string;
    let apiKey: string;
    let headers: Record<string, string>;

    if (LOVABLE_API_KEY) {
      apiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
      apiKey = LOVABLE_API_KEY;
      headers = {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
    } else if (OPENROUTER_API_KEY) {
      apiUrl = "https://openrouter.ai/api/v1/chat/completions";
      apiKey = OPENROUTER_API_KEY;
      headers = {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Daybook",
        "HTTP-Referer": "https://daybook.local",
      };
    } else {
      console.error({ requestId, action: "ai_biography_error", error: "AI service not configured" });
      return new Response(
        JSON.stringify({ error: "AI service not configured", requestId }),
        { status: 500, headers: responseHeaders() }
      );
    }

    // Map model for Lovable AI Gateway (legacy support)
    let effectiveModel = model || "google/gemini-2.5-pro";
    if (LOVABLE_API_KEY) {
      const modelMap: Record<string, string> = {
        "gpt-3.5-turbo": "google/gemini-2.5-flash-lite",
        "gpt-4o-mini": "google/gemini-2.5-flash",
        "gpt-4o": "google/gemini-2.5-pro",
        "gpt-4": "google/gemini-2.5-pro",
      };
      effectiveModel = modelMap[model || ""] || model || "google/gemini-2.5-pro";
    }

    // Build prompt
    const systemPrompt = buildBiographyPrompt(items, date, language);
    const userMessage = language === "ru" ? "Создай биографию дня." : "Create a biography of the day.";

    const effectiveMaxTokens = Math.min(maxTokens || 2048, MAX_TOKENS_LIMIT);
    const effectiveTemperature = temperature ?? 0.8;

    // Retryable status codes (transient upstream errors)
    const RETRYABLE_STATUSES = [500, 502, 503, 504];
    const MAX_ATTEMPTS = 2;
    const RETRY_DELAY_MS = 1000;

    // Helper to make the AI request
    async function makeAIRequest(attempt: number): Promise<Response> {
      console.log({
        requestId,
        timestamp: new Date().toISOString(),
        action: "ai_biography_request",
        attempt,
        model: effectiveModel,
        date,
        language,
        items_count: items.length,
        max_tokens: effectiveMaxTokens,
        temperature: effectiveTemperature,
      });

      return await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: effectiveModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          max_tokens: effectiveMaxTokens,
          temperature: effectiveTemperature,
          stream: false,
        }),
      });
    }

    // Make request with single retry for 5xx
    let response: Response;
    let attempt = 1;

    response = await makeAIRequest(attempt);

    // Retry once for transient 5xx errors
    if (!response.ok && RETRYABLE_STATUSES.includes(response.status)) {
      const errorText = await response.text();
      console.warn({
        requestId,
        action: "ai_biography_retry_scheduled",
        attempt,
        status: response.status,
        error: errorText,
      });

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

      attempt = 2;
      response = await makeAIRequest(attempt);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error({
        requestId,
        action: "ai_biography_gateway_error",
        attempt,
        status: response.status,
        error: errorText,
        retried: attempt > 1,
      });

      const errorMessages: Record<number, string> = {
        401: "AI service authentication failed",
        403: "AI service access denied",
        429: "Rate limit exceeded. Please try again later.",
        402: "AI service payment required",
      };

      return new Response(
        JSON.stringify({ error: errorMessages[response.status] || "AI service error", requestId }),
        { status: response.status >= 400 && response.status < 500 ? response.status : 500, headers: responseHeaders() }
      );
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      console.error({ requestId, action: "ai_biography_error", error: "Empty AI response", aiResponse });
      return new Response(
        JSON.stringify({ error: "Empty response from AI", requestId }),
        { status: 500, headers: responseHeaders() }
      );
    }

    // Parse JSON from AI response
    let biography: BiographyResponse;
    try {
      // Extract JSON from potential markdown wrapper
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Calculate confidence
      const confidence = getConfidence(items.length);
      
      biography = {
        title: parsed.title || (language === "ru" ? "Тихий день" : "A Quiet Day"),
        narrative: parsed.narrative || parsed.story || "",
        highlights: parsed.highlights || [],
        timeline: parsed.timeline || parsed.moments || [],
        meta: {
          model: effectiveModel,
          tokens: aiResponse.usage?.total_tokens,
          requestId,
          style: "daybook_biography_v1",
          confidence: parsed.meta?.confidence || confidence,
        },
      };
    } catch (parseError) {
      console.error({ requestId, action: "ai_biography_parse_error", error: String(parseError), content });
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response", requestId }),
        { status: 500, headers: responseHeaders() }
      );
    }
    console.log({
      requestId,
      timestamp: new Date().toISOString(),
      action: "ai_biography_success",
      date,
      title_length: biography.title.length,
      narrative_length: biography.narrative.length,
      highlights_count: biography.highlights.length,
      timeline_count: biography.timeline.length,
      tokens: biography.meta.tokens,
    });

    return new Response(
      JSON.stringify(biography),
      { status: 200, headers: responseHeaders() }
    );
  } catch (error) {
    console.error({ requestId, action: "ai_biography_error", error: String(error) });
    return new Response(
      JSON.stringify({ error: "Internal server error", requestId }),
      { status: 500, headers: responseHeaders() }
    );
  }
});
