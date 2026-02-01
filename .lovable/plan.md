

# Эфирный Слой v5 — Финальный план (GO)

## Изменения v4 → v5

| Пункт | Проблема v4 | Исправление v5 |
|-------|-------------|----------------|
| **A.1 (обязательно)** | ethereal_sessions не чистятся по TTL | DELETE expired в RPC join |
| B.2 | HMAC токен не проверяется на sessionId | sessionId в токене + server check |
| B.3 | Нет лимита сессий на member | Max 3 активных сессий |
| B.4 | channelKey 16 bytes (комментарий 32) | 32 bytes (256-bit) |
| B.5 | useSecretGesture: нет pointer capture | setPointerCapture + release |
| B.6 | loadHistory зависит от roomId | Зависит от channelKey |
| B.7 | Foreign table alias капризный | `sender:ethereal_room_members!sender_id(...)` |

---

## Часть 1: Обновлённый RPC ethereal_join_room

```sql
CREATE OR REPLACE FUNCTION ethereal_join_room(
  p_room_id UUID,
  p_device_id TEXT,
  p_display_name TEXT,
  p_channel_key TEXT,
  p_ttl_seconds INTEGER DEFAULT 604800  -- 7 days
) RETURNS TABLE (
  member_id UUID,
  session_id UUID,       -- Для включения в HMAC токен
  is_new BOOLEAN,
  current_count INTEGER,
  is_owner BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id UUID;
  v_session_id UUID;
  v_current_count INTEGER;
  v_limit INTEGER;
  v_is_new BOOLEAN := false;
  v_is_owner BOOLEAN := false;
  v_owner_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Advisory lock по room_id (атомарность)
  PERFORM pg_advisory_xact_lock(hashtext(p_room_id::text));
  
  -- ═══════════════════════════════════════════════════════════════
  -- A.1: CLEANUP expired sessions (обязательная правка!)
  -- ═══════════════════════════════════════════════════════════════
  DELETE FROM ethereal_sessions
  WHERE room_id = p_room_id
    AND expires_at < now();
  
  -- CLEANUP: удалить неактивных участников (> 30 дней)
  DELETE FROM ethereal_room_members
  WHERE room_id = p_room_id
    AND last_seen_at < now() - INTERVAL '30 days';
  
  -- Проверить существующего участника
  SELECT id INTO v_member_id
  FROM ethereal_room_members
  WHERE room_id = p_room_id AND device_id = p_device_id;
  
  IF v_member_id IS NOT NULL THEN
    -- Существующий участник: обновить last_seen и display_name
    UPDATE ethereal_room_members
    SET last_seen_at = now(), display_name = p_display_name
    WHERE id = v_member_id;
    
    v_is_new := false;
    
    -- ═══════════════════════════════════════════════════════════════
    -- B.3: Cleanup expired sessions для этого member
    -- ═══════════════════════════════════════════════════════════════
    DELETE FROM ethereal_sessions
    WHERE member_id = v_member_id
      AND expires_at < now();
    
    -- Держать максимум 3 активных сессии (удалить старые)
    DELETE FROM ethereal_sessions
    WHERE member_id = v_member_id
      AND id NOT IN (
        SELECT id FROM ethereal_sessions
        WHERE member_id = v_member_id
        ORDER BY created_at DESC
        LIMIT 2  -- Оставим 2 + создадим 1 новую = 3 max
      );
      
  ELSE
    -- Новый участник: проверить лимит
    SELECT member_limit INTO v_limit FROM ethereal_rooms WHERE id = p_room_id;
    SELECT COUNT(*) INTO v_current_count FROM ethereal_room_members WHERE room_id = p_room_id;
    
    IF v_current_count >= v_limit THEN
      RAISE EXCEPTION 'room_full' USING ERRCODE = 'P0001';
    END IF;
    
    -- Вставить нового участника
    INSERT INTO ethereal_room_members (room_id, device_id, display_name)
    VALUES (p_room_id, p_device_id, p_display_name)
    RETURNING id INTO v_member_id;
    
    v_is_new := true;
    
    -- Если это первый участник — сделать owner
    IF v_current_count = 0 THEN
      UPDATE ethereal_rooms SET owner_member_id = v_member_id WHERE id = p_room_id;
    END IF;
  END IF;
  
  -- Проверить owner статус
  SELECT owner_member_id INTO v_owner_id FROM ethereal_rooms WHERE id = p_room_id;
  v_is_owner := (v_owner_id = v_member_id);
  
  -- Создать новую сессию с channelKey
  v_expires_at := now() + (p_ttl_seconds || ' seconds')::INTERVAL;
  
  INSERT INTO ethereal_sessions (room_id, member_id, channel_key, expires_at)
  VALUES (p_room_id, v_member_id, p_channel_key, v_expires_at)
  RETURNING id INTO v_session_id;
  
  -- Вернуть результат
  SELECT COUNT(*) INTO v_current_count FROM ethereal_room_members WHERE room_id = p_room_id;
  
  RETURN QUERY SELECT v_member_id, v_session_id, v_is_new, v_current_count, v_is_owner;
END;
$$;
```

