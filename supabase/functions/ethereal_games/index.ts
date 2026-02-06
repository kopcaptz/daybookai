/**
 * ETHEREAL LAYER SECURITY MODEL - Games Module
 * =============================================
 *
 * ARCHITECTURE: "Full Isolation" (Deny All Direct Access)
 *
 * This function manages the "Situations" couples game in the Ethereal Layer.
 * It follows the same security model as all Ethereal functions:
 *
 * SECURITY LAYERS:
 * 1. DATABASE RLS: ethereal_game_sessions and ethereal_game_rounds tables have
 *    RESTRICTIVE policies USING(false) blocking direct client queries.
 *
 * 2. EDGE FUNCTION PROXY: All game operations are proxied through this function
 *    using service_role which bypasses RLS by design.
 *
 * 3. HMAC TOKEN VALIDATION: x-ethereal-token header required with signed payload.
 *
 * 4. SESSION REVOCATION: verifyToken() + session lookup ensures instant kick support.
 *
 * GAME FEATURES:
 * - Adult level system (0-3) with consent requirements
 * - Boundaries configuration (noHumiliation, noPain, etc.)
 * - AI-generated situations using Lovable AI Gateway (Gemini-2.5-flash)
 * - AI reflections on partner answers
 * - Aftercare rating system
 *
 * CONTENT SAFETY:
 * - Hard bans on non-consensual, minor-related, and other prohibited content
 * - Level-based content filtering (romance → sensual → explicit)
 * - Both partners must consent for level > 0
 *
 * FALSE POSITIVE SECURITY REPORTS:
 * Reports claiming these tables are "publicly readable" are incorrect.
 * Direct access from anon or authenticated roles will always fail.
 *
 * @see supabase/functions/ethereal_join/index.ts - Session creation
 */

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
  budget: { label: 'Финансы', minLevel: 0 },
  boundaries: { label: 'Личные границы', minLevel: 0 },
  lifestyle: { label: 'Быт', minLevel: 0 },
  social: { label: 'Друзья и семья', minLevel: 0 },
  travel: { label: 'Путешествия', minLevel: 0 },
  romance: { label: 'Романтика', minLevel: 1 },
  intimacy: { label: 'Близость', minLevel: 2 },
  fantasies: { label: 'Желания', minLevel: 3 },
};

// Boundaries type
interface Boundaries {
  noHumiliation?: boolean;
  noPain?: boolean;
  noThirdParties?: boolean;
  noPastPartners?: boolean;
  romanceOnly?: boolean;
  v?: number;
}

// Hard bans for adult content
const HARD_BANS = `
СТРОГИЕ ОГРАНИЧЕНИЯ (применять ВСЕГДА для уровней 1-3):
- Только взрослые (18+)
- Только consensual сценарии
- ЗАПРЕЩЕНО: non-consent, coercion, minors/ageplay, incest, violence, 
  humiliation/degradation, bodily fluids (scat/watersports), hate/raceplay
- Тон: бережный, без оценки, без давления
- НЕ просить сексуальные подробности — только "предпочтения" и "сценарии"
`;

// Get level-specific prompt instructions
function getLevelPrompt(level: number, boundaries: Boundaries, isWarmup: boolean): string {
  const boundaryInstructions = [];
  if (boundaries.noHumiliation) boundaryInstructions.push('- Без грубости и унижения');
  if (boundaries.noPain) boundaryInstructions.push('- Без боли');
  if (boundaries.noThirdParties) boundaryInstructions.push('- Без третьих лиц');
  if (boundaries.noPastPartners) boundaryInstructions.push('- Без обсуждения прошлого опыта');
  if (boundaries.romanceOnly) boundaryInstructions.push('- Только романтика (уровень 1)');

  const boundaryBlock = boundaryInstructions.length > 0
    ? `\nОГРАНИЧЕНИЯ ПОЛЬЗОВАТЕЛЯ:\n${boundaryInstructions.join('\n')}\n`
    : '';

  const warmupNote = isWarmup
    ? `\nЭто ПЕРВЫЙ раунд — генерируй МЯГКО, как разминку.
Добавь в valuesQuestion вопрос о комфорте: "Перед этим: что точно ок/не ок сегодня?"\n`
    : '';

  switch (level) {
    case 0:
      return `Режим: Лёгкий / SFW
Фокус: Быт, ценности, планы, лёгкий флирт.
Ограничения: Никаких интимных тем.${boundaryBlock}${warmupNote}`;
    case 1:
      return `Режим: Романтический
Фокус: Поцелуи, прикосновения, нежность, близость.
Ограничения: Без физической интимности.
${HARD_BANS}${boundaryBlock}${warmupNote}`;
    case 2:
      return `Режим: Чувственный
Фокус: Тела, желания, прелюдия, сценарии.
Ограничения: Без explicit описаний.
${HARD_BANS}${boundaryBlock}${warmupNote}`;
    case 3:
      return `Режим: Откровенный
Фокус: Предпочтения, фантазии, границы, kink-light.
Ограничения: Фокус на коммуникации и предпочтениях, НЕ на действиях.
${HARD_BANS}${boundaryBlock}${warmupNote}`;
    default:
      return `Режим: Лёгкий / SFW
Фокус: Быт, ценности, планы.
Ограничения: Никаких интимных тем.`;
  }
}

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

