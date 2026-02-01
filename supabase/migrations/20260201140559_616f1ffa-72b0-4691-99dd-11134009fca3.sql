-- 1. Расширение таблицы feedback
ALTER TABLE feedback 
ADD COLUMN IF NOT EXISTS app_version TEXT,
ADD COLUMN IF NOT EXISTS diagnostics JSONB DEFAULT '{}';

-- 2. Таблица crash_reports с RLS
CREATE TABLE IF NOT EXISTS crash_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  stack TEXT,
  component_stack TEXT,
  url TEXT,
  app_version TEXT,
  session_id TEXT,
  device_info JSONB DEFAULT '{}',
  breadcrumbs JSONB DEFAULT '[]',
  occurrence_count INT DEFAULT 1,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS для crash_reports - deny all direct access
ALTER TABLE crash_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all direct access" ON crash_reports
  AS RESTRICTIVE
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Индекс для группировки по stack trace
CREATE INDEX IF NOT EXISTS idx_crash_reports_stack ON crash_reports (md5(COALESCE(stack, '')));
CREATE INDEX IF NOT EXISTS idx_crash_reports_status ON crash_reports (status);
CREATE INDEX IF NOT EXISTS idx_crash_reports_last_seen ON crash_reports (last_seen_at DESC);

-- 3. Таблица usage_analytics с RLS
CREATE TABLE IF NOT EXISTS usage_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  session_id TEXT NOT NULL,
  app_version TEXT,
  device_info JSONB DEFAULT '{}',
  metrics JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS для usage_analytics - deny all direct access
ALTER TABLE usage_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all direct access" ON usage_analytics
  AS RESTRICTIVE
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Индексы для аналитики
CREATE INDEX IF NOT EXISTS idx_usage_analytics_date ON usage_analytics (date DESC);
CREATE INDEX IF NOT EXISTS idx_usage_analytics_session ON usage_analytics (session_id);