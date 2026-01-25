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
const MAX_TOKENS_LIMIT = 4096;
const MIN_TOKENS = 1;
const MAX_TEMPERATURE = 2;
const MIN_TEMPERATURE = 0;
const MAX_MESSAGES = 50;
const MAX_TEXT_LENGTH = 10000;
const MAX_BASE64_SIZE = 4 * 1024 * 1024; // 4MB for base64 image data
const ALLOWED_ROLES = ["system", "user", "assistant"];
const ALLOWED_MODELS = [
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "google/gemini-2.5-pro",
  "google/gemini-3-flash-preview",
];

// Content part types for multimodal support
interface TextContentPart {
  type: "text";
  text: string;
}

interface ImageUrlContentPart {
  type: "image_url";
  image_url: {
    url: string; // data:image/...;base64,... or https://...
  };
}

type ContentPart = TextContentPart | ImageUrlContentPart;

interface ChatMessage {
  role: string;
  content: string | ContentPart[];
}

function validateContentPart(part: unknown, index: number, partIndex: number): { valid: boolean; error?: string } {
  if (!part || typeof part !== "object") {
    return { valid: false, error: `messages[${index}].content[${partIndex}] must be an object` };
  }

  const p = part as Record<string, unknown>;
  
  if (p.type === "text") {
    if (typeof p.text !== "string") {
      return { valid: false, error: `messages[${index}].content[${partIndex}].text must be a string` };
    }
    if (p.text.length > MAX_TEXT_LENGTH) {
      return { valid: false, error: `messages[${index}].content[${partIndex}].text exceeds ${MAX_TEXT_LENGTH} characters` };
    }
    return { valid: true };
  }
  
  if (p.type === "image_url") {
    if (!p.image_url || typeof p.image_url !== "object") {
      return { valid: false, error: `messages[${index}].content[${partIndex}].image_url must be an object` };
    }
    const imageUrl = p.image_url as Record<string, unknown>;
    if (typeof imageUrl.url !== "string") {
      return { valid: false, error: `messages[${index}].content[${partIndex}].image_url.url must be a string` };
    }
    // Validate base64 data URL or https URL
    const url = imageUrl.url;
    if (url.startsWith("data:image/")) {
      // Check base64 size (rough estimate)
      const base64Part = url.split(",")[1] || "";
      if (base64Part.length > MAX_BASE64_SIZE) {
        return { valid: false, error: `messages[${index}].content[${partIndex}] image data exceeds size limit` };
      }
    } else if (!url.startsWith("https://")) {
      return { valid: false, error: `messages[${index}].content[${partIndex}].image_url.url must be a data URL or https URL` };
    }
    return { valid: true };
  }
  
  return { valid: false, error: `messages[${index}].content[${partIndex}].type must be "text" or "image_url"` };
}

function validateMessages(messages: unknown): { valid: boolean; error?: string } {
  if (!Array.isArray(messages)) {
    return { valid: false, error: "messages must be an array" };
  }
  if (messages.length === 0) {
    return { valid: false, error: "messages array cannot be empty" };
  }
  if (messages.length > MAX_MESSAGES) {
    return { valid: false, error: `messages array cannot exceed ${MAX_MESSAGES} items` };
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg || typeof msg !== "object") {
      return { valid: false, error: `messages[${i}] must be an object` };
    }
    const { role, content } = msg as ChatMessage;
    if (!role || !ALLOWED_ROLES.includes(role)) {
      return { valid: false, error: `messages[${i}].role must be one of: ${ALLOWED_ROLES.join(", ")}` };
    }
    
    // Content can be string OR array of content parts (multimodal)
    if (typeof content === "string") {
      if (content.length > MAX_TEXT_LENGTH) {
        return { valid: false, error: `messages[${i}].content exceeds ${MAX_TEXT_LENGTH} characters` };
      }
    } else if (Array.isArray(content)) {
      // Validate each content part
      for (let j = 0; j < content.length; j++) {
        const partValidation = validateContentPart(content[j], i, j);
        if (!partValidation.valid) {
          return partValidation;
        }
      }
    } else {
      return { valid: false, error: `messages[${i}].content must be a string or array of content parts` };
    }
  }

  return { valid: true };
}

