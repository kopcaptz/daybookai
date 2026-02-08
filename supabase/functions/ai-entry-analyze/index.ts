import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// CORS configuration - allow known origins (matches ai-chat)
const ALLOWED_ORIGINS = [
  "https://local-heart-diary.lovable.app",
  "https://daybookai.lovable.app",
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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ai-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// AI Token validation (same as ai-chat)
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

interface AnalyzeRequest {
  text: string;
  tags: string[];
  language: "ru" | "en";
  mode?: "full" | "quick";
}

interface AnalyzeResponse {
  mood: number;
  confidence: number;
  semanticTags: string[];
  titleSuggestion?: string;
  requestId: string;
}

interface QuickResponse {
  mood: number;
  confidence: number;
  requestId: string;
}

serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Validate AI token
  const aiToken = req.headers.get("X-AI-Token");
  const tokenValidation = await validateAIToken(aiToken, requestId);
  if (!tokenValidation.valid) {
    console.log({ requestId, action: "ai_entry_analyze_unauthorized", error: tokenValidation.error });
    return new Response(
      JSON.stringify({ error: tokenValidation.error, requestId }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const startTime = Date.now();

  try {
    const { text, tags, language, mode = "full" }: AnalyzeRequest = await req.json();

    // Validate input
    if (!text || typeof text !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid text field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error(`[${requestId}] LOVABLE_API_KEY not configured`);
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Quick mode: shorter prompt, mood + confidence only, faster response
    if (mode === "quick") {
      return await handleQuickMode(text, language, requestId, startTime, LOVABLE_API_KEY, corsHeaders);
    }

    // Full mode: complete analysis with semantic tags and title suggestion
    return await handleFullMode(text, tags, language, requestId, startTime, LOVABLE_API_KEY, corsHeaders);

  } catch (err) {
    console.error(`[${requestId}] Unexpected error:`, err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Quick mode: Fast mood prediction for live typing analysis
 */
async function handleQuickMode(
  text: string,
  language: "ru" | "en",
  requestId: string,
  startTime: number,
  apiKey: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const truncatedText = text.length > 500 ? text.slice(0, 500) + "..." : text;

  const quickPrompt = language === "ru"
    ? `Определи эмоциональный тон текста (1-5):
1=негатив/грусть, 2=усталость/раздражение, 3=нейтрально, 4=позитив, 5=восторг/радость
Учитывай контекст, иронию, идиомы ("ужасно круто"=позитив, "отличный провал"=негатив).
ТОЛЬКО JSON: {"mood":N,"confidence":0.X}`
    : `Determine emotional tone (1-5):
1=negative/sad, 2=tired/frustrated, 3=neutral, 4=positive, 5=very happy/excited
Consider context, irony, idioms ("terribly good"=positive, "great failure"=negative).
ONLY JSON: {"mood":N,"confidence":0.X}`;

  console.log(`[${requestId}] Quick analysis, textLen=${text.length}`);

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: quickPrompt },
        { role: "user", content: truncatedText },
      ],
      temperature: 0.2,
      max_tokens: 50,
    }),
  });

  if (!response.ok) {
    return handleApiError(response, requestId, corsHeaders);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";

  let parsed: { mood: number; confidence: number };
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    parsed = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    console.error(`[${requestId}] Failed to parse quick response:`, content);
    return new Response(
      JSON.stringify({ error: "Invalid AI response format" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const mood = Math.max(1, Math.min(5, Math.round(parsed.mood || 3)));
  const confidence = Math.max(0, Math.min(1, parsed.confidence || 0.5));

  const durationMs = Date.now() - startTime;
  console.log(`[${requestId}] Quick done: mood=${mood}, confidence=${confidence.toFixed(2)}, duration=${durationMs}ms`);

  const result: QuickResponse = { mood, confidence, requestId };

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Full mode: Complete analysis with mood, semantic tags, and title suggestion
 */
async function handleFullMode(
  text: string,
  tags: string[],
  language: "ru" | "en",
  requestId: string,
  startTime: number,
  apiKey: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const truncatedText = text.length > 1000 ? text.slice(0, 1000) + "..." : text;

  const systemPrompt = language === "ru"
    ? `Ты — анализатор дневниковых записей «Магического блокнота».

Анализируй текст и возвращай:
1. mood (1-5): эмоциональный тон записи
   1 = очень негативный/грустный/злой
   2 = слегка негативный/усталый/раздражённый  
   3 = нейтральный/спокойный/рутинный
   4 = позитивный/радостный/довольный
   5 = очень позитивный/воодушевлённый/благодарный

2. semanticTags (3-8 тегов): скрытые ключевые слова для поиска:
   - Темы (работа, семья, здоровье, хобби, путешествия, финансы, отношения)
   - Действия (встреча, тренировка, готовка, чтение, покупки, отдых)
   - Эмоции (стресс, радость, тревога, покой, энтузиазм, усталость)
   - Паттерны времени (утренняя рутина, выходной, праздник, будни)

3. titleSuggestion: короткий заголовок (3-6 слов) в духе кибер-мистицизма
   - Используй термины: "контур", "сектор", "резонанс", "импульс", "сигнал"
   - Примеры: "Импульс в секторе Работа", "Контур семейного резонанса"
   - Если текст про рутину: "Дневной контур: [тема]"
   - Если эмоциональный: "Резонанс [эмоции]: [тема]"

Правила:
- Теги на русском, одно слово или короткая фраза
- Фокус на поисковых концептах, не стиле
- Включай и явные, и неявные темы
- Возвращай ТОЛЬКО валидный JSON`
    : `You are a diary entry analyzer in "cyber-grimoire" style.

Analyze the text and return:
1. mood (1-5): emotional tone of the entry
   1 = very negative/sad/angry
   2 = somewhat negative/tired/frustrated  
   3 = neutral/calm/routine
   4 = positive/happy/satisfied
   5 = very positive/excited/grateful

2. semanticTags (3-8 tags): hidden search keywords that capture:
   - Main topics (work, family, health, hobby, travel, finances, relationships)
   - Activities (meeting, exercise, cooking, reading, shopping, relaxation)
   - Emotions (stress, joy, anxiety, peace, enthusiasm, fatigue)
   - Time patterns (morning routine, weekend, holiday, weekday)

3. titleSuggestion: short title (3-6 words) in cyber-mysticism style
   - Use terms: "contour", "sector", "resonance", "impulse", "signal"
   - Examples: "Work Sector Impulse", "Family Resonance Contour"
   - For routine: "Daily Contour: [topic]"
   - For emotional: "Resonance of [emotion]: [topic]"

Rules:
- Tags in lowercase, single words or short phrases
- Focus on searchable concepts, not style
- Include both explicit and implicit themes
- Return ONLY valid JSON`;

  const userPrompt = `Entry text:
"""
${truncatedText}
"""

User tags: [${tags.join(", ")}]

Return ONLY valid JSON:
{
  "mood": <number 1-5>,
  "confidence": <number 0-1>,
  "semanticTags": ["tag1", "tag2", ...],
  "titleSuggestion": "..."
}`;

  console.log(`[${requestId}] Full analysis, textLen=${text.length}, tags=${tags.length}`);

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    return handleApiError(response, requestId, corsHeaders);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";

  let parsed: { mood: number; confidence: number; semanticTags: string[]; titleSuggestion?: string };
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    parsed = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    console.error(`[${requestId}] Failed to parse AI response:`, content);
    return new Response(
      JSON.stringify({ error: "Invalid AI response format" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const mood = Math.max(1, Math.min(5, Math.round(parsed.mood || 3)));
  const confidence = Math.max(0, Math.min(1, parsed.confidence || 0.5));
  const semanticTags = Array.isArray(parsed.semanticTags) 
    ? parsed.semanticTags.slice(0, 8).map((t: unknown) => String(t).toLowerCase().trim())
    : [];
  const titleSuggestion = typeof parsed.titleSuggestion === 'string' 
    ? parsed.titleSuggestion.slice(0, 80).trim() 
    : undefined;

  const durationMs = Date.now() - startTime;
  console.log(`[${requestId}] Full done: mood=${mood}, confidence=${confidence.toFixed(2)}, tags=${semanticTags.length}, title="${titleSuggestion || 'none'}", duration=${durationMs}ms`);

  const result: AnalyzeResponse = { mood, confidence, semanticTags, titleSuggestion, requestId };

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Handle API errors consistently
 */
async function handleApiError(response: Response, requestId: string, corsHeaders: Record<string, string>): Promise<Response> {
  const status = response.status;
  
  if (status === 429) {
    console.warn(`[${requestId}] Rate limited`);
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded, try again later" }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  
  if (status === 402) {
    console.warn(`[${requestId}] Payment required`);
    return new Response(
      JSON.stringify({ error: "AI credits exhausted" }),
      { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const errorText = await response.text();
  console.error(`[${requestId}] AI gateway error: ${status}`, errorText);
  return new Response(
    JSON.stringify({ error: "AI analysis failed" }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
