-- Create rate_limits table for brute-force protection
CREATE TABLE public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  fail_count INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ DEFAULT now(),
  blocked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(identifier, endpoint)
);

-- Index for fast lookups
CREATE INDEX idx_rate_limits_lookup ON public.rate_limits(identifier, endpoint);

-- Index for cleanup of old records
CREATE INDEX idx_rate_limits_created ON public.rate_limits(created_at);

-- RLS is NOT enabled - table is only accessed by edge functions with service role key
COMMENT ON TABLE public.rate_limits IS 'Stores rate limiting data for PIN verification endpoints. Used by edge functions only.';