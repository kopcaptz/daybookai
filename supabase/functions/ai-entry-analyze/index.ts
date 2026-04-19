import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// CORS configuration
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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-provider-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Provider routing
function getProviderConfig(provider: string, model: string, providerKey?: string): {
  apiUrl: string;
  headers: Record<string, string>;
  effectiveModel: string;
} | null {
  if (provider === "openrouter") {
    if (!providerKey) return null;
    return {
      apiUrl: "https://openrouter.ai/api/v1/chat/completions",
      headers: {
        "Authorization": `Bearer ${providerKey}`,
        "Content-Type": "application/json",
        "X-Title": "Daybook",
        "HTTP-Referer": "https://daybook.local",
      },
      effectiveModel: model || "google/gemini-2.5-flash-lite",
    };
  }
  if (provider === "minimax") {
    if (!providerKey) return null;
    return {
      apiUrl: "https://api.minimax.io/v1/chat/completions",
      headers: {
        "Authorization": `Bearer ${providerKey}`,
        "Content-Type": "application/json",
      },
      effectiveModel: model || "MiniMax-M2.7-highspeed",
    };
  }
  // Default: lovable
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return null;
  return {
    apiUrl: "https://ai.gateway.lovable.dev/v1/chat/completions",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    effectiveModel: model || "google/gemini-2.5-flash-lite",
  };
}

interface AnalyzeRequest {
  text: string;
  tags: string[];
  language: "ru" | "en";
  mode?: "full" | "quick";
  provider?: string;
  model?: string;
}

interface AnalyzeResponse {
  mood: number;
  confidence: number;
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

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { text, tags, language, mode = "full", provider = "lovable", model }: AnalyzeRequest = await req.json();

    if (!text || typeof text !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid text field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userProviderKey = req.headers.get("X-Provider-Key") || undefined;
    const providerConfig = getProviderConfig(provider, model || "", userProviderKey);
    if (!providerConfig) {
      console.error(`[${requestId}] Provider "${provider}" not configured`);
      return new Response(
        JSON.stringify({ error: provider === "lovable" ? "AI service not configured" : `Provider "${provider}" requires an API key` }),
        { status: provider === "lovable" ? 500 : 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === "quick") {
      return await handleQuickMode(text, language, requestId, startTime, providerConfig, corsHeaders);
    }

    return await handleFullMode(text, tags, language, requestId, startTime, providerConfig, corsHeaders);

  } catch (err) {
    console.error(`[${requestId}] Unexpected error:`, err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function handleQuickMode(
  text: string,
  language: "ru" | "en",
  requestId: string,
  startTime: number,
  providerConfig: { apiUrl: string; headers: Record<string, string>; effectiveModel: string },
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

  const response = await fetch(providerConfig.apiUrl, {
    method: "POST",
    headers: providerConfig.headers,
    body: JSON.stringify({
      model: providerConfig.effectiveModel,
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

async function handleFullMode(
  text: string,
  tags: string[],
  language: "ru" | "en",
  requestId: string,
  startTime: number,
  providerConfig: { apiUrl: string; headers: Record<string, string>; effectiveModel: string },
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

2. titleSuggestion: короткий заголовок (3-6 слов) в духе кибер-мистицизма
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

2. titleSuggestion: short title (3-6 words) in cyber-mysticism style
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
  "titleSuggestion": "..."
}`;

  console.log(`[${requestId}] Full analysis, textLen=${text.length}, tags=${tags.length}`);

  const response = await fetch(providerConfig.apiUrl, {
    method: "POST",
    headers: providerConfig.headers,
    body: JSON.stringify({
      model: providerConfig.effectiveModel,
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

  let parsed: { mood: number; confidence: number; titleSuggestion?: string };
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
  const titleSuggestion = typeof parsed.titleSuggestion === 'string'
    ? parsed.titleSuggestion.slice(0, 80).trim()
    : undefined;

  const durationMs = Date.now() - startTime;
  console.log(`[${requestId}] Full done: mood=${mood}, confidence=${confidence.toFixed(2)}, title="${titleSuggestion || 'none'}", duration=${durationMs}ms`);

  const result: AnalyzeResponse = { mood, confidence, titleSuggestion, requestId };

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
