# DaybookAI Security Audit — HIGH/CRITICAL Findings

- **Part A** — AI edge functions (`verify_jwt=false`), public ingest endpoints, client secrets, diary sync/RLS/storage.
- **Part B** — Admin PIN / auth edge functions and admin client token handling.

---

## 1. Unauthenticated paid AI proxy (cost abuse)

| Field | Value |
| --- | --- |
| **Severity** | CRITICAL |
| **Location** | `supabase/config.toml` (and representative handler `supabase/functions/ai-chat/index.ts`) |
| **Impact** | Anyone who can reach the project functions URL can burn `LOVABLE_API_KEY` credits (chat, vision, OCR, transcription, biography, weekly insights, whisper, test). No per-user auth, no PIN check, no rate limit on AI handlers. |

### Attack path

1. Read production project URL / anon key from committed `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) or from the shipped client.
2. Note `supabase/config.toml` disables JWT verification for AI functions (`verify_jwt = false`).
3. `POST` to `https://<project>.supabase.co/functions/v1/ai-chat` (and siblings) with `apikey` / `Authorization: Bearer <anon>` as required by the gateway.
4. Handler uses server-side `Deno.env.get("LOVABLE_API_KEY")` and streams/proxies the paid Lovable gateway — no user session, no `x-ai-token` validation.

### Auth confirmation

- Gateway: `verify_jwt = false` for `ai-chat`, `ai-biography`, `ai-entry-analyze`, `ai-receipt`, `ai-test`, `ai-whisper`, `ai-weekly-insights`, `ai-transcribe` (`supabase/config.toml` lines 4–25, 78–79).
- Handler: `ai-chat/index.ts` has CORS + input validation only; no JWT/PIN/token check before `fetch(providerConfig.apiUrl, …)` (lines 280–392).
- Client: `src/lib/aiUtils.ts` `getAITokenHeader()` only optionally sets `X-Provider-Key`; it never sends an AI access token (lines 10–19).
- Orphan control: `ai-pin-verify` issues tokens, but no AI function reads `x-ai-token`.

### Evidence lines

- `supabase/config.toml:4-25,78-79` — `verify_jwt = false`
- `supabase/functions/ai-chat/index.ts:253-277` — loads `LOVABLE_API_KEY`
- `supabase/functions/ai-chat/index.ts:280-392` — no auth; proxies to gateway
- `src/lib/aiUtils.ts:10-19` — no AI token header
- Same pattern: `ai-biography`, `ai-entry-analyze`, `ai-receipt`, `ai-test`, `ai-transcribe`, `ai-whisper`, `ai-weekly-insights`

### Remediation

1. Set `verify_jwt = true` **or** enforce a shared secret / validated AI session token on every AI handler before any upstream call.
2. Wire `x-ai-token` (from `ai-pin-verify`) into all AI endpoints with HMAC verify + expiry; reject missing/invalid tokens.
3. Add per-IP and per-user rate limits, max concurrent streams, and spend caps on Lovable usage.
4. Prefer requiring an authenticated Supabase user JWT bound to the caller.

---

## 2. Unauthenticated multimodal / high-cost AI endpoints

| Field | Value |
| --- | --- |
| **Severity** | CRITICAL |
| **Location** | `supabase/functions/ai-receipt/index.ts` (also `ai-transcribe`, `ai-chat` vision) |
| **Impact** | Vision OCR and audio transcription are among the most expensive calls; unbounded unauthenticated use amplifies finding #1 into rapid bill exhaustion. |

### Attack path

1. Same unauthenticated access as finding #1.
2. `POST /functions/v1/ai-receipt` with a `data:image/...;base64,...` body (up to ~4MB base64) → Gemini Pro vision via Lovable (`ai-receipt/index.ts` ~258–395).
3. `POST /functions/v1/ai-transcribe` multipart audio up to 25MB → multimodal model (`ai-transcribe/index.ts` 76–167).
4. `POST /functions/v1/ai-chat` with `image_url` `https://...` or large data URLs (`ai-chat/index.ts` 108–125, 388–392).

