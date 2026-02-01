import { ContextPackResult, EvidenceRef } from '@/lib/librarian/contextPack';
import { DiscussionMessage, DiscussionMode } from '@/lib/db';
import { getAIToken, isAITokenValid } from '@/lib/aiTokenService';
import { isAuthError, requestPinDialog, AIAuthRetryError } from '@/lib/aiAuthRecovery';

const AI_CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

export interface DiscussionAIRequest {
  sessionId: number;
  userText: string;
  mode: DiscussionMode;
  contextPack: ContextPackResult;
  history: DiscussionMessage[];
  language: 'ru' | 'en';
}

export interface AnalysisArtifact {
  type: 'analysis';
  summary: string;
  patterns?: string[];
  risks?: string[];
  conclusions?: string[];
}

export interface ComputeArtifact {
  type: 'compute';
  inputs: { label: string; value: string }[];
  steps: string[];
  result: string;
  assumptions?: string[];
}

export interface PlanArtifact {
  type: 'plan';
  title: string;
  items: {
    text: string;
    priority?: 'high' | 'medium' | 'low';
    dueHint?: string;
  }[];
}

export interface DraftArtifact {
  type: string;
  title: string;
  body: string;
  format: 'markdown' | 'text';
}

export interface DiscussionAIResponse {
  answer: string;
  usedEvidenceIds: string[];
  draftArtifact?: DraftArtifact;
  analysisArtifact?: AnalysisArtifact;
  computeArtifact?: ComputeArtifact;
  planArtifact?: PlanArtifact;
  questions?: string[];
}

// Get AI token header (returns empty object if no valid token)
function getAITokenHeader(): Record<string, string> {
  const tokenData = getAIToken();
  if (tokenData?.token) {
    return { 'X-AI-Token': tokenData.token };
  }
  return {};
}

const MODE_INSTRUCTIONS: Record<DiscussionMode, { ru: string; en: string }> = {
  discuss: {
    ru: 'Режим ОБСУЖДЕНИЕ: исследуй идеи, задавай уточняющие вопросы, помогай осмыслить записи. В конце предложи 2-3 follow-up вопроса в поле "questions".',
    en: 'Mode DISCUSS: explore ideas, ask clarifying questions, help understand the entries. At the end, suggest 2-3 follow-up questions in the "questions" field.',
  },
  analyze: {
    ru: `Режим АНАЛИЗ: структурируй информацию, выяви закономерности, причины, риски, сделай выводы.
ОБЯЗАТЕЛЬНО верни analysisArtifact:
{
  "analysisArtifact": {
    "type": "analysis",
    "summary": "Общий вывод в 1-2 предложения",
    "patterns": ["Закономерность 1", "Закономерность 2"],
    "risks": ["Риск 1"],
    "conclusions": ["Вывод/рекомендация 1", "Вывод 2"]
  }
}`,
    en: `Mode ANALYZE: structure information, identify patterns, causes, risks, make conclusions.
MUST return analysisArtifact:
{
  "analysisArtifact": {
    "type": "analysis",
    "summary": "Overall conclusion in 1-2 sentences",
    "patterns": ["Pattern 1", "Pattern 2"],
    "risks": ["Risk 1"],
    "conclusions": ["Conclusion/recommendation 1", "Conclusion 2"]
  }
}`,
  },
  draft: {
    ru: 'Режим ЧЕРНОВИК: создай чистый текст (письмо/сообщение/пост). Верни в draftArtifact с type, title, body.',
    en: 'Mode DRAFT: produce a clean text draft (email/message/post). Return in draftArtifact with type, title, body.',
  },
  compute: {
    ru: `Режим РАСЧЁТ: покажи шаги вычислений и допущения. Запроси недостающие числа если нужно.
ОБЯЗАТЕЛЬНО верни computeArtifact:
{
  "computeArtifact": {
    "type": "compute",
    "inputs": [{"label": "Цена", "value": "1500 ₽"}, {"label": "Количество", "value": "3"}],
    "steps": ["1500 × 3 = 4500"],
    "result": "4500 ₽",
    "assumptions": ["Допущение если есть"]
  }
}`,
    en: `Mode COMPUTE: show calculation steps and assumptions. Ask for missing numbers if needed.
MUST return computeArtifact:
{
  "computeArtifact": {
    "type": "compute",
    "inputs": [{"label": "Price", "value": "$15"}, {"label": "Quantity", "value": "3"}],
    "steps": ["15 × 3 = 45"],
    "result": "$45",
    "assumptions": ["Assumption if any"]
  }
}`,
  },
  plan: {
    ru: `Режим ПЛАН: создай пошаговый план с чеклистом действий.
ОБЯЗАТЕЛЬНО верни planArtifact:
{
  "planArtifact": {
    "type": "plan",
    "title": "Название плана",
    "items": [
      {"text": "Задача 1", "priority": "high", "dueHint": "сегодня"},
      {"text": "Задача 2", "priority": "medium", "dueHint": "завтра"},
      {"text": "Задача 3", "priority": "low"}
    ]
  }
}
priority: "high" | "medium" | "low". dueHint: временная подсказка.`,
    en: `Mode PLAN: create a step-by-step plan with action checklist.
MUST return planArtifact:
{
  "planArtifact": {
    "type": "plan",
    "title": "Plan title",
    "items": [
      {"text": "Task 1", "priority": "high", "dueHint": "today"},
      {"text": "Task 2", "priority": "medium", "dueHint": "tomorrow"},
      {"text": "Task 3", "priority": "low"}
    ]
  }
}
priority: "high" | "medium" | "low". dueHint: time hint.`,
  },
};

