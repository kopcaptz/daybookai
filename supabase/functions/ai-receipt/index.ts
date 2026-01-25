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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ai-token, x-request-id",
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
const MAX_BASE64_SIZE = 4 * 1024 * 1024; // 4MB for base64 image data
const MAX_TOKENS = 4096;
const ALLOWED_LANGUAGES = ["ru", "en"];
const ALLOWED_CURRENCIES = ["ILS", "USD", "EUR", "RUB", "GBP", "UAH"];

// Response types
interface ReceiptResponse {
  store: { name: string; address: string | null };
  date: string | null;
  currency: string | null;
  items: Array<{
    name: string;
    qty: number | null;
    unit_price: number | null;
    total_price: number | null;
    discount: number | null;
    category: string | null;
  }>;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  confidence: "high" | "medium" | "low";
  warnings: string[];
}

interface ErrorResponse {
  error: "unreadable" | "not_receipt" | "invalid_json" | "validation_error" | "service_error";
  hint: string;
  requestId: string;
}

// Build the receipt extraction prompt (strict JSON, no translation, OCR-optimized)
function buildReceiptPrompt(language: "ru" | "en", currencyHint?: string): string {
  const currencyContext = currencyHint ? `Expected currency: ${currencyHint}.` : "";
  
  const schema = `{
  "store": { "name": "string", "address": "string|null" },
  "date": "YYYY-MM-DD|null",
  "currency": "ILS|USD|EUR|RUB|GBP|UAH|null",
  "items": [{
    "name": "string (EXACTLY as printed, NO translation)",
    "qty": "number|null (default 1 if not shown)",
    "unit_price": "number|null",
    "total_price": "number|null (REQUIRED if visible)",
    "discount": "number|null (positive value)",
    "category": "food|drinks|household|hygiene|other|null"
  }],
  "subtotal": "number|null",
  "tax": "number|null (VAT/מע\\"מ/НДС if shown)",
  "total": "number (REQUIRED if visible)",
  "confidence": "high|medium|low",
  "warnings": ["strings describing unclear fields"]
}`;

  if (language === "ru") {
    return `Ты — точный OCR-экстрактор чеков. Извлеки данные ТОЧНО как напечатано.

АБСОЛЮТНЫЕ ПРАВИЛА:
1. Верни ТОЛЬКО валидный JSON — БЕЗ markdown, БЕЗ \`\`\`, БЕЗ текста до/после.
2. НЕ ПЕРЕВОДИ названия товаров — сохраняй ТОЧНО как на чеке (RU/EN/HE).
3. Числа — ТОЛЬКО цифры с ТОЧКОЙ как разделителем (3.50, НЕ "3,50").
4. Если поле нечитаемо или отсутствует → null. НЕ УГАДЫВАЙ.
5. Если изображение НЕ чек → {"error": "not_receipt", "hint": "Изображение не является чеком"}.
6. Если чек полностью нечитаем → {"error": "unreadable", "hint": "Сфотографируйте ровнее и без бликов"}.

${currencyContext}

ПРАВИЛА ПАРСИНГА:
- total_price позиции ОБЯЗАТЕЛЕН если виден на чеке.
- qty по умолчанию = 1 если количество не указано явно.
- discount — сумма скидки как положительное число.
- tax = НДС/VAT/מע"מ — общая сумма налога если указана.
- Если сумма позиций ≠ total → добавь warning.
- Если валюта неясна → добавь warning.

КАТЕГОРИИ (определи по названию товара):
- food (еда, продукты)
- drinks (напитки)
- household (бытовое, хозтовары)
- hygiene (гигиена, косметика)
- other (прочее)

СХЕМА ОТВЕТА:
${schema}`;
  }

  return `You are a precise receipt OCR extractor. Extract data EXACTLY as printed.

ABSOLUTE RULES:
1. Return ONLY valid JSON — NO markdown, NO \`\`\`, NO text before/after.
2. DO NOT translate item names — keep EXACTLY as printed (RU/EN/HE mixed OK).
3. Numbers — ONLY digits with DOT as decimal (3.50, NOT "3,50").
4. If field is unreadable or missing → null. DO NOT GUESS.
5. If image is NOT a receipt → {"error": "not_receipt", "hint": "Image is not a receipt"}.
6. If receipt is completely unreadable → {"error": "unreadable", "hint": "Take a clearer photo without glare"}.

${currencyContext}

PARSING RULES:
- total_price per item is REQUIRED if visible on receipt.
- qty defaults to 1 if quantity not explicitly shown.
- discount — discount amount as positive number.
- tax = VAT/НДС/מע"מ — total tax amount if shown.
- If sum of items ≠ total → add warning.
- If currency unclear → add warning.

CATEGORIES (determine from item name):
- food
- drinks
- household
- hygiene
- other

RESPONSE SCHEMA:
${schema}`;
}

