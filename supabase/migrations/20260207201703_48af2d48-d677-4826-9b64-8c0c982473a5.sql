
-- Create diary_entries table for cloud sync
CREATE TABLE public.diary_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  mood SMALLINT NOT NULL DEFAULT 3,
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_private BOOLEAN NOT NULL DEFAULT false,
  title TEXT,
  title_source TEXT,
  mood_source TEXT DEFAULT 'user',
  semantic_tags TEXT[] NOT NULL DEFAULT '{}',
  attachment_counts JSONB DEFAULT '{"image":0,"video":0,"audio":0}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Unique constraint: one local_id per user
CREATE UNIQUE INDEX idx_diary_entries_user_local ON public.diary_entries(user_id, local_id);
-- Index for sync queries
CREATE INDEX idx_diary_entries_updated ON public.diary_entries(user_id, updated_at);
CREATE INDEX idx_diary_entries_date ON public.diary_entries(user_id, date);

-- Enable RLS
ALTER TABLE public.diary_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own entries"
  ON public.diary_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own entries"
  ON public.diary_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own entries"
  ON public.diary_entries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own entries"
  ON public.diary_entries FOR DELETE
  USING (auth.uid() = user_id);

-- Create diary_attachments table
CREATE TABLE public.diary_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES public.diary_entries(id) ON DELETE CASCADE,
  local_entry_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  duration INTEGER,
  storage_path TEXT,
  thumbnail_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_diary_attachments_entry ON public.diary_attachments(entry_id);
CREATE INDEX idx_diary_attachments_user ON public.diary_attachments(user_id);

-- Enable RLS
ALTER TABLE public.diary_attachments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own attachments"
  ON public.diary_attachments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own attachments"
  ON public.diary_attachments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own attachments"
  ON public.diary_attachments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own attachments"
  ON public.diary_attachments FOR DELETE
  USING (auth.uid() = user_id);

-- Create private storage bucket for diary media
INSERT INTO storage.buckets (id, name, public)
VALUES ('diary-media', 'diary-media', false);

-- Storage policies for diary-media bucket
CREATE POLICY "Users can view their own diary media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'diary-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own diary media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'diary-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own diary media"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'diary-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own diary media"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'diary-media' AND auth.uid()::text = (storage.foldername(name))[1]);
