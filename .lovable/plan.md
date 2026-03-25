

# Adding AI Providers: OpenRouter and MiniMax

## Current Architecture

The app routes all AI through the `ai-chat` Edge Function, which currently supports two backends:
1. **Lovable AI Gateway** (via `LOVABLE_API_KEY`) — primary
2. **OpenRouter** (via `VITE_AI_API_KEY`) — fallback only

The user selects a **profile** (economy/fast/balanced/quality), not a provider or model directly. There is no UI for choosing a provider.

## Proposed Design

Add a **provider** layer between profiles and models. The user picks a provider in Settings, profiles map to provider-specific models automatically.

```text
Settings UI:
  ┌─────────────────────────┐
  │ Provider:               │
  │ [Lovable] [OpenRouter] [MiniMax] │
  │                         │
  │ Profile: [Balanced ▼]   │
  │ Model:   gemini-2.5-flash (auto) │
  └─────────────────────────┘
```

## Changes

### 1. New secret: `MINIMAX_API_KEY`
- Add via `add_secret` tool
- User provides their MiniMax API key

### 2. `src/lib/aiConfig.ts` — Add provider concept
- New type `AIProvider = 'lovable' | 'openrouter' | 'minimax'`
- Provider-to-model mapping per profile:
  - **Lovable**: `gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-pro` (current)
  - **OpenRouter**: `google/gemini-2.5-flash-lite`, `anthropic/claude-sonnet-4`, `anthropic/claude-opus-4` (or user preference)
  - **MiniMax**: `MiniMax-M1`, `MiniMax-M1-80B` (MiniMax model names)
- Add `provider: AIProvider` to `AISettings` (default: `'lovable'`)
- Client sends `{ provider, model, ... }` to edge function

### 3. `supabase/functions/ai-chat/index.ts` — Multi-provider routing
- Accept `provider` field in request body
- Route to correct API:
  - `lovable` → `https://ai.gateway.lovable.dev/v1/chat/completions` + `LOVABLE_API_KEY`
  - `openrouter` → `https://openrouter.ai/api/v1/chat/completions` + `VITE_AI_API_KEY`
  - `minimax` → `https://api.minimaxi.chat/v1/text/chatcompletion_v2` + `MINIMAX_API_KEY`
- Expand `ALLOWED_MODELS` whitelist to include OpenRouter and MiniMax model IDs
- Each provider has its own request format adapter (MiniMax uses different payload structure)

### 4. `src/components/AISettingsCard.tsx` — Provider selector UI
- Add a row of 3 toggle buttons for provider selection above profile selector
- Show provider-specific model names in profile buttons
- Disable providers whose API keys are not configured (test via `ai-test` endpoint)

### 5. `supabase/functions/ai-test/index.ts` — Test all providers
- Accept `provider` field, test connectivity for the specified provider
- Return which providers are available

### 6. Update other Edge Functions
- `ai-whisper`, `ai-entry-analyze`, `ai-biography`, `ai-weekly-insights` — add provider routing if they should also support multi-provider (or keep them on Lovable-only for simplicity)

## Key Decision

Before implementing, one clarification:

- **OpenRouter** uses the OpenAI-compatible API — straightforward
- **MiniMax** has a different API format (different payload structure, auth header). Which MiniMax models do you want? Their `MiniMax-M1` chat model, or specific ones like `abab7-chat`?

## Estimated Scope
- 5 files modified, 1 secret added
- ~200 lines of new/changed code

