import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-ethereal-token',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ETHEREAL_TOKEN_SECRET = Deno.env.get('ETHEREAL_TOKEN_SECRET')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

const AI_GATEWAY_URL = 'https://ai-gateway.lovable.dev/v1/chat/completions';

// Categories with metadata
const CATEGORIES = {
  budget: { label: 'Финансы', adult: false },
  boundaries: { label: 'Личные границы', adult: false },
  lifestyle: { label: 'Быт', adult: false },
  social: { label: 'Друзья и семья', adult: false },
  travel: { label: 'Путешествия', adult: false },
  intimacy: { label: 'Близость', adult: true },
  fantasies: { label: 'Желания', adult: true },
};

// Verify ethereal token (same logic as ethereal_messages)
async function verifyToken(token: string): Promise<{
  valid: boolean;
  session?: any;
  member?: any;
}> {
  if (!token) return { valid: false };

  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(ETHEREAL_TOKEN_SECRET);
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const [payloadB64, signatureB64] = token.split('.');
    if (!payloadB64 || !signatureB64) return { valid: false };

    // Decode base64 signature (not hex!)
    const signatureBytes = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
    
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      encoder.encode(payloadB64)
    );

    if (!isValid) return { valid: false };

    const payload = JSON.parse(atob(payloadB64));
    if (payload.exp < Date.now()) return { valid: false };

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Use sessionId (not sid) - matching ethereal_join token format
    const { data: sessionData } = await supabase
      .from('ethereal_sessions')
      .select('*, member:ethereal_room_members(*)')
      .eq('id', payload.sessionId)
      .single();

    if (!sessionData || new Date(sessionData.expires_at).getTime() < Date.now()) {
      return { valid: false };
    }

    return { valid: true, session: sessionData, member: sessionData.member };
  } catch (e) {
    console.error('Token verification error:', e);
    return { valid: false };
  }
}

