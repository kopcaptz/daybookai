import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AnalyzeRequest {
  text: string;
  tags: string[];
  language: "ru" | "en";
  mode?: "full" | "quick"; // NEW: quick mode for live prediction
}

interface AnalyzeResponse {
  mood: number;
  confidence: number;
  semanticTags: string[];
  titleSuggestion?: string; // NEW: for Phase 2
  requestId: string;
}

interface QuickResponse {
  mood: number;
  confidence: number;
  requestId: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().slice(0, 8);
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
      return await handleQuickMode(text, language, requestId, startTime, LOVABLE_API_KEY);
    }

    // Full mode: complete analysis with semantic tags and title suggestion
    return await handleFullMode(text, tags, language, requestId, startTime, LOVABLE_API_KEY);

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
 * ~50 tokens, ~200ms latency
 */
async function handleQuickMode(
  text: string,
  language: "ru" | "en",
  requestId: string,
  startTime: number,
  apiKey: string
): Promise<Response> {
  // Truncate text for quick analysis (max 500 chars)
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
      temperature: 0.2, // Low for deterministic results
      max_tokens: 50,
    }),
  });

  if (!response.ok) {
    return handleApiError(response, requestId);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";

  // Parse JSON
  let parsed: { mood: number; confidence: number };
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
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

  const result: QuickResponse = {
    mood,
    confidence,
    requestId,
  };

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
  apiKey: string
): Promise<Response> {
  // Truncate text to ~1000 chars for efficiency
  const truncatedText = text.length > 1000 ? text.slice(0, 1000) + "..." : text;

  const systemPrompt = language === "ru"
    ? `Ты — анализатор дневниковых записей в стиле "кибер-гримуара".

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
    return handleApiError(response, requestId);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";

  // Parse JSON from response (handle markdown code blocks)
  let parsed: { mood: number; confidence: number; semanticTags: string[]; titleSuggestion?: string };
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    parsed = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    console.error(`[${requestId}] Failed to parse AI response:`, content);
    return new Response(
      JSON.stringify({ error: "Invalid AI response format" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Validate and sanitize response
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

  const result: AnalyzeResponse = {
    mood,
    confidence,
    semanticTags,
    titleSuggestion,
    requestId,
  };

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Handle API errors consistently
 */
async function handleApiError(response: Response, requestId: string): Promise<Response> {
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