function buildSystemPrompt(
  contextText: string,
  mode: DiscussionMode,
  language: 'ru' | 'en'
): string {
  const modeInstruction = MODE_INSTRUCTIONS[mode][language];
  
  if (language === 'ru') {
    return `Ты ассистент Cyber-Grimoire для функции Обсуждений.

ПРАВИЛА:
1. Используй ТОЛЬКО предоставленный КОНТЕКСТ. Не выдумывай факты.
2. Цитируй источники, используя ID типа [E1], [E2], [B1] и т.д.
3. НИКОГДА не цитируй записи дословно — только перефразируй.
4. Отвечай на русском языке.
5. Будь кратким и полезным.

ТИПЫ ИСТОЧНИКОВ:
- [E1], [E2]... — записи дневника (конкретные события, мысли)
- [B1], [B2]... — хроники (AI-сводки дней с общей картиной)

Хроники содержат структурированный анализ дня. Используй их для понимания общей картины и контекста.

${modeInstruction}

КОНТЕКСТ:
${contextText || 'Контекст не предоставлен.'}

ФОРМАТ ОТВЕТА (JSON):
{
  "answer": "Твой ответ с цитатами [E1], [B1] источников",
  "usedEvidenceIds": ["E1", "B1"],
  "draftArtifact": null,
  "analysisArtifact": null,
  "computeArtifact": null,
  "planArtifact": null,
  "questions": ["Вопрос для продолжения 1?", "Вопрос 2?"]
}

Включай артефакт соответствующий режиму (draftArtifact для ЧЕРНОВИК, analysisArtifact для АНАЛИЗ, computeArtifact для РАСЧЁТ, planArtifact для ПЛАН).
Всегда предлагай 2-3 follow-up вопроса в "questions".`;
  }
  
  return `You are Cyber-Grimoire assistant for the Discussions feature.

RULES:
1. Use ONLY the provided CONTEXT. Do not invent facts.
2. Cite sources using evidence IDs like [E1], [E2], [B1], etc.
3. NEVER quote entries verbatim — only paraphrase.
4. Respond in English.
5. Keep responses focused and helpful.

SOURCE TYPES:
- [E1], [E2]... — diary entries (specific events, thoughts)
- [B1], [B2]... — chronicles (AI summaries of days with overall picture)

Chronicles contain structured day analysis. Use them to understand the big picture and context.

${modeInstruction}

CONTEXT:
${contextText || 'No context provided.'}

RESPONSE FORMAT (JSON):
{
  "answer": "Your response text with [E1], [B1] citations",
  "usedEvidenceIds": ["E1", "B1"],
  "draftArtifact": null,
  "analysisArtifact": null,
  "computeArtifact": null,
  "planArtifact": null,
  "questions": ["Follow-up question 1?", "Question 2?"]
}

Include the artifact matching the mode (draftArtifact for DRAFT, analysisArtifact for ANALYZE, computeArtifact for COMPUTE, planArtifact for PLAN).
Always suggest 2-3 follow-up questions in "questions".`;
}

