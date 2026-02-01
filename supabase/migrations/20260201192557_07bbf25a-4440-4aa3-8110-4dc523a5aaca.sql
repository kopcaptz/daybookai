-- ═══════════════════════════════════════════════════════════════
-- Ethereal Layer v5: Tables, RPC, RLS
-- ═══════════════════════════════════════════════════════════════

-- ethereal_rooms (без channel_key — он сессионный)
CREATE TABLE ethereal_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_hash TEXT NOT NULL UNIQUE,
  name TEXT DEFAULT 'Ethereal Room',
  member_limit INTEGER DEFAULT 5,
  owner_member_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ethereal_rooms_pin_hash ON ethereal_rooms(pin_hash);

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

CREATE INDEX idx_ethereal_members_room ON ethereal_room_members(room_id);

-- ethereal_sessions (сессионный channelKey)
CREATE TABLE ethereal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES ethereal_rooms(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES ethereal_room_members(id) ON DELETE CASCADE,
  channel_key TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ethereal_sessions_member ON ethereal_sessions(member_id);
CREATE INDEX idx_ethereal_sessions_expires ON ethereal_sessions(expires_at);

-- ethereal_messages
CREATE TABLE ethereal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES ethereal_rooms(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES ethereal_room_members(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ethereal_messages_room_time ON ethereal_messages(room_id, created_at DESC);

-- ethereal_chronicles
CREATE TABLE ethereal_chronicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES ethereal_rooms(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES ethereal_room_members(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ethereal_chronicles_room ON ethereal_chronicles(room_id, created_at DESC);

-- ethereal_tasks
CREATE TABLE ethereal_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES ethereal_rooms(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES ethereal_room_members(id),
  assignee_id UUID REFERENCES ethereal_room_members(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ethereal_tasks_room ON ethereal_tasks(room_id);
CREATE INDEX idx_ethereal_tasks_status ON ethereal_tasks(room_id, status);

-- ethereal_calendar_events
CREATE TABLE ethereal_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES ethereal_rooms(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES ethereal_room_members(id),
  title TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  all_day BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ethereal_events_room_date ON ethereal_calendar_events(room_id, start_at);

-- ═══════════════════════════════════════════════════════════════
-- RLS: Deny All (доступ только через Edge Functions)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE ethereal_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethereal_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethereal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethereal_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethereal_chronicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethereal_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethereal_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all direct access" ON ethereal_rooms FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "Deny all direct access" ON ethereal_room_members FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "Deny all direct access" ON ethereal_sessions FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "Deny all direct access" ON ethereal_messages FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "Deny all direct access" ON ethereal_chronicles FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "Deny all direct access" ON ethereal_tasks FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "Deny all direct access" ON ethereal_calendar_events FOR ALL USING (false) WITH CHECK (false);

-- ═══════════════════════════════════════════════════════════════
-- RPC: ethereal_join_room (атомарный join с cleanup)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION ethereal_join_room(
  p_room_id UUID,
  p_device_id TEXT,
  p_display_name TEXT,
  p_channel_key TEXT,
  p_ttl_seconds INTEGER DEFAULT 604800
) RETURNS TABLE (
  member_id UUID,
  session_id UUID,
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
  
  -- A.1: CLEANUP expired sessions для комнаты
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
    
    -- B.3: Cleanup expired sessions для этого member
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
        LIMIT 2
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