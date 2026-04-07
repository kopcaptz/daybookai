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
      effectiveModel: model || "google/gemini-2.5-flash",
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
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return null;
  return {
    apiUrl: "https://ai.gateway.lovable.dev/v1/chat/completions",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    effectiveModel: model || "google/gemini-2.5-flash",
  };
}

interface WeeklyEntryData {
  date: string;
  mood: number;
  title?: string;
  text: string;
}

interface WeeklyRequest {
  entries: WeeklyEntryData[];
  language: 'ru' | 'en';
  provider?: string;
  model?: string;
}

interface WeeklyInsightResult {
  summary: string;
  dominantThemes: string[];
  moodPattern: string;
  insight: string;
  suggestion: string;
}

const SYSTEM_PROMPT_RU = `Ты — аналитик личного дневника «Магический блокнот».
Проанализируй недельные данные и выяви паттерны настроения и активности.

СТИЛЬ ОТВЕТА:
- Используй метафоры "контуров", "резонансов", "сигналов", "энергетических потоков"
- Будь конкретен, но не цитируй записи дословно
- Фокус на паттернах, инсайтах и практических рекомендациях
- Пиши на русском языке

ФОРМАТ ОТВЕТА (JSON):
{
  "summary": "2-3 предложения об общем характере недели",
  "dominantThemes": ["тема1", "тема2", "тема3", "тема4", "тема5"],
  "moodPattern": "описание динамики настроения за неделю (тренды, пики, спады)",
  "insight": "ключевое наблюдение о паттернах или корреляциях",
  "suggestion": "конкретная практическая рекомендация на следующую неделю"
}`;

const SYSTEM_PROMPT_EN = `You are a personal diary analyst in the "cyber-grimoire" style.
Analyze the weekly data and identify mood and activity patterns.

RESPONSE STYLE:
- Use metaphors of "circuits", "resonances", "signals", "energy flows"
- Be specific but don't quote entries verbatim
- Focus on patterns, insights, and practical recommendations
- Write in English

RESPONSE FORMAT (JSON):
{
  "summary": "2-3 sentences about the overall character of the week",
  "dominantThemes": ["theme1", "theme2", "theme3", "theme4", "theme5"],
  "moodPattern": "description of mood dynamics over the week (trends, peaks, dips)",
  "insight": "key observation about patterns or correlations",
  "suggestion": "specific practical recommendation for next week"
}`;

function buildUserPrompt(entries: WeeklyEntryData[], language: 'ru' | 'en'): string {
  const header = language === 'ru'
    ? `Данные за последние 7 дней (${entries.length} записей):`
    : `Data from the last 7 days (${entries.length} entries):`;

  const entryLines = entries.map(e => {
    const mood = `[Mood: ${e.mood}/5]`;
    const title = e.title ? `"${e.title}"` : '';
    return `${e.date} ${mood} ${title}`.trim();
  }).join('\n');

  return `${header}\n\n${entryLines}`;
}

serve(async (req) => {
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

  try {
    const body = await req.json() as WeeklyRequest;
    const { entries, language, provider = "lovable", model } = body;

    if (!entries || !Array.isArray(entries) || entries.length < 3) {
      return new Response(
        JSON.stringify({ error: "minimum_3_entries_required", requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    if (entries.length > 50) {
      return new Response(
        JSON.stringify({ error: "too_many_entries", requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    const validLanguage = language === 'en' ? 'en' : 'ru';

    console.log({ requestId, action: "weekly_insights_request", entryCount: entries.length, language: validLanguage, provider });

    const systemPrompt = validLanguage === 'ru' ? SYSTEM_PROMPT_RU : SYSTEM_PROMPT_EN;
    const userPrompt = buildUserPrompt(entries, validLanguage);

    const userProviderKey = req.headers.get("X-Provider-Key") || undefined;
    const providerConfig = getProviderConfig(provider, model || "", userProviderKey);
    if (!providerConfig) {
      return new Response(
        JSON.stringify({ error: provider === "lovable" ? "ai_service_not_configured" : `provider_key_required`, requestId }),
        { status: provider === "lovable" ? 500 : 401, headers: responseHeaders() }
      );
    }

    const aiResponse = await fetch(providerConfig.apiUrl, {
      method: "POST",
      headers: providerConfig.headers,
      body: JSON.stringify({
        model: providerConfig.effectiveModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error({ requestId, action: "weekly_insights_ai_error", status: aiResponse.status, error: errorText });

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "rate_limit_exceeded", requestId }), { status: 429, headers: responseHeaders() });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "payment_required", requestId }), { status: 402, headers: responseHeaders() });
      }
      return new Response(JSON.stringify({ error: "ai_service_error", requestId }), { status: 500, headers: responseHeaders() });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    let result: WeeklyInsightResult;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      const jsonStr = jsonMatch[1]?.trim() || content.trim();
      result = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error({ requestId, action: "weekly_insights_parse_error", error: String(parseError), content });
      return new Response(JSON.stringify({ error: "ai_response_parse_error", requestId }), { status: 500, headers: responseHeaders() });
    }

    if (!result.summary || !result.dominantThemes || !result.moodPattern || !result.insight || !result.suggestion) {
      console.error({ requestId, action: "weekly_insights_invalid_result", result });
      return new Response(JSON.stringify({ error: "ai_response_invalid", requestId }), { status: 500, headers: responseHeaders() });
    }

    console.log({ requestId, action: "weekly_insights_success", themesCount: result.dominantThemes.length });

    return new Response(JSON.stringify({ ...result, requestId }), { status: 200, headers: responseHeaders() });

  } catch (error) {
    console.error({ requestId, action: "weekly_insights_error", error: String(error) });
    return new Response(JSON.stringify({ error: "internal_error", requestId }), { status: 500, headers: responseHeaders() });
  }
});
