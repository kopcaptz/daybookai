-- Fix ambiguous member_id reference in ethereal_join_room function
-- Qualify all column references with table aliases

CREATE OR REPLACE FUNCTION public.ethereal_join_room(p_room_id uuid, p_device_id text, p_display_name text, p_channel_key text, p_ttl_seconds integer DEFAULT 604800)
 RETURNS TABLE(member_id uuid, session_id uuid, is_new boolean, current_count integer, is_owner boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  DELETE FROM ethereal_sessions es
  WHERE es.room_id = p_room_id
    AND es.expires_at < now();
  
  -- CLEANUP: удалить неактивных участников (> 30 дней)
  DELETE FROM ethereal_room_members erm
  WHERE erm.room_id = p_room_id
    AND erm.last_seen_at < now() - INTERVAL '30 days';
  
  -- Проверить существующего участника
  SELECT erm.id INTO v_member_id
  FROM ethereal_room_members erm
  WHERE erm.room_id = p_room_id AND erm.device_id = p_device_id;
  
  IF v_member_id IS NOT NULL THEN
    -- Существующий участник: обновить last_seen и display_name
    UPDATE ethereal_room_members erm
    SET last_seen_at = now(), display_name = p_display_name
    WHERE erm.id = v_member_id;
    
    v_is_new := false;
    
    -- B.3: Cleanup expired sessions для этого member
    DELETE FROM ethereal_sessions es
    WHERE es.member_id = v_member_id
      AND es.expires_at < now();
    
    -- Держать максимум 3 активных сессии (удалить старые)
    DELETE FROM ethereal_sessions es
    WHERE es.member_id = v_member_id
      AND es.id NOT IN (
        SELECT es2.id FROM ethereal_sessions es2
        WHERE es2.member_id = v_member_id
        ORDER BY es2.created_at DESC
        LIMIT 2
      );
      
  ELSE
    -- Новый участник: проверить лимит
    SELECT er.member_limit INTO v_limit FROM ethereal_rooms er WHERE er.id = p_room_id;
    SELECT COUNT(*) INTO v_current_count FROM ethereal_room_members erm WHERE erm.room_id = p_room_id;
    
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
      UPDATE ethereal_rooms er SET owner_member_id = v_member_id WHERE er.id = p_room_id;
    END IF;
  END IF;
  
  -- Проверить owner статус
  SELECT er.owner_member_id INTO v_owner_id FROM ethereal_rooms er WHERE er.id = p_room_id;
  v_is_owner := (v_owner_id = v_member_id);
  
  -- Создать новую сессию с channelKey
  v_expires_at := now() + (p_ttl_seconds || ' seconds')::INTERVAL;
  
  INSERT INTO ethereal_sessions (room_id, member_id, channel_key, expires_at)
  VALUES (p_room_id, v_member_id, p_channel_key, v_expires_at)
  RETURNING id INTO v_session_id;
  
  -- Вернуть результат
  SELECT COUNT(*) INTO v_current_count FROM ethereal_room_members erm WHERE erm.room_id = p_room_id;
  
  RETURN QUERY SELECT v_member_id, v_session_id, v_is_new, v_current_count, v_is_owner;
END;
$function$;