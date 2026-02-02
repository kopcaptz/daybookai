-- Таблица игровых сессий
CREATE TABLE public.ethereal_game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.ethereal_rooms(id) ON DELETE CASCADE,
  game_type text NOT NULL DEFAULT 'situations',
  status text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'active', 'completed')),
  current_round integer NOT NULL DEFAULT 0,
  picker_id uuid REFERENCES public.ethereal_room_members(id) ON DELETE SET NULL,
  responder_id uuid REFERENCES public.ethereal_room_members(id) ON DELETE SET NULL,
  adult_mode boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Таблица раундов игры
CREATE TABLE public.ethereal_game_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.ethereal_game_sessions(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  category text NOT NULL,
  situation_text text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  picker_answer text,
  responder_answer text,
  responder_custom text,
  values_questions jsonb DEFAULT '[]'::jsonb,
  ai_reflection text,
  picker_revealed boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  
  UNIQUE(session_id, round_number)
);

-- RLS для game_sessions
ALTER TABLE public.ethereal_game_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all direct access for ethereal_game_sessions"
  ON public.ethereal_game_sessions
  AS RESTRICTIVE
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- RLS для game_rounds
ALTER TABLE public.ethereal_game_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all direct access for ethereal_game_rounds"
  ON public.ethereal_game_rounds
  AS RESTRICTIVE
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Индексы
CREATE INDEX idx_game_sessions_room ON public.ethereal_game_sessions(room_id);
CREATE INDEX idx_game_sessions_status ON public.ethereal_game_sessions(status);
CREATE INDEX idx_game_rounds_session ON public.ethereal_game_rounds(session_id);