// Validate the parsed JSON response
function validateReceiptResponse(data: unknown): { valid: boolean; error?: string } {
  if (!data || typeof data !== "object") {
    return { valid: false, error: "Response is not an object" };
  }

  const obj = data as Record<string, unknown>;

  // Check for error response
  if (obj.error) {
    if (["unreadable", "not_receipt"].includes(obj.error as string)) {
      return { valid: true }; // Valid error response
    }
    return { valid: false, error: `Invalid error type: ${obj.error}` };
  }

  // Validate required fields
  if (!obj.store || typeof obj.store !== "object") {
    return { valid: false, error: "Missing or invalid 'store' field" };
  }

  const store = obj.store as Record<string, unknown>;
  if (typeof store.name !== "string") {
    return { valid: false, error: "Missing 'store.name'" };
  }

  if (!Array.isArray(obj.items)) {
    return { valid: false, error: "Missing or invalid 'items' array" };
  }

  if (!obj.confidence || !["high", "medium", "low"].includes(obj.confidence as string)) {
    return { valid: false, error: "Missing or invalid 'confidence' field" };
  }

  if (!Array.isArray(obj.warnings)) {
    return { valid: false, error: "Missing 'warnings' array" };
  }

  return { valid: true };
}

// Try to repair common JSON issues
function tryRepairJson(text: string): string {
  // Remove markdown code blocks
  let cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "");
  
  // Trim whitespace
  cleaned = cleaned.trim();
  
  // Find first { and last }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  
  return cleaned;
}

