-- Fix RLS policies for crash_reports and ethereal_room_members
-- Explicitly deny access to both anon and authenticated roles

-- 1. crash_reports: recreate policy to explicitly cover all roles
DROP POLICY IF EXISTS "Deny all direct access" ON crash_reports;

CREATE POLICY "Deny all direct access" ON crash_reports
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2. ethereal_room_members: recreate policy to explicitly cover all roles  
DROP POLICY IF EXISTS "Deny all direct access" ON ethereal_room_members;

CREATE POLICY "Deny all direct access" ON ethereal_room_members
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Also fix the other system tables for consistency
DROP POLICY IF EXISTS "Deny all direct access" ON feedback;
CREATE POLICY "Deny all direct access" ON feedback
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Deny all direct access" ON rate_limits;
CREATE POLICY "Deny all direct access" ON rate_limits
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Deny all direct access" ON usage_analytics;
CREATE POLICY "Deny all direct access" ON usage_analytics
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);