// Generate situations using AI
async function generateSituations(
  category: string,
  adultMode: boolean
): Promise<any[]> {
  const categoryInfo = CATEGORIES[category as keyof typeof CATEGORIES];
  if (!categoryInfo) throw new Error('Invalid category');

  // Block adult categories if not in adult mode
  if (categoryInfo.adult && !adultMode) {
    throw new Error('Adult mode required for this category');
  }

  const systemPrompt = `Ты — ведущий игры "Ситуации на борту" для пар.
Твоя задача — генерировать реалистичные жизненные ситуации, которые помогают партнёрам лучше понять друг друга.

ВАЖНО:
- Ситуации должны быть конкретными и узнаваемыми
- Варианты ответов должны отражать разные подходы, НЕ "правильный/неправильный"
- Тон: тёплый, без осуждения
- Уточняющий вопрос должен раскрывать ценности за выбором

${adultMode && categoryInfo.adult ? 'Режим 18+: можно включать интимные и чувственные темы, но без вульгарности.' : 'Режим SFW: избегай интимных тем полностью.'}

Формат ответа — ТОЛЬКО валидный JSON:
{
  "situations": [
    {
      "id": "sit_1",
      "text": "Описание конкретной ситуации (2-3 предложения)",
      "options": [
        { "id": "A", "text": "Вариант A (1-2 предложения)" },
        { "id": "B", "text": "Вариант B (1-2 предложения)" },
        { "id": "C", "text": "Вариант C (1-2 предложения)" }
      ],
      "valuesQuestion": "Уточняющий вопрос о ценностях за этим выбором?"
    }
  ]
}`;

  const userPrompt = `Сгенерируй 3 разные ситуации для категории "${categoryInfo.label}".`;

  const response = await fetch(AI_GATEWAY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    console.error('AI Gateway error:', await response.text());
    throw new Error('AI generation failed');
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  // Extract JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid AI response format');

  const parsed = JSON.parse(jsonMatch[0]);
  return parsed.situations || [];
}

// Generate AI reflection
async function generateReflection(
  situation: string,
  pickerAnswer: string,
  responderAnswer: string,
  responderCustom?: string
): Promise<string> {
  const responderChoice = responderCustom || responderAnswer;

  const systemPrompt = `Ты — мудрый и тактичный ведущий игры для пар.
Твоя задача — дать мягкую, конструктивную обратную связь о том, как соотносятся выборы партнёров.

ВАЖНО:
- НЕ оценивай "правильность" выбора
- Фокусируйся на понимании и сближении
- Подчёркивай сильные стороны обоих подходов
- 2-3 предложения максимум
- Тон: тёплый, поддерживающий`;

  const userPrompt = `Ситуация: "${situation}"

Первый партнёр выбрал: ${pickerAnswer}
Второй партнёр ответил: ${responderChoice}

Дай краткую рефлексию.`;

  const response = await fetch(AI_GATEWAY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    throw new Error('AI reflection failed');
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace('/ethereal_games', '');

  // Verify token for all requests
  const token = req.headers.get('x-ethereal-token') || '';
  const { valid, session: ethSession, member } = await verifyToken(token);

  if (!valid || !ethSession || !member) {
    return new Response(JSON.stringify({ success: false, error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const roomId = ethSession.room_id;
  const memberId = member.id;

  try {
    // POST /create - Create new game session
    if (req.method === 'POST' && path === '/create') {
      const body = await req.json();
      const adultMode = body.adultMode === true;

      const { data: gameSession, error } = await supabase
        .from('ethereal_game_sessions')
        .insert({
          room_id: roomId,
          game_type: 'situations',
          status: 'lobby',
          picker_id: memberId,
          adult_mode: adultMode,
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, session: gameSession }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET /sessions - List active sessions for room
    if (req.method === 'GET' && path === '/sessions') {
      const { data: sessions, error } = await supabase
        .from('ethereal_game_sessions')
        .select(`
          *,
          picker:ethereal_room_members!picker_id(id, display_name),
          responder:ethereal_room_members!responder_id(id, display_name)
        `)
        .eq('room_id', roomId)
        .neq('status', 'completed')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, sessions: sessions || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST /join/:id - Join existing session
    if (req.method === 'POST' && path.startsWith('/join/')) {
      const sessionId = path.replace('/join/', '');

      const { data: gameSession, error: fetchError } = await supabase
        .from('ethereal_game_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('room_id', roomId)
        .single();

      if (fetchError || !gameSession) {
        return new Response(
          JSON.stringify({ success: false, error: 'session_not_found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (gameSession.status !== 'lobby') {
        return new Response(
          JSON.stringify({ success: false, error: 'session_not_joinable' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (gameSession.picker_id === memberId) {
        return new Response(
          JSON.stringify({ success: false, error: 'already_picker' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error: updateError } = await supabase
        .from('ethereal_game_sessions')
        .update({ responder_id: memberId, updated_at: new Date().toISOString() })
        .eq('id', sessionId);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST /start/:id - Start the game
    if (req.method === 'POST' && path.startsWith('/start/')) {
      const sessionId = path.replace('/start/', '');

      const { data: gameSession, error: fetchError } = await supabase
        .from('ethereal_game_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('room_id', roomId)
        .single();

      if (fetchError || !gameSession) {
        return new Response(
          JSON.stringify({ success: false, error: 'session_not_found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (gameSession.picker_id !== memberId) {
        return new Response(
          JSON.stringify({ success: false, error: 'not_picker' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!gameSession.responder_id) {
        return new Response(
          JSON.stringify({ success: false, error: 'need_responder' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error: updateError } = await supabase
        .from('ethereal_game_sessions')
        .update({
          status: 'active',
          current_round: 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST /generate - Generate situations for a category
    if (req.method === 'POST' && path === '/generate') {
      const body = await req.json();
      const { category, sessionId } = body;

      // Verify session and get adult mode
      const { data: gameSession } = await supabase
        .from('ethereal_game_sessions')
        .select('adult_mode, picker_id')
        .eq('id', sessionId)
        .eq('room_id', roomId)
        .single();

      if (!gameSession) {
        return new Response(
          JSON.stringify({ success: false, error: 'session_not_found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (gameSession.picker_id !== memberId) {
        return new Response(
          JSON.stringify({ success: false, error: 'not_picker' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const situations = await generateSituations(category, gameSession.adult_mode);

      return new Response(
        JSON.stringify({ success: true, situations }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST /pick/:id - Picker selects a situation
    if (req.method === 'POST' && path.startsWith('/pick/')) {
      const sessionId = path.replace('/pick/', '');
      const body = await req.json();
      const { category, situation, pickerAnswer } = body;

      const { data: gameSession } = await supabase
        .from('ethereal_game_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('room_id', roomId)
        .single();

      if (!gameSession || gameSession.picker_id !== memberId) {
        return new Response(
          JSON.stringify({ success: false, error: 'not_authorized' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create the round
      const { data: round, error: roundError } = await supabase
        .from('ethereal_game_rounds')
        .insert({
          session_id: sessionId,
          round_number: gameSession.current_round,
          category,
          situation_text: situation.text,
          options: situation.options,
          picker_answer: pickerAnswer,
          values_questions: situation.valuesQuestion
            ? [{ q: situation.valuesQuestion, a: null }]
            : [],
        })
        .select()
        .single();

      if (roundError) throw roundError;

      return new Response(
        JSON.stringify({ success: true, round }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET /round/:sessionId - Get current round data
    if (req.method === 'GET' && path.startsWith('/round/')) {
      const sessionId = path.replace('/round/', '');

      const { data: gameSession } = await supabase
        .from('ethereal_game_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('room_id', roomId)
        .single();

      if (!gameSession) {
        return new Response(
          JSON.stringify({ success: false, error: 'session_not_found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: round } = await supabase
        .from('ethereal_game_rounds')
        .select('*')
        .eq('session_id', sessionId)
        .eq('round_number', gameSession.current_round)
        .single();

      return new Response(
        JSON.stringify({
          success: true,
          session: gameSession,
          round: round || null,
          myRole:
            gameSession.picker_id === memberId
              ? 'picker'
              : gameSession.responder_id === memberId
              ? 'responder'
              : 'spectator',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST /respond/:id - Responder answers
    if (req.method === 'POST' && path.startsWith('/respond/')) {
      const sessionId = path.replace('/respond/', '');
      const body = await req.json();
      const { answer, customAnswer } = body;

      const { data: gameSession } = await supabase
        .from('ethereal_game_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('room_id', roomId)
        .single();

      if (!gameSession || gameSession.responder_id !== memberId) {
        return new Response(
          JSON.stringify({ success: false, error: 'not_responder' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error: updateError } = await supabase
        .from('ethereal_game_rounds')
        .update({
          responder_answer: answer,
          responder_custom: customAnswer || null,
        })
        .eq('session_id', sessionId)
        .eq('round_number', gameSession.current_round);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST /reveal/:id - Picker reveals their answer
    if (req.method === 'POST' && path.startsWith('/reveal/')) {
      const sessionId = path.replace('/reveal/', '');

      const { data: gameSession } = await supabase
        .from('ethereal_game_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('room_id', roomId)
        .single();

      if (!gameSession || gameSession.picker_id !== memberId) {
        return new Response(
          JSON.stringify({ success: false, error: 'not_picker' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error: updateError } = await supabase
        .from('ethereal_game_rounds')
        .update({ picker_revealed: true })
        .eq('session_id', sessionId)
        .eq('round_number', gameSession.current_round);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST /reflect/:id - Generate AI reflection
    if (req.method === 'POST' && path.startsWith('/reflect/')) {
      const sessionId = path.replace('/reflect/', '');

      const { data: gameSession } = await supabase
        .from('ethereal_game_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('room_id', roomId)
        .single();

      if (!gameSession) {
        return new Response(
          JSON.stringify({ success: false, error: 'session_not_found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: round } = await supabase
        .from('ethereal_game_rounds')
        .select('*')
        .eq('session_id', sessionId)
        .eq('round_number', gameSession.current_round)
        .single();

      if (!round || !round.responder_answer) {
        return new Response(
          JSON.stringify({ success: false, error: 'round_incomplete' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Find the text for picker's choice
      const options = round.options as { id: string; text: string }[];
      const pickerOption = options.find((o) => o.id === round.picker_answer);
      const responderOption = options.find((o) => o.id === round.responder_answer);

      const reflection = await generateReflection(
        round.situation_text,
        pickerOption?.text || round.picker_answer,
        responderOption?.text || round.responder_answer,
        round.responder_custom
      );

      // Save reflection
      await supabase
        .from('ethereal_game_rounds')
        .update({ ai_reflection: reflection })
        .eq('id', round.id);

      return new Response(
        JSON.stringify({ success: true, reflection }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST /next/:id - Move to next round (swap roles)
    if (req.method === 'POST' && path.startsWith('/next/')) {
      const sessionId = path.replace('/next/', '');

      const { data: gameSession } = await supabase
        .from('ethereal_game_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('room_id', roomId)
        .single();

      if (!gameSession) {
        return new Response(
          JSON.stringify({ success: false, error: 'session_not_found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Swap picker and responder
      const { error: updateError } = await supabase
        .from('ethereal_game_sessions')
        .update({
          current_round: gameSession.current_round + 1,
          picker_id: gameSession.responder_id,
          responder_id: gameSession.picker_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST /end/:id - End the game
    if (req.method === 'POST' && path.startsWith('/end/')) {
      const sessionId = path.replace('/end/', '');

      const { error: updateError } = await supabase
        .from('ethereal_game_sessions')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', sessionId)
        .eq('room_id', roomId);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET /categories - List available categories
    if (req.method === 'GET' && path === '/categories') {
      const body = await req.json().catch(() => ({}));
      const adultMode = body.adultMode === true;

      const categories = Object.entries(CATEGORIES)
        .filter(([_, info]) => adultMode || !info.adult)
        .map(([key, info]) => ({ id: key, label: info.label, adult: info.adult }));

      return new Response(
        JSON.stringify({ success: true, categories }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'not_found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Game error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'internal_error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