serve(async (req) => {
  // Get or generate request ID
  const clientRequestId = req.headers.get("x-request-id");
  const requestId = clientRequestId || crypto.randomUUID();
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

  // Validate AI token
  const aiToken = req.headers.get("X-AI-Token");
  const tokenValidation = await validateAIToken(aiToken, requestId);
  if (!tokenValidation.valid) {
    console.log({ requestId, action: "ai_receipt_unauthorized", error: tokenValidation.error });
    return new Response(
      JSON.stringify({ error: tokenValidation.error, requestId }),
      { status: 401, headers: responseHeaders() }
    );
  }

  if (req.method !== "POST") {
    console.error({ requestId, action: "ai_receipt_error", error: "Method not allowed" });
    return new Response(
      JSON.stringify({ error: "validation_error", hint: "Method not allowed", requestId }),
      { status: 405, headers: responseHeaders() }
    );
  }

  const startTime = Date.now();

  try {
    let requestBody: unknown;
    try {
      requestBody = await req.json();
    } catch {
      console.error({ requestId, action: "ai_receipt_error", error: "Invalid JSON" });
      return new Response(
        JSON.stringify({ error: "validation_error", hint: "Invalid JSON in request body", requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    if (!requestBody || typeof requestBody !== "object") {
      console.error({ requestId, action: "ai_receipt_error", error: "Invalid request body" });
      return new Response(
        JSON.stringify({ error: "validation_error", hint: "Request body must be an object", requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    const { imageBase64, language, timezone, currencyHint, model } = requestBody as Record<string, unknown>;

    // Validate imageBase64
    if (typeof imageBase64 !== "string" || !imageBase64.startsWith("data:image/")) {
      console.error({ requestId, action: "ai_receipt_error", error: "Invalid imageBase64" });
      return new Response(
        JSON.stringify({ error: "validation_error", hint: "imageBase64 must be a valid data URL", requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    // Check base64 size
    const base64Part = imageBase64.split(",")[1] || "";
    if (base64Part.length > MAX_BASE64_SIZE) {
      console.error({ requestId, action: "ai_receipt_error", error: "Image too large" });
      return new Response(
        JSON.stringify({ error: "validation_error", hint: "Image too large. Please compress or take a closer photo.", requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    // Validate language
    if (!ALLOWED_LANGUAGES.includes(language as string)) {
      console.error({ requestId, action: "ai_receipt_error", error: "Invalid language" });
      return new Response(
        JSON.stringify({ error: "validation_error", hint: `language must be one of: ${ALLOWED_LANGUAGES.join(", ")}`, requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    // Validate currencyHint if provided
    if (currencyHint && !ALLOWED_CURRENCIES.includes(currencyHint as string)) {
      console.error({ requestId, action: "ai_receipt_error", error: "Invalid currencyHint" });
      return new Response(
        JSON.stringify({ error: "validation_error", hint: `currencyHint must be one of: ${ALLOWED_CURRENCIES.join(", ")}`, requestId }),
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
        "X-Title": "Daybook Receipt Scanner",
        "HTTP-Referer": "https://daybook.local",
      };
    } else {
      console.error({ requestId, action: "ai_receipt_error", error: "AI service not configured" });
      return new Response(
        JSON.stringify({ error: "service_error", hint: "AI service not configured", requestId }),
        { status: 500, headers: responseHeaders() }
      );
    }

    // Use gemini-2.5-pro for best multimodal performance
    const effectiveModel = (model as string) || "google/gemini-2.5-pro";

    // Build prompt
    const systemPrompt = buildReceiptPrompt(language as "ru" | "en", currencyHint as string | undefined);

    // Estimate image size for logging (don't log content)
    const imageSizeKB = Math.round(base64Part.length * 0.75 / 1024);

    console.log({
      requestId,
      timestamp: new Date().toISOString(),
      action: "ai_receipt_request",
      model: effectiveModel,
      language,
      timezone,
      currencyHint: currencyHint || null,
      imageSizeKB,
    });

    // Helper function for AI request
    async function makeAIRequest(attempt: number): Promise<Response> {
      return await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: effectiveModel,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: language === "ru" ? "Извлеки данные из этого чека." : "Extract data from this receipt." },
                { type: "image_url", image_url: { url: imageBase64 } },
              ],
            },
          ],
          max_tokens: MAX_TOKENS,
          temperature: 0.1,
          stream: false,
        }),
      });
    }

    // Retry logic
    const MAX_ATTEMPTS = 2;
    const RETRY_DELAY_MS = 1000;
    const RETRYABLE_STATUSES = [500, 502, 503, 504];

    let response: Response;
    let attempt = 1;

    response = await makeAIRequest(attempt);

    // Retry on transient errors
    if (!response.ok && RETRYABLE_STATUSES.includes(response.status)) {
      console.log({ requestId, action: "ai_receipt_retry", attempt, status: response.status });
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      attempt = 2;
      response = await makeAIRequest(attempt);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error({ requestId, action: "ai_receipt_gateway_error", status: response.status, error: errorText.slice(0, 500) });

      const errorMessages: Record<number, string> = {
        401: "AI service authentication failed",
        403: "AI service access denied",
        429: "Rate limit exceeded. Please try again later.",
        402: "AI service payment required.",
      };

      return new Response(
        JSON.stringify({ error: "service_error", hint: errorMessages[response.status] || "AI service error", requestId }),
        { status: response.status >= 400 && response.status < 500 ? response.status : 500, headers: responseHeaders() }
      );
    }

    // Parse response
    let responseData: unknown;
    try {
      responseData = await response.json();
    } catch {
      console.error({ requestId, action: "ai_receipt_error", error: "Failed to parse AI response" });
      return new Response(
        JSON.stringify({ error: "invalid_json", hint: "Failed to parse AI response", requestId }),
        { status: 500, headers: responseHeaders() }
      );
    }

    // Extract content
    const choices = (responseData as Record<string, unknown>).choices as Array<{ message: { content: string } }> | undefined;
    const content = choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      console.error({ requestId, action: "ai_receipt_error", error: "No content in AI response" });
      return new Response(
        JSON.stringify({ error: "invalid_json", hint: "AI returned empty response", requestId }),
        { status: 500, headers: responseHeaders() }
      );
    }

    // Try to parse JSON
    let parsedData: unknown;
    try {
      parsedData = JSON.parse(content);
    } catch {
      // Try to repair
      const repaired = tryRepairJson(content);
      try {
        parsedData = JSON.parse(repaired);
      } catch {
        console.error({ requestId, action: "ai_receipt_error", error: "Invalid JSON from AI", content: content.slice(0, 200) });
        return new Response(
          JSON.stringify({ error: "invalid_json", hint: "AI returned invalid JSON. Please try again.", requestId }),
          { status: 500, headers: responseHeaders() }
        );
      }
    }

    // Validate response structure
    const validation = validateReceiptResponse(parsedData);
    if (!validation.valid) {
      console.error({ requestId, action: "ai_receipt_error", error: validation.error });
      return new Response(
        JSON.stringify({ error: "invalid_json", hint: validation.error || "Invalid response structure", requestId }),
        { status: 500, headers: responseHeaders() }
      );
    }

    const duration = Date.now() - startTime;

    // Check if it's an error response from the model
    const obj = parsedData as Record<string, unknown>;
    if (obj.error) {
      console.log({
        requestId,
        action: "ai_receipt_model_error",
        error: obj.error,
        duration,
      });
      return new Response(
        JSON.stringify({ error: obj.error, hint: obj.hint || "Recognition failed", requestId }),
        { status: 200, headers: responseHeaders() }
      );
    }

    // Success
    console.log({
      requestId,
      action: "ai_receipt_success",
      duration,
      itemsCount: (obj.items as unknown[]).length,
      confidence: obj.confidence,
    });

    return new Response(
      JSON.stringify(parsedData),
      { status: 200, headers: responseHeaders() }
    );
  } catch (error) {
    console.error({ requestId, action: "ai_receipt_error", error: String(error) });
    return new Response(
      JSON.stringify({ error: "service_error", hint: "Internal server error", requestId }),
      { status: 500, headers: responseHeaders() }
    );
  }
});
