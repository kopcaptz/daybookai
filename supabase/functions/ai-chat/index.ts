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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ai-token, x-provider-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}


// Validation constants
const MAX_TOKENS_LIMIT = 4096;
const MIN_TOKENS = 1;
const MAX_TEMPERATURE = 2;
const MIN_TEMPERATURE = 0;
const MAX_MESSAGES = 50;
const MAX_TEXT_LENGTH = 10000;
const MAX_BASE64_SIZE = 4 * 1024 * 1024;
const ALLOWED_ROLES = ["system", "user", "assistant"];

// Provider-specific allowed models
const ALLOWED_MODELS_BY_PROVIDER: Record<string, string[]> = {
  lovable: [
    "google/gemini-2.5-flash",
    "google/gemini-2.5-flash-lite",
    "google/gemini-2.5-pro",
    "google/gemini-3-flash-preview",
  ],
  openrouter: [
    "google/gemini-2.5-flash-lite",
    "google/gemini-2.5-flash",
    "google/gemini-2.5-pro",
    "anthropic/claude-sonnet-4",
    "anthropic/claude-opus-4",
    "anthropic/claude-3.5-sonnet",
    "openai/gpt-4o",
    "openai/gpt-4o-mini",
  ],
  minimax: [
    "MiniMax-M1",
    "MiniMax-M1-80B",
  ],
};

const ALLOWED_PROVIDERS = ["lovable", "openrouter", "minimax"];

// Content part types for multimodal support
interface TextContentPart {
  type: "text";
  text: string;
}