---

## Часть 2: HMAC токен с sessionId (B.2)

### ethereal_join — генерация токена

```typescript
// supabase/functions/ethereal_join/index.ts

interface TokenPayload {
  roomId: string;
  memberId: string;
  sessionId: string;   // ← Добавлено для server-side validation
  iat: number;
  exp: number;
}

async function createEtherealToken(
  secret: string,
  roomId: string,
  memberId: string,
  sessionId: string,  // ← Включаем sessionId
  ttlMs: number
): Promise<{ token: string; expiresAt: number }> {
  const now = Date.now();
  const expiresAt = now + ttlMs;
  
  const payload: TokenPayload = {
    roomId,
    memberId,
    sessionId,  // ← В payload
    iat: now,
    exp: expiresAt,
  };
  
  const payloadBase64 = btoa(JSON.stringify(payload));
  
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadBase64));
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  return {
    token: `${payloadBase64}.${signatureBase64}`,
    expiresAt,
  };
}
```

### Все Edge Functions — проверка sessionId

```typescript
// supabase/functions/_shared/etherealAuth.ts

interface ValidatedSession {
  roomId: string;
  memberId: string;
  sessionId: string;
}

export async function validateEtherealToken(
  req: Request,
  supabase: SupabaseClient
): Promise<{ valid: true; session: ValidatedSession } | { valid: false; error: string }> {
  const token = req.headers.get('X-Ethereal-Token');
  if (!token) return { valid: false, error: 'missing_token' };
  
  const secret = Deno.env.get('ETHEREAL_TOKEN_SECRET');
  if (!secret) return { valid: false, error: 'server_error' };
  
  // 1. Verify HMAC signature
  const [payloadB64, signatureB64] = token.split('.');
  if (!payloadB64 || !signatureB64) return { valid: false, error: 'invalid_token' };
  
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  
  const signatureBytes = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(payloadB64));
  if (!valid) return { valid: false, error: 'invalid_signature' };
  
  // 2. Parse and check expiry
  const payload: TokenPayload = JSON.parse(atob(payloadB64));
  if (Date.now() > payload.exp) return { valid: false, error: 'token_expired' };
  
  // ═══════════════════════════════════════════════════════════════
  // B.2: Проверка sessionId в базе (для реального kick!)
  // ═══════════════════════════════════════════════════════════════
  const { data: session, error } = await supabase
    .from('ethereal_sessions')
    .select('id, room_id, member_id, expires_at')
    .eq('id', payload.sessionId)
    .single();
  
  if (error || !session) {
    return { valid: false, error: 'session_revoked' };  // Kick сработал!
  }
  
  if (new Date(session.expires_at) < new Date()) {
    return { valid: false, error: 'session_expired' };
  }
  
  if (session.room_id !== payload.roomId || session.member_id !== payload.memberId) {
    return { valid: false, error: 'session_mismatch' };
  }
  
  return {
    valid: true,
    session: {
      roomId: payload.roomId,
      memberId: payload.memberId,
      sessionId: payload.sessionId,
    }
  };
}
```

### Owner Kick — теперь реально работает

```typescript
// supabase/functions/ethereal_members/index.ts (DELETE)

// При kick:
// 1. Удалить member → CASCADE удалит все его sessions
// 2. Токены с этим sessionId станут невалидны при следующем запросе

async function handleKick(req: Request, supabase: SupabaseClient, ownerMemberId: string, roomId: string) {
  const { memberId: targetMemberId } = await req.json();
  
  // Проверить что запрашивающий — owner
  const { data: room } = await supabase
    .from('ethereal_rooms')
    .select('owner_member_id')
    .eq('id', roomId)
    .single();
  
  if (room.owner_member_id !== ownerMemberId) {
    return new Response(JSON.stringify({ error: 'not_owner' }), { status: 403 });
  }
  
  // Удалить member (CASCADE удалит sessions)
  await supabase
    .from('ethereal_room_members')
    .delete()
    .eq('id', targetMemberId)
    .eq('room_id', roomId);
  
  return Response.json({ success: true });
}
```

