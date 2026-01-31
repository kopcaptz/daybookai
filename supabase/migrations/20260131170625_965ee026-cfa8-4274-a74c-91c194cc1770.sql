-- Add explicit deny-all RLS policy for rate_limits table
-- This table is accessed ONLY via Edge Functions using service_role (bypasses RLS)

CREATE POLICY "Deny all direct access"
ON public.rate_limits
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- Add documentation comment
COMMENT ON TABLE public.rate_limits IS 'Rate limiting data for PIN verification. Access restricted to Edge Functions only via service_role. Direct client access denied by RLS.';