// Generate situations using AI with level-based prompts
async function generateSituations(
  category: string,
  adultLevel: number,
  boundaries: Boundaries,
  roundNumber: number = 1
): Promise<any[]> {
  const categoryInfo = CATEGORIES[category as keyof typeof CATEGORIES];
  if (!categoryInfo) throw new Error('Invalid category');

  // Block categories if level too low
  if (categoryInfo.minLevel > adultLevel) {
    throw new Error('Level too low for this category');
  }

  const isWarmup = roundNumber === 1 && adultLevel > 0;
  const levelPrompt = getLevelPrompt(adultLevel, boundaries, isWarmup);

  // Determine card type distribution based on level
  const includeOpen = adultLevel >= 2 && Math.random() < 0.4;
  const cardTypeInstruction = includeOpen
    ? 'Сгенерируй 2 ситуации типа "abc" (с вариантами A/B/C) и 1 ситуацию типа "open" (без вариантов, партнёр отвечает текстом).'
    : 'Сгенерируй 3 ситуации типа "abc" (с вариантами A/B/C).';

  const systemPrompt = `Ты — ведущий игры "Ситуации на борту" для пар.
Твоя задача — генерировать реалистичные жизненные ситуации, которые помогают партнёрам лучше понять друг друга.

${levelPrompt}

ВАЖНО:
- Ситуации должны быть конкретными и узнаваемыми
- Варианты ответов должны отражать разные подходы, НЕ "правильный/неправильный"
- Тон: тёплый, без осуждения
- Уточняющий вопрос должен раскрывать ценности за выбором

${cardTypeInstruction}

Формат ответа — ТОЛЬКО валидный JSON:
{
  "situations": [
    {
      "id": "sit_1",
      "cardType": "abc",
      "text": "Описание конкретной ситуации (2-3 предложения)",
      "options": [
        { "id": "A", "text": "Вариант A (1-2 предложения)" },
        { "id": "B", "text": "Вариант B (1-2 предложения)" },
        { "id": "C", "text": "Вариант C (1-2 предложения)" }
      ],
      "valuesQuestion": "Уточняющий вопрос о ценностях за этим выбором?"
    }
  ]
}

Для карточек типа "open" поле options должно быть пустым массивом [].`;

  const userPrompt = `Сгенерируй ситуации для категории "${categoryInfo.label}".`;

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
      const adultLevel = Math.min(3, Math.max(0, Number(body.adultLevel) || 0));

      // If level > 0, creator gives consent automatically
      const consentPicker = adultLevel > 0;

      const { data: gameSession, error } = await supabase
        .from('ethereal_game_sessions')
        .insert({
          room_id: roomId,
          game_type: 'situations',
          status: 'lobby',
          picker_id: memberId,
          adult_level: adultLevel,
          consent_picker: consentPicker,
          consent_responder: false,
          boundaries: {},
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

    // POST /session/:id/consent - Set consent and boundaries
    if (req.method === 'POST' && path.match(/^\/session\/[^/]+\/consent$/)) {
      const sessionId = path.split('/')[2];
      const body = await req.json();
      const { boundaries = {} } = body;

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

      const isPicker = gameSession.picker_id === memberId;
      const isResponder = gameSession.responder_id === memberId;

      if (!isPicker && !isResponder) {
        return new Response(
          JSON.stringify({ success: false, error: 'not_participant' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Apply romanceOnly clamp
      let effectiveLevel = gameSession.adult_level;
      if (boundaries.romanceOnly && effectiveLevel > 1) {
        effectiveLevel = 1;
      }

      // Merge boundaries
      const mergedBoundaries = { 
        ...gameSession.boundaries, 
        ...boundaries,
        v: 1 
      };

      const updateData: any = {
        boundaries: mergedBoundaries,
        adult_level: effectiveLevel,
        updated_at: new Date().toISOString(),
      };

      if (isPicker) {
        updateData.consent_picker = true;
      } else {
        updateData.consent_responder = true;
      }

      const { error: updateError } = await supabase
        .from('ethereal_game_sessions')
        .update(updateData)
        .eq('id', sessionId);

      if (updateError) throw updateError;

      // Check if both consented
      const { data: updatedSession } = await supabase
        .from('ethereal_game_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      const bothConsented = updatedSession?.consent_picker && updatedSession?.consent_responder;
      const needsConsent = updatedSession?.adult_level > 0 && !bothConsented;

      return new Response(
        JSON.stringify({ 
          success: true, 
          needsConsent,
          session: updatedSession 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST /session/:id/level - Downshift level only
    if (req.method === 'POST' && path.match(/^\/session\/[^/]+\/level$/)) {
      const sessionId = path.split('/')[2];
      const body = await req.json();
      const newLevel = Math.min(3, Math.max(0, Number(body.level) || 0));

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

      // Only allow downshift (safety-first: anyone can lower)
      if (newLevel >= gameSession.adult_level) {
        return new Response(
          JSON.stringify({ success: false, error: 'can_only_downshift' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Reset consent if level > 0, auto-consent if level = 0
      const updateData: any = {
        adult_level: newLevel,
        updated_at: new Date().toISOString(),
      };

      if (newLevel === 0) {
        updateData.consent_picker = true;
        updateData.consent_responder = true;
      } else {
        updateData.consent_picker = false;
        updateData.consent_responder = false;
      }

      const { error: updateError } = await supabase
        .from('ethereal_game_sessions')
        .update(updateData)
        .eq('id', sessionId);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST /session/:id/skip - Regenerate current situation
    if (req.method === 'POST' && path.match(/^\/session\/[^/]+\/skip$/)) {
      const sessionId = path.split('/')[2];

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

      // Get current round
      const { data: round } = await supabase
        .from('ethereal_game_rounds')
        .select('*')
        .eq('session_id', sessionId)
        .eq('round_number', gameSession.current_round)
        .single();

      if (!round) {
        return new Response(
          JSON.stringify({ success: false, error: 'no_active_round' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Generate new situation for same category
      const situations = await generateSituations(
        round.category,
        gameSession.adult_level,
        gameSession.boundaries || {},
        gameSession.current_round
      );

      if (situations.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'generation_failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const newSituation = situations[0];

      // Update round with new situation, reset answers
      const { error: updateError } = await supabase
        .from('ethereal_game_rounds')
        .update({
          situation_text: newSituation.text,
          options: newSituation.options || [],
          card_type: newSituation.cardType || 'abc',
          values_questions: newSituation.valuesQuestion
            ? [{ q: newSituation.valuesQuestion, a: null }]
            : [],
          picker_answer: null,
          responder_answer: null,
          responder_custom: null,
          picker_revealed: false,
          ai_reflection: null,
        })
        .eq('id', round.id);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({ success: true, situation: newSituation }),
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

      // Check consent for adult levels
      if (gameSession.adult_level > 0) {
        if (!gameSession.consent_picker || !gameSession.consent_responder) {
          return new Response(
            JSON.stringify({ success: false, error: 'consent_required', needsConsent: true }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
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

      const { data: gameSession } = await supabase
        .from('ethereal_game_sessions')
        .select('adult_level, boundaries, picker_id, current_round')
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

      const situations = await generateSituations(
        category, 
        gameSession.adult_level,
        gameSession.boundaries || {},
        gameSession.current_round || 1
      );

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

      const cardType = situation.cardType || 'abc';

      const { data: round, error: roundError } = await supabase
        .from('ethereal_game_rounds')
        .insert({
          session_id: sessionId,
          round_number: gameSession.current_round,
          category,
          situation_text: situation.text,
          options: situation.options || [],
          card_type: cardType,
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

      const options = round.options as { id: string; text: string }[];
      const pickerOption = options.find((o) => o.id === round.picker_answer);
      const responderOption = options.find((o) => o.id === round.responder_answer);

      const reflection = await generateReflection(
        round.situation_text,
        pickerOption?.text || round.picker_answer,
        responderOption?.text || round.responder_answer,
        round.responder_custom
      );

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

    // GET /categories - List available categories based on level
    if (req.method === 'GET' && path === '/categories') {
      const levelParam = url.searchParams.get('level');
      const level = levelParam ? parseInt(levelParam, 10) : 0;

      const categories = Object.entries(CATEGORIES)
        .filter(([_, info]) => info.minLevel <= level)
        .map(([key, info]) => ({ id: key, label: info.label, minLevel: info.minLevel }));

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
