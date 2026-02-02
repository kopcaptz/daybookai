import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const DAY_NAMES = {
  ru: ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

const SEASON_NAMES = {
  ru: { spring: 'весна', summer: 'лето', autumn: 'осень', winter: 'зима' },
  en: { spring: 'spring', summer: 'summer', autumn: 'autumn', winter: 'winter' },
};

const TIME_NAMES = {
  ru: { morning: 'утро', day: 'день', evening: 'вечер', night: 'ночь' },
  en: { morning: 'morning', day: 'afternoon', evening: 'evening', night: 'night' },
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { language, dayOfWeek, timeOfDay, season } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const lang = language === 'ru' ? 'ru' : 'en';
    const dayName = DAY_NAMES[lang][dayOfWeek] || '';
    const seasonName = SEASON_NAMES[lang][season as keyof typeof SEASON_NAMES['ru']] || '';
    const timeName = TIME_NAMES[lang][timeOfDay as keyof typeof TIME_NAMES['ru']] || '';

    const systemPrompt = lang === 'ru'
      ? `Ты — мистический Оракул «Магического блокнота». Генерируй одну короткую, поэтичную фразу-приглашение начать день (максимум 10 слов). 
         Стиль: техно-эзотерика, загадочность, тепло. Без кавычек. Без эмодзи. Одно предложение.`
      : `You are the mystical Oracle of the Magic Notebook app. Generate one short, poetic invitation to start the day (maximum 10 words).
         Style: techno-esoteric, mysterious, warm. No quotes. No emojis. One sentence.`;

    const userPrompt = lang === 'ru'
      ? `Сегодня ${dayName}, ${timeName}, ${seasonName}. Создай фразу-приглашение.`
      : `Today is ${dayName}, ${timeName}, ${seasonName}. Create an invitation phrase.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 50,
        temperature: 0.9,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limited', whisper: null }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const whisper = data.choices?.[0]?.message?.content?.trim() || null;

    console.log('Generated whisper:', whisper?.substring(0, 50));

    return new Response(
      JSON.stringify({ whisper }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Whisper error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', whisper: null }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
