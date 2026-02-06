
# План: Добавление документации о модели безопасности Ethereal Layer

## Цель
Добавить подробные комментарии-документацию в ключевые файлы Ethereal Layer, объясняющие модель безопасности "Full Isolation" для будущих разработчиков и аудиторов безопасности.

## Контекст проблемы
Инструменты автоматического сканирования безопасности часто выдают ложноположительные срабатывания для таблиц Ethereal Layer (ethereal_messages, ethereal_chronicles, ethereal_tasks и др.), поскольку они не распознают архитектурный паттерн "Deny all direct access + Edge Function proxy".

## Что будет добавлено

### 1. Документация в Edge Functions (серверная часть)

Добавлю JSDoc-блок в начало каждой Ethereal Edge Function с описанием:

**supabase/functions/ethereal_messages/index.ts:**
```typescript
/**
 * ETHEREAL LAYER SECURITY MODEL
 * =============================
 * 
 * ARCHITECTURE: "Full Isolation" (Deny All Direct Access)
 * 
 * This function is part of the Ethereal Layer - a privacy-focused shared space
 * for partners that operates independently from Supabase Auth.
 * 
 * SECURITY LAYERS:
 * 1. DATABASE RLS: All ethereal_* tables have RESTRICTIVE policies with USING(false)
 *    blocking 100% of direct client queries (anon/authenticated roles).
 * 
 * 2. EDGE FUNCTION PROXY: All data access is routed through this function
 *    using service_role which bypasses RLS by design.
 * 
 * 3. HMAC TOKEN VALIDATION: Every request requires X-Ethereal-Token header
 *    containing a cryptographically signed payload with sessionId, roomId, memberId.
 * 
 * 4. SESSION REVOCATION: Beyond token signature verification, we check
 *    ethereal_sessions table to ensure the session hasn't been revoked (kicked).
 * 
 * WHY NOT auth.uid():
 * - Ethereal Layer uses device-based sessions, not Supabase Auth
 * - Partners share a room via PIN code without creating accounts
 * - Standard RLS patterns like room_id IN (SELECT ... WHERE member_id = auth.uid())
 *   are inapplicable here
 * 
 * FALSE POSITIVE SECURITY REPORTS:
 * Reports claiming this table is "publicly readable" are incorrect.
 * Direct SELECT/INSERT/UPDATE/DELETE from anon or authenticated roles
 * will always fail due to RESTRICTIVE RLS policies.
 */
```

**supabase/functions/ethereal_join/index.ts:**
```typescript
/**
 * ETHEREAL JOIN - Session Creation Endpoint
 * ==========================================
 * 
 * This is the ONLY entry point to the Ethereal Layer.
 * 
 * SECURITY FLOW:
 * 1. Client provides: PIN (shared secret), deviceId, displayName
 * 2. PIN is hashed with ETHEREAL_PIN_SALT (never stored in plain text)
 * 3. Room lookup/creation via pin_hash
 * 4. Session creation with 256-bit channelKey for Realtime broadcasts
 * 5. HMAC token generation with ETHEREAL_TOKEN_SECRET
 * 
 * The returned accessToken is required for ALL subsequent Ethereal operations.
 * Without valid token -> 401 Unauthorized from Edge Functions.
 * Without valid session in DB -> 401 "session_revoked" (supports instant kick).
 */
```

Аналогичные блоки добавлю в:
- ethereal_chronicles/index.ts
- ethereal_tasks/index.ts
- ethereal_members/index.ts
- ethereal_games/index.ts

### 2. Документация в клиентской части

**src/lib/etherealTokenService.ts:**
```typescript
/**
 * ETHEREAL TOKEN SERVICE
 * ======================
 * 
 * SECURITY MODEL: Device-based sessions with HMAC tokens
 * 
 * This service manages client-side storage of Ethereal session credentials.
 * The token stored here is an HMAC-signed payload containing:
 * - roomId: which room the session belongs to
 * - memberId: which member identity this device uses
 * - sessionId: database session ID (for revocation support)
 * - exp: expiration timestamp (7 days from creation)
 * 
 * IMPORTANT SECURITY NOTES:
 * 1. Token stored in localStorage - provides session persistence across reloads
 * 2. Token is validated server-side on EVERY API call (Edge Functions)
 * 3. Even with valid token signature, server checks ethereal_sessions table
 *    to ensure session hasn't been revoked (kicked by room owner)
 * 4. channelKey (256-bit) is used for Supabase Realtime channel names,
 *    preventing unauthorized subscription to private room broadcasts
 * 
 * This is NOT admin/role-based access control - it's a symmetric shared
 * secret system for partner pairs. Both partners have equal access.
 */
```

**src/lib/etherealDb.ts:**
```typescript
/**
 * ETHEREAL DATABASE (IndexedDB via Dexie)
 * =======================================
 * 
 * DATA ISOLATION: Completely separate from main app data (DaybookDB)
 * 
 * This database stores local copies of Ethereal Layer data:
 * - messages: Chat history (synced from server)
 * - chronicles: Shared notes/documents
 * - tasks: Shared todo items
 * - events: Shared calendar events
 * - members: Cached member info
 * 
 * SECURITY NOTES:
 * 1. All data here mirrors server state - source of truth is Supabase
 * 2. Server data is protected by RLS (USING false) + Edge Function proxy
 * 3. Local data is protected by browser same-origin policy
 * 4. clearEtherealData() removes all local data on session end
 * 
 * This separation ensures Ethereal Layer data never mixes with
 * personal diary entries in the main application database.
 */
```

### 3. Markdown-документация (опционально)

Создам файл **docs/ETHEREAL_SECURITY.md** с полным описанием архитектуры для будущих разработчиков и security-аудиторов.

## Файлы для изменения

| Файл | Изменение |
|------|-----------|
| supabase/functions/ethereal_messages/index.ts | Добавить JSDoc-блок о Security Model |
| supabase/functions/ethereal_join/index.ts | Добавить JSDoc-блок о Session Creation |
| supabase/functions/ethereal_chronicles/index.ts | Добавить JSDoc-блок о Security Model |
| supabase/functions/ethereal_tasks/index.ts | Добавить JSDoc-блок о Security Model |
| supabase/functions/ethereal_members/index.ts | Добавить JSDoc-блок о Security Model |
| supabase/functions/ethereal_games/index.ts | Добавить JSDoc-блок о Security Model |
| src/lib/etherealTokenService.ts | Добавить JSDoc-блок о Token Management |
| src/lib/etherealDb.ts | Добавить JSDoc-блок о Data Isolation |

## Критерий готовности

- Все Ethereal Edge Functions содержат блок документации о модели безопасности
- Клиентские файлы etherealTokenService.ts и etherealDb.ts содержат блоки документации
- Комментарии объясняют, почему отчёты о "публичной доступности" таблиц являются ложноположительными

## Технические детали

Документация будет написана на английском языке (стандарт для кода) и включает:
- Название архитектурного паттерна: "Full Isolation" / "Deny All Direct Access"
- Описание 4-х уровней защиты: RLS, Edge Proxy, HMAC Token, Session Revocation
- Объяснение, почему auth.uid() неприменим (device-based sessions)
- Инструкции для security-аудиторов о том, как верифицировать безопасность
