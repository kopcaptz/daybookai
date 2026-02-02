import { getEtherealApiHeaders } from './etherealTokenService';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const BASE_URL = `${SUPABASE_URL}/functions/v1/ethereal_games`;

export interface Boundaries {
  noHumiliation?: boolean;
  noPain?: boolean;
  noThirdParties?: boolean;
  noPastPartners?: boolean;
  romanceOnly?: boolean;
  v?: number;
}

export interface GameSession {
  id: string;
  room_id: string;
  game_type: string;
  status: 'lobby' | 'active' | 'completed';
  current_round: number;
  picker_id: string | null;
  responder_id: string | null;
  adult_level: number;
  consent_picker: boolean;
  consent_responder: boolean;
  boundaries: Boundaries;
  created_at: string;
  updated_at: string;
  picker?: { id: string; display_name: string };
  responder?: { id: string; display_name: string };
}

export interface GameRound {
  id: string;
  session_id: string;
  round_number: number;
  category: string;
  situation_text: string;
  options: { id: string; text: string }[];
  card_type: 'abc' | 'open';
  picker_answer: string | null;
  responder_answer: string | null;
  responder_custom: string | null;
  values_questions: { q: string; a: string | null }[];
  ai_reflection: string | null;
  picker_revealed: boolean;
  created_at: string;
}

export interface Situation {
  id: string;
  text: string;
  cardType: 'abc' | 'open';
  options: { id: string; text: string }[];
  valuesQuestion?: string;
}

export interface Category {
  id: string;
  label: string;
  minLevel: number;
}

async function apiCall<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: string; needsConsent?: boolean }> {
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        ...getEtherealApiHeaders(),
        ...options.headers,
      },
    });

    const data = await response.json();
    
    if (!response.ok || !data.success) {
      return { 
        success: false, 
        error: data.error || 'request_failed',
        needsConsent: data.needsConsent 
      };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Game API error:', error);
    return { success: false, error: 'network_error' };
  }
}

// Create a new game session
export async function createGameSession(adultLevel: number = 0) {
  return apiCall<{ session: GameSession }>('/create', {
    method: 'POST',
    body: JSON.stringify({ adultLevel }),
  });
}

// List active sessions
export async function listGameSessions() {
  return apiCall<{ sessions: GameSession[] }>('/sessions', { method: 'GET' });
}

// Join a session
export async function joinGameSession(sessionId: string) {
  return apiCall<{}>(`/join/${sessionId}`, { method: 'POST' });
}

// Set consent and boundaries
export async function setConsent(sessionId: string, boundaries: Boundaries = {}) {
  return apiCall<{ needsConsent: boolean; session: GameSession }>(
    `/session/${sessionId}/consent`,
    {
      method: 'POST',
      body: JSON.stringify({ boundaries }),
    }
  );
}

// Downshift adult level
export async function setLevel(sessionId: string, level: number) {
  return apiCall<{}>(`/session/${sessionId}/level`, {
    method: 'POST',
    body: JSON.stringify({ level }),
  });
}

// Skip current situation (regenerate)
export async function skipSituation(sessionId: string) {
  return apiCall<{ situation: Situation }>(`/session/${sessionId}/skip`, {
    method: 'POST',
  });
}

// Start the game
export async function startGame(sessionId: string) {
  return apiCall<{}>(`/start/${sessionId}`, { method: 'POST' });
}

// Generate situations for a category
export async function generateSituations(sessionId: string, category: string) {
  return apiCall<{ situations: Situation[] }>('/generate', {
    method: 'POST',
    body: JSON.stringify({ sessionId, category }),
  });
}

// Picker selects a situation
export async function pickSituation(
  sessionId: string,
  category: string,
  situation: Situation,
  pickerAnswer: string
) {
  return apiCall<{ round: GameRound }>(`/pick/${sessionId}`, {
    method: 'POST',
    body: JSON.stringify({ category, situation, pickerAnswer }),
  });
}

// Get current round data
export async function getCurrentRound(sessionId: string) {
  return apiCall<{
    session: GameSession;
    round: GameRound | null;
    myRole: 'picker' | 'responder' | 'spectator';
  }>(`/round/${sessionId}`, { method: 'GET' });
}

// Responder answers
export async function respondToSituation(
  sessionId: string,
  answer: string,
  customAnswer?: string
) {
  return apiCall<{}>(`/respond/${sessionId}`, {
    method: 'POST',
    body: JSON.stringify({ answer, customAnswer }),
  });
}

// Picker reveals their answer
export async function revealPickerAnswer(sessionId: string) {
  return apiCall<{}>(`/reveal/${sessionId}`, { method: 'POST' });
}

// Request AI reflection
export async function requestReflection(sessionId: string) {
  return apiCall<{ reflection: string }>(`/reflect/${sessionId}`, {
    method: 'POST',
  });
}

// Move to next round
export async function nextRound(sessionId: string) {
  return apiCall<{}>(`/next/${sessionId}`, { method: 'POST' });
}

// End the game
export async function endGame(sessionId: string) {
  return apiCall<{}>(`/end/${sessionId}`, { method: 'POST' });
}

// Categories - now level-based
export const GAME_CATEGORIES: Category[] = [
  { id: 'budget', label: 'Финансы', minLevel: 0 },
  { id: 'boundaries', label: 'Личные границы', minLevel: 0 },
  { id: 'lifestyle', label: 'Быт', minLevel: 0 },
  { id: 'social', label: 'Друзья и семья', minLevel: 0 },
  { id: 'travel', label: 'Путешествия', minLevel: 0 },
  { id: 'romance', label: 'Романтика', minLevel: 1 },
  { id: 'intimacy', label: 'Близость', minLevel: 2 },
  { id: 'fantasies', label: 'Желания', minLevel: 3 },
];

export function getAvailableCategories(adultLevel: number): Category[] {
  return GAME_CATEGORIES.filter((c) => c.minLevel <= adultLevel);
}

// Level labels
export const LEVEL_LABELS = [
  { level: 0, name: 'Лёгкий', icon: null, description: 'Быт, ценности, планы' },
  { level: 1, name: 'Романтический', icon: '🔥', description: 'Поцелуи, нежность' },
  { level: 2, name: 'Чувственный', icon: '🔥🔥', description: 'Желания, прелюдия' },
  { level: 3, name: 'Откровенный', icon: '🔥🔥🔥', description: 'Предпочтения, границы' },
];

export function getLevelLabel(level: number) {
  return LEVEL_LABELS[level] || LEVEL_LABELS[0];
}