function buildHistoryMessages(history: DiscussionMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  // Take last 10 messages to keep context manageable
  const recentHistory = history.slice(-10);
  
  return recentHistory
    .filter(msg => msg.role === 'user' || msg.role === 'assistant')
    .map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));
}

function parseAIResponse(responseText: string, allEvidence: EvidenceRef[]): DiscussionAIResponse {
  try {
    // Try to extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        answer: parsed.answer || responseText,
        usedEvidenceIds: parsed.usedEvidenceIds || allEvidence.map(e => e.id),
        draftArtifact: parsed.draftArtifact || undefined,
        analysisArtifact: parsed.analysisArtifact || undefined,
        computeArtifact: parsed.computeArtifact || undefined,
        planArtifact: parsed.planArtifact || undefined,
        questions: parsed.questions || [],
      };
    }
  } catch {
    // JSON parsing failed
  }
  
  // Fallback: treat entire response as answer, use all evidence
  return {
    answer: responseText,
    usedEvidenceIds: allEvidence.map(e => e.id),
    draftArtifact: undefined,
    analysisArtifact: undefined,
    computeArtifact: undefined,
    planArtifact: undefined,
    questions: [],
  };
}

/**
 * Parse SSE stream to get complete response text
 */
async function parseSSEStream(response: Response): Promise<string> {
  if (!response.body) {
    throw new Error('No response body');
  }
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    
    // Process line-by-line
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      let line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.startsWith(':') || line.trim() === '') continue;
      if (!line.startsWith('data: ')) continue;
      
      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') break;
      
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) {
          fullText += content;
        }
      } catch {
        // Incomplete JSON, put back
        buffer = line + '\n' + buffer;
        break;
      }
    }
  }
  
  // Final flush
  if (buffer.trim()) {
    for (let raw of buffer.split('\n')) {
      if (!raw) continue;
      if (raw.endsWith('\r')) raw = raw.slice(0, -1);
      if (raw.startsWith(':') || raw.trim() === '') continue;
      if (!raw.startsWith('data: ')) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === '[DONE]') continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) fullText += content;
      } catch { /* ignore */ }
    }
  }
  
  return fullText;
}

export async function sendDiscussionMessage(
  request: DiscussionAIRequest,
  retryWithPin = true
): Promise<DiscussionAIResponse> {
  const { userText, mode, contextPack, history, language } = request;
  
  // Check if AI token is valid
  if (!isAITokenValid()) {
    if (retryWithPin) {
      try {
        await requestPinDialog();
        return sendDiscussionMessage(request, false);
      } catch {
        throw new AIAuthRetryError('AI authorization cancelled');
      }
    }
    throw new AIAuthRetryError('AI token required');
  }
  
  const systemPrompt = buildSystemPrompt(contextPack.contextText, mode, language);
  const historyMessages = buildHistoryMessages(history);
  
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...historyMessages,
    { role: 'user' as const, content: userText },
  ];
  
  try {
    const response = await fetch(AI_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAITokenHeader(),
      },
      body: JSON.stringify({
        messages,
        model: 'google/gemini-3-flash-preview',
        maxTokens: 2048,
        temperature: 0.7,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      // Check for auth errors
      if (isAuthError(errorData.error) || response.status === 401) {
        if (retryWithPin) {
          try {
            await requestPinDialog();
            return sendDiscussionMessage(request, false);
          } catch {
            throw new AIAuthRetryError('AI authorization cancelled');
          }
        }
        throw new AIAuthRetryError(errorData.error || 'AI authorization failed');
      }
      
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      if (response.status === 402) {
        throw new Error('Payment required. Please add credits.');
      }
      
      throw new Error(errorData.error || `AI request failed: ${response.status}`);
    }
    
    // Parse SSE stream
    const fullText = await parseSSEStream(response);
    
    if (!fullText) {
      throw new Error('Empty AI response');
    }
    
    return parseAIResponse(fullText, contextPack.evidence);
  } catch (error) {
    console.error('[discussions] AI request failed:', error);
    throw error;
  }
}