### Auth confirmation

No auth in these handlers; `verify_jwt = false`. Origin allowlists are not auth (`isAllowedOrigin`: missing `Origin` returns `true`).

### Evidence lines

- `ai-receipt/index.ts:210-226,344-395` — POST handler → Lovable vision, no auth
- `ai-transcribe/index.ts:76-167` — 25MB audio, no auth
- `ai-chat/index.ts:108-125` — allows arbitrary `https://` image URLs forwarded to provider
- `ai-chat/index.ts:13-18` — null Origin treated as allowed

### Remediation

Same as #1, plus stricter size/rate limits on vision/audio; disallow arbitrary remote `https` image URLs (data URLs only or allowlisted hosts).

---

## 3. Production Supabase anon credentials committed to git

| Field | Value |
| --- | --- |
| **Severity** | HIGH |
| **Location** | `.env` |
| **Impact** | Documents the live project (`feufqhnajidhqkxxddfc`) and publishable anon JWT in source control. Combined with `verify_jwt=false` AI/ingest functions, this removes any obscurity and makes abuse trivial. (Anon keys are client-visible by design; committing them still pins attackers to production and proves they are not rotated/separated.) |

### Attack path

1. `git show HEAD:.env` → `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.
2. Key JWT payload `role=anon`, `ref=feufqhnajidhqkxxddfc` (production project; matches `config.toml` `project_id`).
3. Use key as `apikey` against `/functions/v1/*` endpoints above.

### Evidence

- `.env` is **git-tracked** (`git ls-files .env`); **not** listed in `.gitignore`.
- Names present: `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY` (JWT-shaped, length 208), `VITE_SUPABASE_URL` (supabase.co host).
- `src/integrations/supabase/client.ts:5-11` — client constructed from those env vars.
- No `service_role` / `LOVABLE_API_KEY` / PIN values found hardcoded in TS sources (those are `Deno.env.get` only).

### Remediation

1. Remove `.env` from git history; add `.env` to `.gitignore`; use `.env.example` with placeholders only.
2. Rotate the anon key / review project keys if this repo is or was public.
3. Separate preview vs production projects; never commit production publishable keys to app repos that also disable function JWT checks.

---

## 4. Unauthenticated crash-report / feedback / analytics write (service_role bypass)

| Field | Value |
| --- | --- |
| **Severity** | HIGH |
| **Location** | `supabase/functions/crash-report/index.ts` |
| **Impact** | Unauthenticated writers insert/update via **service_role**, bypassing RLS. Crash endpoint accepts an unbounded `reports[]` array (only per-field string slices). Feedback accepts up to 5MB images into storage. Enables DB/storage cost DoS and spam that admins must triage. |

### Attack path

1. `config.toml` sets `verify_jwt = false` for `crash-report`, `feedback-submit`, `analytics-submit`.
2. Handlers create Supabase clients with `SUPABASE_SERVICE_ROLE_KEY` and insert without caller auth.
3. Crash: `POST` `{ "reports": [ /* thousands of objects */ ] }` → loop insert/update (`crash-report/index.ts` 39–119). No max array length.
4. Feedback: `POST` multipart with message + image → storage `feedback-attachments` + `feedback` row (`feedback-submit/index.ts` 25–116).
5. Analytics: unbounded metric JSON upserts into `usage_analytics`.

### Auth confirmation

No auth/secret on these three. CORS `Access-Control-Allow-Origin: *`.

### Evidence lines

- `supabase/config.toml:45-49` — `verify_jwt = false`
- `crash-report/index.ts:51-54,59-119` — service_role; unbounded loop
- `feedback-submit/index.ts:77-116` — service_role upload/insert
- `analytics-submit/index.ts:61-127` — service_role upsert

### Remediation

1. Require app attestation secret, signed device token, or authenticated user for ingest.
2. Cap `reports.length`, body size, and requests/IP; reject oversized batches early.
3. Prefer inserts as `anon` with narrow INSERT-only RLS instead of service_role if possible.

---

## 5. (Not vulnerable) cleanup-revisions unauthenticated delete

| Field | Value |
| --- | --- |
| **Severity** | N/A — mitigated |
| **Location** | `supabase/functions/cleanup-revisions/index.ts` |
| **Notes** | Requires `Authorization: Bearer ${CRON_SECRET}` (lines 28–46). Not listed with `verify_jwt = false` in `config.toml` (defaults to JWT verify). Not an open delete endpoint. |

---

## 6. (Not confirmed) Diary sync IDOR

| Field | Value |
| --- | --- |
| **Severity** | N/A — no HIGH IDOR confirmed |
| **Location** | `supabase/migrations/20260207201703_48af2d48-d677-4826-9b64-8c0c982473a5.sql` |
| **Notes** | RLS: `auth.uid() = user_id` for SELECT/INSERT/UPDATE/DELETE on `diary_entries` and `diary_attachments`. Storage `diary-media` policies require `auth.uid()::text = (storage.foldername(name))[1]`. Client `syncService.ts` always scopes queries with session `userId`. Account-switch guard is local-only UX, not a server control — but server RLS still holds. |

---

## Related note (orphaned AI PIN)

`ai-pin-verify` + UI copy imply a 4-digit AI PIN gate, but AI handlers never validate issued tokens. Treat as a broken control contributing to findings #1–#2. The PIN verify endpoint’s rate limit is also broken (see Admin finding A1); do not treat it as effective anti-bruteforce.

---

# Part B — Admin PIN / auth edge functions

Scope: `admin-pin-verify`, `admin-ai-pin-manage`, `admin-analytics-summary`, `admin-crashes-list`, `admin-crashes-update`, `admin-feedback-list`, `admin-feedback-update`, `admin-system-health`, plus `src/lib/adminTokenService.ts`, `src/hooks/useAdminAccess.ts`, `src/pages/Admin*.tsx`. All listed admin functions have `verify_jwt = false` in `supabase/config.toml` (lines 30–58).

## Auth model confirmation (not a finding)

| Control | Status | Evidence |
| --- | --- | --- |
| Admin token generation | HMAC-SHA256 over `btoa(JSON.stringify({iat, exp, type:"admin"}))` using `AI_TOKEN_SECRET`; 24h TTL | `admin-pin-verify/index.ts:140-161,283-285` |
| Admin token validation | Signature verify + `exp` + `type === "admin"` on every admin data plane function | e.g. `admin-feedback-list/index.ts:34-62,98-114`; same pattern in crashes/analytics/system-health/ai-pin-manage |
| AI → admin escalation | Blocked: AI tokens omit `type:"admin"` (`ai-pin-verify/index.ts:171`); admin verifiers require it | type check fails closed |
| Token forgery without secret | Not feasible: unsigned / wrong-HMAC / expired tokens rejected | `crypto.subtle.verify` then expiry |
| Missing auth on admin list/update | Not confirmed: all seven non-login admin functions require `x-admin-token` | see each handler’s early 401 path |
| Hardcoded ADMIN_PIN | Not found in sources; loaded via `Deno.env.get("ADMIN_PIN")` | `admin-pin-verify/index.ts:233` |
| Feedback/crash IDOR (unauth) | Not confirmed: service_role access only after admin token; RLS denies direct client access | migrations + handler token gates |
| Client route guards | UI-only (`useAdminAccess` / localStorage); server still enforces HMAC | `adminTokenService.ts:8-26` |

---

## A1. Admin PIN rate limit race clears blocks (unbounded brute force)

| Field | Value |
| --- | --- |
| **Severity** | CRITICAL |
| **Location** | `supabase/functions/admin-pin-verify/index.ts` |
| **Impact** | The only server-side anti-bruteforce control on `ADMIN_PIN` can be defeated with concurrent requests. A correct guess yields a 24h `type:"admin"` HMAC token usable on every admin endpoint (feedback + signed image URLs, crashes, analytics, system health, AI PIN rotate/disclose). Admin login UI allows PINs up to 10 characters (`AdminLoginPage.tsx:78`), so the secret is a low-entropy PIN by design. |

### Attack path

1. Discover project URL + anon/publishable key from the shipped client (or committed `.env` — Part A finding #3).
2. `POST /functions/v1/admin-pin-verify` with `verify_jwt = false` (`config.toml:30-31`). Omit `Origin` → origin check allows (`isAllowedOrigin`: null origin returns `true`, lines 15–16).
3. Flood parallel guesses. `recordFailedAttempt` does non-atomic read → increment → upsert (lines 95–118). A worker that observed a stale `fail_count < 4` upserts `blocked_until: null`, **clearing** a block another worker just wrote when `newCount >= 5`.
4. `checkRateLimit` only denies when `blocked_until` is in the future (lines 70–75); it never treats a high `fail_count` alone as blocked (line 86 always `allowed: true` otherwise). Cleared / never-stuck blocks ⇒ unlimited attempts.
5. On match, handler issues admin token (lines 283–297). Caller sets `x-admin-token` and reads/updates `feedback`, `crash_reports`, `usage_analytics`, regenerates AI PIN in plaintext (`admin-ai-pin-manage` POST returns `pin`).

### Evidence lines

- `admin-pin-verify/index.ts:34-37` — `MAX_ATTEMPTS: 5`, 15-minute block
- `admin-pin-verify/index.ts:70-86` — gate is only `blocked_until`; otherwise allow
- `admin-pin-verify/index.ts:95-118` — TOCTOU increment; `blocked_until` set to **`null`** whenever local `newCount < 5` (overwrites peer’s block)
- `admin-pin-verify/index.ts:15-16,187-194` — missing Origin allowed; JWT not required
- `admin-pin-verify/index.ts:140-161,283-297` — success → HMAC admin token 24h
- `AdminLoginPage.tsx:78` — `maxLength={10}` (PIN-sized secret)
- Downstream auth is real but useless once PIN is guessed: `admin-feedback-list/index.ts:98-114`, `admin-crashes-update/index.ts:96-112`, `admin-ai-pin-manage/index.ts:114-132`

### Remediation

1. Replace read/upsert with a single atomic SQL function (e.g. `INSERT … ON CONFLICT DO UPDATE … RETURNING` that increments and sets `blocked_until` only via `GREATEST`/conditional SQL so concurrent writers cannot null out an existing block).
2. In `checkRateLimit`, also deny when `fail_count >= MAX_ATTEMPTS` even if `blocked_until` is null; never upsert `blocked_until: null` unless explicitly unblocking after success or expiry.
3. Prefer a stronger admin secret (not a short PIN), progressive delays, and/or CAPTCHA; bind tokens to a server-side session row that can be revoked.
4. Optionally use platform-trusted client IP (`X-Real-IP` or rightmost `X-Forwarded-For`) — code currently takes leftmost XFF (`getClientIdentifier` lines 48–51), which is unsafe if the gateway appends rather than overwrites.

---

## A2. (Not confirmed as separate HIGH) Leftmost X-Forwarded-For identifier

| Field | Value |
| --- | --- |
| **Severity** | N/A — not confirmed exploitable on managed Supabase alone |
| **Location** | `supabase/functions/admin-pin-verify/index.ts:48-51` |
| **Notes** | Identifier = first hop of `X-Forwarded-For`. That pattern is a classic spoof sink when proxies **append**. Live behavior on Supabase has conflicting reports (append vs overwrite). Without a confirmed spoof on this project’s ingress, not filed as a standalone HIGH; still fix per A1 remediation #4. Same helper exists in `ai-pin-verify`. |

---

## A3. (Not confirmed) Admin feedback/crash IDOR

After a valid admin token, list/update operate globally via service_role by design (single-tenant admin portal). Unauthenticated callers receive 401. No cross-user IDOR without first obtaining an admin token (A1).
