
-- Create app_settings key-value table for dynamic configuration
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Deny all direct access (service_role only via edge functions)
CREATE POLICY "Deny all direct access" ON public.app_settings
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