---

## Часть 3: channelKey 32 bytes (B.4)

```typescript
// supabase/functions/ethereal_join/index.ts

async function generateChannelKey(): Promise<string> {
  // ═══════════════════════════════════════════════════════════════
  // B.4: 32 bytes (256-bit) для консистентности
  // ═══════════════════════════════════════════════════════════════
  const bytes = new Uint8Array(32);  // 256 bits
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  // Результат: 64 hex символа
}
```

---

## Часть 4: useSecretGesture с pointer capture (B.5)

```typescript
// src/hooks/useSecretGesture.ts

interface UseSecretGestureOptions {
  onSuccess: () => void;
}

interface GestureState {
  phase: 'idle' | 'tapping' | 'holding' | 'swiping';
  tapCount: number;
  tapStartTime: number;
  holdStartTime: number;
  swipeStartY: number;
  holdTimer: NodeJS.Timeout | null;
  capturedPointerId: number | null;  // ← B.5
}

export function useSecretGesture({ onSuccess }: UseSecretGestureOptions) {
  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const stateRef = useRef<GestureState>({
    phase: 'idle',
    tapCount: 0,
    tapStartTime: 0,
    holdStartTime: 0,
    swipeStartY: 0,
    holdTimer: null,
    capturedPointerId: null,
  });
  const targetRef = useRef<HTMLElement | null>(null);
  
  const REQUIRED_TAPS = 5;
  const TAP_WINDOW_MS = 3000;
  const HOLD_DURATION_MS = 1500;
  const SWIPE_DISTANCE_PX = 100;
  
  const reset = useCallback(() => {
    const state = stateRef.current;
    if (state.holdTimer) clearTimeout(state.holdTimer);
    
    // ═══════════════════════════════════════════════════════════════
    // B.5: Release pointer capture
    // ═══════════════════════════════════════════════════════════════
    if (state.capturedPointerId !== null && targetRef.current) {
      try {
        targetRef.current.releasePointerCapture(state.capturedPointerId);
      } catch { /* ignore */ }
    }
    
    stateRef.current = {
      phase: 'idle',
      tapCount: 0,
      tapStartTime: 0,
      holdStartTime: 0,
      swipeStartY: 0,
      holdTimer: null,
      capturedPointerId: null,
    };
  }, []);
  
  const showNeutralEasterEgg = useCallback(() => {
    setShowEasterEgg(true);
    setTimeout(() => setShowEasterEgg(false), 500);
    reset();
  }, [reset]);
  
  const handlers = useMemo(() => ({
    onPointerDown: (e: React.PointerEvent) => {
      const state = stateRef.current;
      const now = Date.now();
      targetRef.current = e.currentTarget as HTMLElement;
      
      if (state.phase === 'idle' || state.phase === 'tapping') {
        // Проверить timeout окна тапов
        if (state.tapCount > 0 && now - state.tapStartTime > TAP_WINDOW_MS) {
          showNeutralEasterEgg();
          return;
        }
        
        state.phase = 'tapping';
        if (state.tapCount === 0) state.tapStartTime = now;
        state.tapCount++;
        
        if (state.tapCount >= REQUIRED_TAPS) {
          // Переход к фазе удержания
          state.phase = 'holding';
          state.holdStartTime = now;
          
          // ═══════════════════════════════════════════════════════════════
          // B.5: Capture pointer для надёжности на мобиле
          // ═══════════════════════════════════════════════════════════════
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
            state.capturedPointerId = e.pointerId;
          } catch { /* ignore */ }
          
          state.holdTimer = setTimeout(() => {
            state.phase = 'swiping';
            state.swipeStartY = 0; // Будет установлено в onPointerMove
          }, HOLD_DURATION_MS);
        }
      }
    },
    
    onPointerUp: (e: React.PointerEvent) => {
      const state = stateRef.current;
      
      if (state.phase === 'holding') {
        // Отпустили слишком рано
        showNeutralEasterEgg();
      } else if (state.phase === 'swiping') {
        // ═══════════════════════════════════════════════════════════════
        // B.5: Свайп не завершён — reset
        // ═══════════════════════════════════════════════════════════════
        showNeutralEasterEgg();
      }
    },
    
    onPointerMove: (e: React.PointerEvent) => {
      const state = stateRef.current;
      
      if (state.phase === 'swiping') {
        if (state.swipeStartY === 0) {
          state.swipeStartY = e.clientY;
        }
        
        const swipeDistance = e.clientY - state.swipeStartY;
        if (swipeDistance >= SWIPE_DISTANCE_PX) {
          // Успех!
          reset();
          onSuccess();
        }
      }
    },
    
    onPointerLeave: (e: React.PointerEvent) => {
      const state = stateRef.current;
      // Только если не захвачен pointer
      if (state.phase !== 'idle' && state.capturedPointerId !== e.pointerId) {
        showNeutralEasterEgg();
      }
    },
    
    onPointerCancel: () => {
      const state = stateRef.current;
      if (state.phase !== 'idle') {
        showNeutralEasterEgg();
      }
    },
  }), [onSuccess, reset, showNeutralEasterEgg]);
  
  const EasterEggAnimation = showEasterEgg ? (
    <div className="absolute inset-0 pointer-events-none animate-pulse-once opacity-50" />
  ) : null;
  
  return { handlers, EasterEggAnimation };
}
```

