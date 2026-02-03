-- Fix Ethereal Layer RLS policies: convert PERMISSIVE to RESTRICTIVE
-- This ensures "Deny all direct access" cannot be bypassed by adding permissive policies

-- 1. Drop existing PERMISSIVE policies
DROP POLICY IF EXISTS "Deny all direct access" ON ethereal_messages;
DROP POLICY IF EXISTS "Deny all direct access" ON ethereal_rooms;
DROP POLICY IF EXISTS "Deny all direct access" ON ethereal_room_members;
DROP POLICY IF EXISTS "Deny all direct access" ON ethereal_sessions;
DROP POLICY IF EXISTS "Deny all direct access" ON ethereal_chronicles;
DROP POLICY IF EXISTS "Deny all direct access" ON ethereal_tasks;
DROP POLICY IF EXISTS "Deny all direct access" ON ethereal_calendar_events;

-- 2. Recreate as RESTRICTIVE policies
CREATE POLICY "Deny all direct access" ON ethereal_messages
  AS RESTRICTIVE FOR ALL TO public
  USING (false) WITH CHECK (false);

CREATE POLICY "Deny all direct access" ON ethereal_rooms
  AS RESTRICTIVE FOR ALL TO public
  USING (false) WITH CHECK (false);

CREATE POLICY "Deny all direct access" ON ethereal_room_members
  AS RESTRICTIVE FOR ALL TO public
  USING (false) WITH CHECK (false);

CREATE POLICY "Deny all direct access" ON ethereal_sessions
  AS RESTRICTIVE FOR ALL TO public
  USING (false) WITH CHECK (false);

CREATE POLICY "Deny all direct access" ON ethereal_chronicles
  AS RESTRICTIVE FOR ALL TO public
  USING (false) WITH CHECK (false);

CREATE POLICY "Deny all direct access" ON ethereal_tasks
  AS RESTRICTIVE FOR ALL TO public
  USING (false) WITH CHECK (false);

CREATE POLICY "Deny all direct access" ON ethereal_calendar_events
  AS RESTRICTIVE FOR ALL TO public
  USING (false) WITH CHECK (false);