function validateModel(model: unknown): { valid: boolean; error?: string } {
  if (model === undefined || model === null) {
    return { valid: true }; // Model is optional, will use default
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

function validateMaxTokens(maxTokens: unknown): { valid: boolean; error?: string; value: number } {
  if (maxTokens === undefined || maxTokens === null) {
    return { valid: true, value: 1024 }; // Default value
  }
  const num = Number(maxTokens);
  if (isNaN(num) || !Number.isInteger(num)) {
    return { valid: false, error: "maxTokens must be an integer", value: 0 };
  }
  if (num < MIN_TOKENS || num > MAX_TOKENS_LIMIT) {
    return { valid: false, error: `maxTokens must be between ${MIN_TOKENS} and ${MAX_TOKENS_LIMIT}`, value: 0 };
  }
  return { valid: true, value: num };
}

function validateTemperature(temperature: unknown): { valid: boolean; error?: string; value: number } {
  if (temperature === undefined || temperature === null) {
    return { valid: true, value: 0.7 }; // Default value
  }
  const num = Number(temperature);
  if (isNaN(num)) {
    return { valid: false, error: "temperature must be a number", value: 0 };
  }
  if (num < MIN_TEMPERATURE || num > MAX_TEMPERATURE) {
    return { valid: false, error: `temperature must be between ${MIN_TEMPERATURE} and ${MAX_TEMPERATURE}`, value: 0 };
  }
  return { valid: true, value: num };
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

  // Validate AI token
  const aiToken = req.headers.get("X-AI-Token");
  const tokenValidation = await validateAIToken(aiToken, requestId);
  if (!tokenValidation.valid) {
    console.log({ requestId, action: "ai_chat_unauthorized", error: tokenValidation.error });
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
      console.error({ requestId, action: "ai_chat_error", error: "Invalid JSON" });
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body", requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    if (!requestBody || typeof requestBody !== "object") {
      console.error({ requestId, action: "ai_chat_error", error: "Invalid request body" });
      return new Response(
        JSON.stringify({ error: "Request body must be an object", requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    const { messages, model, maxTokens, temperature } = requestBody as Record<string, unknown>;

    // Validate messages
    const messagesValidation = validateMessages(messages);
    if (!messagesValidation.valid) {
      console.error({ requestId, action: "ai_chat_error", error: messagesValidation.error });
      return new Response(
        JSON.stringify({ error: messagesValidation.error, requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    // Validate model
    const modelValidation = validateModel(model);
    if (!modelValidation.valid) {
      console.error({ requestId, action: "ai_chat_error", error: modelValidation.error });
      return new Response(
        JSON.stringify({ error: modelValidation.error, requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    // Validate maxTokens
    const maxTokensValidation = validateMaxTokens(maxTokens);
    if (!maxTokensValidation.valid) {
      console.error({ requestId, action: "ai_chat_error", error: maxTokensValidation.error });
      return new Response(
        JSON.stringify({ error: maxTokensValidation.error, requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    // Validate temperature
    const temperatureValidation = validateTemperature(temperature);
    if (!temperatureValidation.valid) {
      console.error({ requestId, action: "ai_chat_error", error: temperatureValidation.error });
      return new Response(
        JSON.stringify({ error: temperatureValidation.error, requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    // Try LOVABLE_API_KEY first (Lovable AI Gateway), then fallback to OpenRouter key
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const OPENROUTER_API_KEY = Deno.env.get("VITE_AI_API_KEY");
    
    let apiUrl: string;
    let apiKey: string;
    let headers: Record<string, string>;
    
    if (LOVABLE_API_KEY) {
      // Use Lovable AI Gateway
      apiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
      apiKey = LOVABLE_API_KEY;
      headers = {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
    } else if (OPENROUTER_API_KEY) {
      // Use OpenRouter
      apiUrl = "https://openrouter.ai/api/v1/chat/completions";
      apiKey = OPENROUTER_API_KEY;
      headers = {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Daybook",
        "HTTP-Referer": "https://daybook.local",
      };
    } else {
      console.error({ requestId, action: "ai_chat_error", error: "AI service not configured" });
      return new Response(
        JSON.stringify({ error: "AI service not configured", requestId }),
        { status: 500, headers: responseHeaders() }
      );
    }

    // Map model names for Lovable AI Gateway (legacy support)
    let effectiveModel = (model as string) || "google/gemini-3-flash-preview";
    if (LOVABLE_API_KEY) {
      const modelMap: Record<string, string> = {
        "gpt-3.5-turbo": "google/gemini-2.5-flash-lite",
        "gpt-4o-mini": "google/gemini-2.5-flash",
        "gpt-4o": "google/gemini-2.5-pro",
        "gpt-4": "google/gemini-2.5-pro",
      };
      effectiveModel = modelMap[model as string] || (model as string) || "google/gemini-3-flash-preview";
    }

    // Count messages and check if multimodal (for logging, never log content)
    const messageCount = (messages as ChatMessage[]).length;
    const hasMultimodal = (messages as ChatMessage[]).some(m => Array.isArray(m.content));

    console.log({
      requestId,
      timestamp: new Date().toISOString(),
      action: "ai_chat_request",
      model: effectiveModel,
      token_limit: maxTokensValidation.value,
      temperature: temperatureValidation.value,
      message_count: messageCount,
      multimodal: hasMultimodal,
    });

    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: effectiveModel,
        messages: messages as ChatMessage[],
        max_tokens: maxTokensValidation.value,
        temperature: temperatureValidation.value,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error({ requestId, action: "ai_chat_gateway_error", status: response.status, error: errorText });
      
      const errorMessages: Record<number, string> = {
        401: "AI service authentication failed",
        403: "AI service access denied",
        429: "Rate limit exceeded. Please try again later.",
        402: "AI service payment required.",
      };
      
      return new Response(
        JSON.stringify({ error: errorMessages[response.status] || "AI service error", requestId }),
        { status: response.status >= 400 && response.status < 500 ? response.status : 500, headers: responseHeaders() }
      );
    }

    console.log({ requestId, action: "ai_chat_streaming_start", multimodal: hasMultimodal });

    // Return streaming response with X-Request-Id header
    return new Response(response.body, {
      headers: responseHeaders("text/event-stream"),
    });
  } catch (error) {
    console.error({ requestId, action: "ai_chat_error", error: String(error) });
    return new Response(
      JSON.stringify({ error: "Internal server error", requestId }),
      { status: 500, headers: responseHeaders() }
    );
  }
});
