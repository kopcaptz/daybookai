-- Update RLS policies for ethereal_* tables to explicitly target anon, authenticated roles
-- This eliminates false positive security scanner warnings about "public access"

-- ethereal_calendar_events
DROP POLICY IF EXISTS "Deny all direct access" ON public.ethereal_calendar_events;
CREATE POLICY "Deny all direct access"
  ON public.ethereal_calendar_events
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ethereal_chronicle_revisions
DROP POLICY IF EXISTS "Deny all direct access" ON public.ethereal_chronicle_revisions;
CREATE POLICY "Deny all direct access"
  ON public.ethereal_chronicle_revisions
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ethereal_chronicles
DROP POLICY IF EXISTS "Deny all direct access" ON public.ethereal_chronicles;
CREATE POLICY "Deny all direct access"
  ON public.ethereal_chronicles
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ethereal_game_rounds
DROP POLICY IF EXISTS "Deny all direct access for ethereal_game_rounds" ON public.ethereal_game_rounds;
CREATE POLICY "Deny all direct access"
  ON public.ethereal_game_rounds
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ethereal_game_sessions
DROP POLICY IF EXISTS "Deny all direct access for ethereal_game_sessions" ON public.ethereal_game_sessions;
CREATE POLICY "Deny all direct access"
  ON public.ethereal_game_sessions
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ethereal_messages
DROP POLICY IF EXISTS "Deny all direct access" ON public.ethereal_messages;
CREATE POLICY "Deny all direct access"
  ON public.ethereal_messages
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ethereal_rooms
DROP POLICY IF EXISTS "Deny all direct access" ON public.ethereal_rooms;
CREATE POLICY "Deny all direct access"
  ON public.ethereal_rooms
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ethereal_sessions
DROP POLICY IF EXISTS "Deny all direct access" ON public.ethereal_sessions;
CREATE POLICY "Deny all direct access"
  ON public.ethereal_sessions
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ethereal_tasks
DROP POLICY IF EXISTS "Deny all direct access" ON public.ethereal_tasks;
CREATE POLICY "Deny all direct access"
  ON public.ethereal_tasks
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);