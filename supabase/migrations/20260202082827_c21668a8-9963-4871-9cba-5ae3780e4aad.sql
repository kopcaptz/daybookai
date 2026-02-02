-- Добавляем adult_level с безопасным диапазоном
ALTER TABLE public.ethereal_game_sessions 
  ADD COLUMN adult_level smallint NOT NULL DEFAULT 0
    CHECK (adult_level >= 0 AND adult_level <= 3);

-- Переносим данные из adult_mode
UPDATE public.ethereal_game_sessions
SET adult_level = CASE WHEN adult_mode = true THEN 1 ELSE 0 END;

-- Consent поля
ALTER TABLE public.ethereal_game_sessions 
  ADD COLUMN consent_picker boolean NOT NULL DEFAULT false;
ALTER TABLE public.ethereal_game_sessions 
  ADD COLUMN consent_responder boolean NOT NULL DEFAULT false;

-- Boundaries (версионированный JSON)
ALTER TABLE public.ethereal_game_sessions 
  ADD COLUMN boundaries jsonb DEFAULT '{}'::jsonb;

-- Card type для раундов
ALTER TABLE public.ethereal_game_rounds 
  ADD COLUMN card_type text DEFAULT 'abc' 
    CHECK (card_type IN ('abc', 'open'));

-- Индекс для частых запросов активных сессий по комнате
CREATE INDEX IF NOT EXISTS idx_game_sessions_room_status
ON public.ethereal_game_sessions (room_id, status);

-- Удаляем adult_mode после успешной миграции
ALTER TABLE public.ethereal_game_sessions DROP COLUMN adult_mode;