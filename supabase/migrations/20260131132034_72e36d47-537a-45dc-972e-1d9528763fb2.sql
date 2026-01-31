-- Enum для статуса фидбека
CREATE TYPE public.feedback_status AS ENUM ('new', 'read', 'resolved', 'archived');

-- Таблица фидбека
CREATE TABLE public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  image_url TEXT,
  device_info JSONB DEFAULT '{}',
  status public.feedback_status DEFAULT 'new',
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Функция обновления updated_at
CREATE OR REPLACE FUNCTION public.update_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Триггер для автообновления updated_at
CREATE TRIGGER update_feedback_timestamp
  BEFORE UPDATE ON public.feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.update_feedback_updated_at();

-- RLS: включить защиту (без политик = доступ только через service_role)
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Storage bucket для вложений (приватный)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('feedback-attachments', 'feedback-attachments', false);

-- Политика: загрузка файлов через Edge Functions (service_role)
-- Нет публичных политик = доступ только через signed URLs