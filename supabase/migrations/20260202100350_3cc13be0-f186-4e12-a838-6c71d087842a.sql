-- Расширить ethereal_chronicles
ALTER TABLE public.ethereal_chronicles
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN updated_by uuid,
  ADD COLUMN editing_by uuid,
  ADD COLUMN editing_expires_at timestamptz,
  ADD COLUMN media jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Таблица ревизий
CREATE TABLE public.ethereal_chronicle_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chronicle_id uuid NOT NULL REFERENCES ethereal_chronicles(id) ON DELETE CASCADE,
  editor_id uuid NOT NULL,
  title_snapshot text NOT NULL,
  content_snapshot text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- RLS для ревизий
ALTER TABLE public.ethereal_chronicle_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all direct access" ON public.ethereal_chronicle_revisions
  AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- Индексы
CREATE INDEX idx_chronicles_room_pinned ON ethereal_chronicles(room_id, pinned DESC, updated_at DESC);
CREATE INDEX idx_chronicle_revisions_chronicle ON ethereal_chronicle_revisions(chronicle_id, created_at DESC);