import { ContextPackResult, EvidenceRef } from '@/lib/librarian/contextPack';
import { DiscussionMessage, DiscussionMode } from '@/lib/db';
import { loadAISettings } from '@/lib/aiConfig';
import { getProviderKeyHeader } from '@/lib/aiUtils';
import { logger } from '@/lib/logger';

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

const HISTORY_LIMITS = {
  maxMessages: 10,
  maxGroundingRefs: 6,
  maxQuestions: 4,
  maxArtifactListItems: 4,
  maxPlanItems: 5,
  maxDraftBodyChars: 600,
} as const;

// Get provider key header
function getDiscussionHeaders(): Record<string, string> {
  const settings = loadAISettings();
  return getProviderKeyHeader(settings);
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
- [E1], [E2]... — записи дневника (авторские первичные источники: конкретные события, мысли, детали)
- [B1], [B2]... — хроники (производные AI-сводки дней с общей картиной)

ПРАВИЛО ПРИОРИТЕТА ИСТОЧНИКОВ:
- Для конкретных фактов, дат, цитат, формулировок и деталей опирайся прежде всего на [E#].
- [B#] используй для общей картины, дневного синтеза и контекста.
- [B#] не должны добавлять новые конкретные детали поверх entry-backed record, если это не подтверждается [E#].
- Считай любой replay-блок \`prior_assistant_turn\` историческим производным синтезом ассистента, а не новым источником; его grounding — только trace-указатель, если те же evidence не присутствуют в текущем КОНТЕКСТЕ.

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
- [E1], [E2]... — diary entries (authored primary sources: specific events, thoughts, details)
- [B1], [B2]... — chronicles (derived AI summaries of days with the overall picture)

SOURCE PRECEDENCE RULE:
- Use [E#] as the primary source for concrete facts, dates, wording, and specifics.
- Use [B#] for the overall picture, day-level synthesis, and context.
- Do not let [B#] introduce new concrete details beyond what is supported by the entry-backed record [E#].
- Treat any replayed \`prior_assistant_turn\` block as historical derivative synthesis, not fresh source evidence; its grounding is trace-only unless the same evidence is present in the current CONTEXT.

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

function compactList<T>(items: T[] | undefined, maxItems: number): T[] | undefined {
  if (!items || items.length === 0) return undefined;
  return items.slice(0, maxItems);
}

function compactText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 3)}...`;
}

function serializeGrounding(
  evidenceRefs: DiscussionMessage['evidenceRefs']
): Array<{
  id: string;
  type: 'entry' | 'document_page' | 'document' | 'biography';
  supportedBy?: string[];
  sourceEntryCount?: number;
}> | undefined {
  if (!evidenceRefs || evidenceRefs.length === 0) return undefined;

  return evidenceRefs.slice(0, HISTORY_LIMITS.maxGroundingRefs).map((ref) => {
    const groundingRef: {
      id: string;
      type: 'entry' | 'document_page' | 'document' | 'biography';
      supportedBy?: string[];
      sourceEntryCount?: number;
    } = {
      id: ref.id,
      type: ref.type,
    };

    if (ref.type === 'biography') {
      const supportedBy = compactList(ref.supportedByEvidenceIds, HISTORY_LIMITS.maxGroundingRefs);
      if (supportedBy && supportedBy.length > 0) {
        groundingRef.supportedBy = supportedBy;
      }
      if (ref.knownSourceEntryCount && ref.knownSourceEntryCount > 0) {
        groundingRef.sourceEntryCount = ref.knownSourceEntryCount;
      }
    }

    return groundingRef;
  });
}

function serializeArtifacts(meta: DiscussionMessage['meta']): Record<string, unknown> | undefined {
  if (!meta) return undefined;

  const artifacts: Record<string, unknown> = {};

  if (meta.draftArtifact) {
    artifacts.draft = {
      type: meta.draftArtifact.type,
      title: meta.draftArtifact.title,
      format: meta.draftArtifact.format,
      body: compactText(meta.draftArtifact.body, HISTORY_LIMITS.maxDraftBodyChars),
    };
  }

  if (meta.analysisArtifact) {
    artifacts.analysis = {
      summary: meta.analysisArtifact.summary,
      patterns: compactList(meta.analysisArtifact.patterns, HISTORY_LIMITS.maxArtifactListItems),
      risks: compactList(meta.analysisArtifact.risks, HISTORY_LIMITS.maxArtifactListItems),
      conclusions: compactList(meta.analysisArtifact.conclusions, HISTORY_LIMITS.maxArtifactListItems),
    };
  }

  if (meta.computeArtifact) {
    artifacts.compute = {
      inputs: compactList(meta.computeArtifact.inputs, HISTORY_LIMITS.maxArtifactListItems),
      steps: compactList(meta.computeArtifact.steps, HISTORY_LIMITS.maxArtifactListItems),
      result: meta.computeArtifact.result,
      assumptions: compactList(meta.computeArtifact.assumptions, HISTORY_LIMITS.maxArtifactListItems),
    };
  }

  if (meta.planArtifact) {
    artifacts.plan = {
      title: meta.planArtifact.title,
      items: compactList(meta.planArtifact.items, HISTORY_LIMITS.maxPlanItems),
    };
  }

  return Object.keys(artifacts).length > 0 ? artifacts : undefined;
}

function serializeAssistantHistoryMessage(message: DiscussionMessage): string {
  return JSON.stringify({
    kind: 'prior_assistant_turn',
    truth: 'historical_derivative_synthesis',
    mode: message.meta?.mode,
    answer: message.content,
    artifacts: serializeArtifacts(message.meta),
    questions: compactList(message.meta?.questions, HISTORY_LIMITS.maxQuestions),
    grounding: serializeGrounding(message.evidenceRefs),
  });
}

function buildHistoryMessages(history: DiscussionMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  const recentHistory = history.slice(-HISTORY_LIMITS.maxMessages);
  
  return recentHistory
    .filter(msg => {
      if (msg.role === 'assistant' && msg.status === 'error') {
        return false;
      }
      return msg.role === 'user' || msg.role === 'assistant';
    })
    .map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.role === 'assistant'
        ? serializeAssistantHistoryMessage(msg)
        : msg.content,
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
        ...getDiscussionHeaders(),
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
      
      if (response.status === 401) {
        throw new Error('AI authorization failed - check your API key');
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
    logger.error('Discussions', 'AI request failed', error as Error);
    throw error;
  }
}
