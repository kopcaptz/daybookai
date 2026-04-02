import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({}));
vi.mock('@/lib/aiConfig', () => ({
  loadAISettings: vi.fn(() => ({ provider: 'test' })),
}));
vi.mock('@/lib/aiUtils', () => ({
  getProviderKeyHeader: vi.fn(() => ({ Authorization: 'Bearer test-key' })),
}));
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

import { sendDiscussionMessage } from './discussions';

function createSseResponse(content: string): Response {
  const payload = `data: ${JSON.stringify({
    choices: [{ delta: { content } }],
  })}

data: [DONE]
`;

  return new Response(payload, { status: 200 });
}

describe('discussion history replay truth', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('replays assistant turns as explicit historical synthesis records and skips error turns', async () => {
    fetchMock.mockResolvedValue(
      createSseResponse(JSON.stringify({
        answer: 'Fresh answer',
        usedEvidenceIds: ['E1'],
        questions: [],
      }))
    );

    await sendDiscussionMessage({
      sessionId: 42,
      userText: 'What next?',
      mode: 'discuss',
      language: 'en',
      contextPack: {
        contextText: 'Current context',
        evidence: [],
      },
      history: [
        {
          sessionId: 42,
          role: 'user',
          content: 'Earlier user question',
          createdAt: 1,
        },
        {
          sessionId: 42,
          role: 'assistant',
          content: 'Prior assistant answer',
          createdAt: 2,
          status: 'ok',
          evidenceRefs: [
            {
              id: 'E1',
              type: 'entry',
              title: 'Entry 1',
              deepLink: '/entry/1',
              entityId: 1,
            },
            {
              id: 'B1',
              type: 'biography',
              title: 'Chronicle',
              deepLink: '/day/2026-04-01',
              entityId: 0,
              supportedByEvidenceIds: ['E1', 'E2'],
              knownSourceEntryCount: 2,
            },
          ],
          meta: {
            mode: 'analyze',
            analysisArtifact: {
              type: 'analysis',
              summary: 'Summary',
              patterns: ['p1', 'p2', 'p3', 'p4', 'p5'],
              risks: ['r1'],
              conclusions: ['c1', 'c2'],
            },
            questions: ['q1', 'q2', 'q3', 'q4', 'q5'],
          },
        },
        {
          sessionId: 42,
          role: 'assistant',
          content: 'Transport error text',
          createdAt: 3,
          status: 'error',
        },
      ],
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);

    expect(body.messages).toHaveLength(4);
    expect(body.messages[1]).toEqual({
      role: 'user',
      content: 'Earlier user question',
    });
    expect(body.messages[2].role).toBe('assistant');
    expect(body.messages[2].content).not.toBe('Prior assistant answer');

    const replay = JSON.parse(body.messages[2].content);
    expect(replay).toEqual({
      kind: 'prior_assistant_turn',
      truth: 'historical_derivative_synthesis',
      mode: 'analyze',
      answer: 'Prior assistant answer',
      artifacts: {
        analysis: {
          summary: 'Summary',
          patterns: ['p1', 'p2', 'p3', 'p4'],
          risks: ['r1'],
          conclusions: ['c1', 'c2'],
        },
      },
      questions: ['q1', 'q2', 'q3', 'q4'],
      grounding: [
        { handle: 'entry:1', type: 'entry' },
        { handle: 'biography:2026-04-01', type: 'biography', supportedByHandles: ['entry:1'], sourceEntryCount: 2 },
      ],
    });
    expect(body.messages[3]).toEqual({
      role: 'user',
      content: 'What next?',
    });
  });

  it('adds a system prompt rule that demotes replayed assistant blocks to trace-only history', async () => {
    fetchMock.mockResolvedValue(
      createSseResponse(JSON.stringify({
        answer: 'Fresh answer',
        usedEvidenceIds: [],
        questions: [],
      }))
    );

    await sendDiscussionMessage({
      sessionId: 7,
      userText: 'Continue',
      mode: 'discuss',
      language: 'en',
      contextPack: {
        contextText: 'Current context',
        evidence: [],
      },
      history: [],
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);

    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('prior_assistant_turn');
    expect(body.messages[0].content).toContain('historical derivative synthesis');
    expect(body.messages[0].content).toContain('trace-only unless the same `stableHandle` is present in the current CONTEXT');
    expect(body.messages[0].content).toContain('Do not treat prior aliases like `E1` or `B1` as cross-turn identity');
  });
});
