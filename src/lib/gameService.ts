import { getEtherealApiHeaders } from './etherealTokenService';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const BASE_URL = `${SUPABASE_URL}/functions/v1/ethereal_games`;

export interface GameSession {
  id: string;
  room_id: string;
  game_type: string;
  status: 'lobby' | 'active' | 'completed';
  current_round: number;
  picker_id: string | null;
  responder_id: string | null;
  adult_mode: boolean;
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
  options: { id: string; text: string }[];
  valuesQuestion?: string;
}

export interface Category {
  id: string;
  label: string;
  adult: boolean;
}

async function apiCall<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
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
      return { success: false, error: data.error || 'request_failed' };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Game API error:', error);
    return { success: false, error: 'network_error' };
  }
}

// Create a new game session
export async function createGameSession(adultMode: boolean = false) {
  return apiCall<{ session: GameSession }>('/create', {
    method: 'POST',
    body: JSON.stringify({ adultMode }),
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

// Categories
export const GAME_CATEGORIES: Category[] = [
  { id: 'budget', label: 'Финансы', adult: false },
  { id: 'boundaries', label: 'Личные границы', adult: false },
  { id: 'lifestyle', label: 'Быт', adult: false },
  { id: 'social', label: 'Друзья и семья', adult: false },
  { id: 'travel', label: 'Путешествия', adult: false },
  { id: 'intimacy', label: 'Близость', adult: true },
  { id: 'fantasies', label: 'Желания', adult: true },
];

export function getAvailableCategories(adultMode: boolean): Category[] {
  return GAME_CATEGORIES.filter((c) => adultMode || !c.adult);
}