---

## Часть 5: useEtherealRealtime с правильными зависимостями (B.6, B.7)

```typescript
// src/hooks/useEtherealRealtime.ts

export function useEtherealRealtime(
  channelKey: string, 
  memberId: string, 
  displayName: string,
  roomId: string
) {
  const [messages, setMessages] = useState<EtherealMessage[]>([]);
  const [onlineMembers, setOnlineMembers] = useState<PresenceMember[]>([]);
  const [typingMembers, setTypingMembers] = useState<string[]>([]);
  
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  
  // ═══════════════════════════════════════════════════════════════
  // B.6: loadHistory зависит от channelKey (не только roomId)
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    loadHistory();
  }, [roomId, channelKey]);  // ← channelKey = новая сессия
  
  async function loadHistory() {
    const session = getEtherealSession();
    if (!session) return;
    
    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/ethereal_messages?limit=50`,
        { headers: { 'X-Ethereal-Token': session.token } }
      );
      
      if (response.status === 401 || response.status === 403) {
        // Сессия отозвана (kick) или истекла
        clearEtherealSession();
        // Trigger re-auth (через state или event)
        window.dispatchEvent(new CustomEvent('ethereal-session-expired'));
        return;
      }
      
      const data = await response.json();
      if (data.success) {
        const merged = await mergeMessages(data.messages);
        setMessages(merged);
      }
    } catch (error) {
      console.log('Load failed');  // Generic, без "ethereal"
    }
  }
  
  // ... остальной код канала остаётся
  
  // Throttled typing (400ms)
  const sendTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 400) return;
    if (!channelRef.current) return;
    
    lastTypingSentRef.current = now;
    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { memberId, displayName }
    });
  }, [memberId, displayName]);
  
  return { messages, onlineMembers, typingMembers, sendTyping, sendMessage };
}
```

---

## Часть 6: Edge Function handleList с правильным alias (B.7)

```typescript
// supabase/functions/ethereal_messages/index.ts

async function handleList(req: Request, supabase: SupabaseClient, roomId: string) {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const before = url.searchParams.get('before');
  
  // ═══════════════════════════════════════════════════════════════
  // B.7: Правильный alias для foreign table
  // ═══════════════════════════════════════════════════════════════
  let query = supabase
    .from('ethereal_messages')
    .select(`
      id,
      sender_id,
      content,
      created_at,
      sender:ethereal_room_members!sender_id(display_name)
    `)
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (before) {
    query = query.lt('created_at', new Date(parseInt(before)).toISOString());
  }
  
  const { data, error } = await query;
  if (error) throw error;
  
  return {
    success: true,
    messages: data.map(m => ({
      serverId: m.id,
      senderId: m.sender_id,
      senderName: m.sender?.display_name || 'Unknown',  // ← Правильный путь
      content: m.content,
      createdAtMs: Date.parse(m.created_at),
    })),
  };
}
```

---

## Часть 7: Supabase Schema (финальная)

```sql
-- ethereal_rooms (без channel_key)
CREATE TABLE ethereal_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_hash TEXT NOT NULL UNIQUE,
  name TEXT DEFAULT 'Ethereal Room',
  member_limit INTEGER DEFAULT 5,
  owner_member_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ethereal_room_members
