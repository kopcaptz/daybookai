-- Enable RLS on rate_limits but deny all public access
-- Table is accessed ONLY by edge functions with service_role key
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- No policies = no access via anon/authenticated keys
-- Edge functions use service_role which bypasses RLS
COMMENT ON TABLE public.rate_limits IS 'Rate limiting data for PIN verification. RLS enabled with no policies - accessible only via service_role key in edge functions.';