interface ImageUrlContentPart {
  type: "image_url";
  image_url: {
    url: string;
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
    const url = imageUrl.url;
    if (url.startsWith("data:image/")) {
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
    
    if (typeof content === "string") {
      if (content.length > MAX_TEXT_LENGTH) {
        return { valid: false, error: `messages[${i}].content exceeds ${MAX_TEXT_LENGTH} characters` };
      }
    } else if (Array.isArray(content)) {
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

function validateModel(model: unknown, provider: string): { valid: boolean; error?: string } {
  if (model === undefined || model === null) {
    return { valid: true };
  }
  if (typeof model !== "string") {
    return { valid: false, error: "model must be a string" };
  }
  const allowedModels = ALLOWED_MODELS_BY_PROVIDER[provider] || ALLOWED_MODELS_BY_PROVIDER.lovable;
  // Also allow legacy models for backward compat
  const legacyModels = ["gpt-3.5-turbo", "gpt-4o-mini", "gpt-4o", "gpt-4"];
  const allAllowed = [...allowedModels, ...legacyModels];
  if (!allAllowed.includes(model)) {
    return { valid: false, error: `model "${model}" is not allowed for provider "${provider}"` };
  }
  return { valid: true };
}

function validateMaxTokens(maxTokens: unknown): { valid: boolean; error?: string; value: number } {
  if (maxTokens === undefined || maxTokens === null) {
    return { valid: true, value: 1024 };
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
    return { valid: true, value: 0.7 };
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

// Build provider-specific request config
function getProviderConfig(provider: string, model: string, providerKey?: string): {
  apiUrl: string;
  apiKey: string;
  headers: Record<string, string>;
  effectiveModel: string;
} | null {
  if (provider === "openrouter") {
    const apiKey = providerKey;
    if (!apiKey) return null;
    return {
      apiUrl: "https://openrouter.ai/api/v1/chat/completions",
      apiKey,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Daybook",
        "HTTP-Referer": "https://daybook.local",
      },
      effectiveModel: model,
    };
  }

  if (provider === "minimax") {
    const apiKey = providerKey;
    if (!apiKey) return null;
    return {
      apiUrl: "https://api.minimaxi.chat/v1/text/chatcompletion_v2",
      apiKey,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      effectiveModel: model,
    };
  }

  // Default: lovable
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return null;
  }

  // Map legacy model names for Lovable gateway
  const modelMap: Record<string, string> = {
    "gpt-3.5-turbo": "google/gemini-2.5-flash-lite",
    "gpt-4o-mini": "google/gemini-2.5-flash",
    "gpt-4o": "google/gemini-2.5-pro",
    "gpt-4": "google/gemini-2.5-pro",
  };
  const effectiveModel = modelMap[model] || model || "google/gemini-3-flash-preview";

  return {
    apiUrl: "https://ai.gateway.lovable.dev/v1/chat/completions",
    apiKey,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    effectiveModel,
  };
}

// Build MiniMax-specific request body (different from OpenAI format)
function buildMinimaxBody(messages: ChatMessage[], model: string, maxTokens: number, temperature: number) {
  return {
    model,
    messages: messages.map(m => ({
      role: m.role === "system" ? "system" : m.role,
      content: typeof m.content === "string" ? m.content : m.content.map(p => p.type === "text" ? p.text : "").join("\n"),
    })),
    max_tokens: maxTokens,
    temperature,
    stream: true,
  };
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
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body", requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    if (!requestBody || typeof requestBody !== "object") {
      return new Response(
        JSON.stringify({ error: "Request body must be an object", requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    const { messages, model, maxTokens, temperature, provider: rawProvider } = requestBody as Record<string, unknown>;

    // Validate provider
    const provider = typeof rawProvider === "string" && ALLOWED_PROVIDERS.includes(rawProvider) ? rawProvider : "lovable";

    // Validate messages
    const messagesValidation = validateMessages(messages);
    if (!messagesValidation.valid) {
      return new Response(
        JSON.stringify({ error: messagesValidation.error, requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    // Validate model against provider
    const modelValidation = validateModel(model, provider);
    if (!modelValidation.valid) {
      return new Response(
        JSON.stringify({ error: modelValidation.error, requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    const maxTokensValidation = validateMaxTokens(maxTokens);
    if (!maxTokensValidation.valid) {
      return new Response(
        JSON.stringify({ error: maxTokensValidation.error, requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    const temperatureValidation = validateTemperature(temperature);
    if (!temperatureValidation.valid) {
      return new Response(
        JSON.stringify({ error: temperatureValidation.error, requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    // Get provider config (pass user-provided key if present)
    const userProviderKey = req.headers.get("X-Provider-Key") || undefined;
    const providerConfig = getProviderConfig(provider, (model as string) || "", userProviderKey);
    if (!providerConfig) {
      console.error({ requestId, action: "ai_chat_error", error: `Provider "${provider}" not configured` });
      return new Response(
        JSON.stringify({ error: `AI provider "${provider}" is not configured. Check API key.`, requestId }),
        { status: 500, headers: responseHeaders() }
      );
    }

    const messageCount = (messages as ChatMessage[]).length;
    const hasMultimodal = (messages as ChatMessage[]).some(m => Array.isArray(m.content));

    console.log({
      requestId,
      timestamp: new Date().toISOString(),
      action: "ai_chat_request",
      provider,
      model: providerConfig.effectiveModel,
      token_limit: maxTokensValidation.value,
      temperature: temperatureValidation.value,
      message_count: messageCount,
      multimodal: hasMultimodal,
    });

    // Build request body (MiniMax has different format)
    const body = provider === "minimax"
      ? buildMinimaxBody(messages as ChatMessage[], providerConfig.effectiveModel, maxTokensValidation.value, temperatureValidation.value)
      : {
          model: providerConfig.effectiveModel,
          messages: messages as ChatMessage[],
          max_tokens: maxTokensValidation.value,
          temperature: temperatureValidation.value,
          stream: true,
        };

    const response = await fetch(providerConfig.apiUrl, {
      method: "POST",
      headers: providerConfig.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error({ requestId, action: "ai_chat_gateway_error", provider, status: response.status, error: errorText });
      
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

    console.log({ requestId, action: "ai_chat_streaming_start", provider, multimodal: hasMultimodal });

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