CREATE TABLE ethereal_room_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES ethereal_rooms(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, device_id)
);

-- ethereal_sessions (сессионный channelKey)
CREATE TABLE ethereal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES ethereal_rooms(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES ethereal_room_members(id) ON DELETE CASCADE,
  channel_key TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ethereal_messages
CREATE TABLE ethereal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES ethereal_rooms(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES ethereal_room_members(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Индексы
CREATE INDEX idx_ethereal_rooms_pin_hash ON ethereal_rooms(pin_hash);
CREATE INDEX idx_ethereal_members_room ON ethereal_room_members(room_id);
CREATE INDEX idx_ethereal_sessions_member ON ethereal_sessions(member_id);
CREATE INDEX idx_ethereal_sessions_expires ON ethereal_sessions(expires_at);
CREATE INDEX idx_ethereal_messages_room_time ON ethereal_messages(room_id, created_at DESC);

-- RLS: Deny All
ALTER TABLE ethereal_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethereal_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethereal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethereal_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all" ON ethereal_rooms FOR ALL USING (false);
CREATE POLICY "Deny all" ON ethereal_room_members FOR ALL USING (false);
CREATE POLICY "Deny all" ON ethereal_sessions FOR ALL USING (false);
CREATE POLICY "Deny all" ON ethereal_messages FOR ALL USING (false);

-- Аналогично для chronicles, tasks, calendar_events
```

---

## Финальный чеклист v5

| Пункт | Статус |
|-------|--------|
| **A.1: Cleanup expired sessions в RPC** | ✅ |
| B.2: sessionId в HMAC токене | ✅ |
| B.2: Server-side проверка sessionId | ✅ |
| B.2: Kick реально отзывает доступ | ✅ |
| B.3: Лимит 3 сессии на member | ✅ |
| B.4: channelKey 32 bytes (256-bit) | ✅ |
| B.5: Pointer capture в gesture | ✅ |
| B.5: onPointerUp в swiping → reset | ✅ |
| B.6: loadHistory зависит от channelKey | ✅ |
| B.6: 401/403 → clearSession + event | ✅ |
| B.7: Правильный alias `sender:...` | ✅ |
| channelKey сессионный | ✅ |
| pin_hash UNIQUE | ✅ |
| Атомарный лимит (advisory lock) | ✅ |
| sendTyping throttle 400ms | ✅ |
| RLS deny all | ✅ |

---

## Секреты для добавления

| Secret Name | Описание |
|-------------|----------|
| `ETHEREAL_PIN_SALT` | Соль для SHA256 (min 32 chars) |
| `ETHEREAL_TOKEN_SECRET` | HMAC секрет (min 32 chars) |

---

## Порядок реализации

| # | Этап | Описание |
|---|------|----------|
| 1 | Секреты | ETHEREAL_PIN_SALT, ETHEREAL_TOKEN_SECRET |
| 2 | БД | Таблицы + RPC ethereal_join_room (с cleanup) |
| 3 | ethereal_join | Edge Function с sessionId в токене |
| 4 | _shared/etherealAuth | Валидация токена + sessionId check |
| 5 | etherealTokenService | Клиентский сервис |
| 6 | etherealDb + deviceId | Локальная Dexie |
| 7 | useSecretGesture | Хук с pointer capture |
| 8 | EtherealPinModal | Модал PIN + join flow |
| 9 | Routing /e/* | Gate + pages |
| 10 | .ethereal тема | CSS variables |
| 11 | ethereal_messages | Edge Function (с alias fix) |
| 12 | useEtherealRealtime | С channelKey зависимостью |
| 13 | ethereal_members | Owner kick (реально работает) |
| 14 | UI: 4 вкладки | Chat, Chronicles, Tasks, Calendar |

---

## Оценка

| Метрика | Значение |
|---------|----------|
| Время реализации | ~7-9 часов |
| Edge Functions | 6 |
| Таблицы Supabase | 7 |
| Секреты | 2 |
| Kick реально работает | ✅ |
| Session cleanup автоматический | ✅ |

