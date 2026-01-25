// AI Access Token Service
// Manages the session token for AI features (not user auth)

const TOKEN_STORAGE_KEY = 'daybook-ai-token';
const TOKEN_EXPIRY_KEY = 'daybook-ai-token-expires';

export interface AIToken {
  token: string;
  expiresAt: number;
}

/**
 * Get the stored AI access token
 */
export function getAIToken(): AIToken | null {
  try {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    const expiresAt = localStorage.getItem(TOKEN_EXPIRY_KEY);
    
    if (!token || !expiresAt) {
      return null;
    }
    
    return {
      token,
      expiresAt: parseInt(expiresAt, 10),
    };
  } catch (e) {
    console.warn('Failed to get AI token:', e);
    return null;
  }
}

/**
 * Store the AI access token
 */
export function setAIToken(token: string, expiresAt: number): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(TOKEN_EXPIRY_KEY, expiresAt.toString());
  } catch (e) {
    console.warn('Failed to store AI token:', e);
  }
}

/**
 * Clear the stored AI access token
 */
export function clearAIToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
  } catch (e) {
    console.warn('Failed to clear AI token:', e);
  }
}

/**
 * Check if the current token is valid (exists and not expired)
 */
export function isAITokenValid(): boolean {
  const tokenData = getAIToken();
  if (!tokenData) return false;
  
  // Add 60 second buffer for clock skew
  const now = Date.now();
  return tokenData.expiresAt > now + 60000;
}

/**
 * Get remaining time until token expires (in ms)
 * Returns 0 if no token or expired
 */
export function getTokenRemainingTime(): number {
  const tokenData = getAIToken();
  if (!tokenData) return 0;
  
  const remaining = tokenData.expiresAt - Date.now();
  return Math.max(0, remaining);
}

/**
 * Format remaining time as human-readable string
 */
export function formatTokenExpiry(language: 'ru' | 'en'): string {
  const remaining = getTokenRemainingTime();
  if (remaining <= 0) {
    return language === 'ru' ? 'Истёк' : 'Expired';
  }
  
  const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
  const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  
  if (days > 0) {
    return language === 'ru' 
      ? `${days} д. ${hours} ч.` 
      : `${days}d ${hours}h`;
  }
  
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  return language === 'ru' 
    ? `${hours} ч. ${minutes} мин.` 
    : `${hours}h ${minutes}m`;
}

/**
 * Verify PIN with server and store token
 */
export async function verifyPinAndGetToken(pin: string): Promise<{
  success: boolean;
  error?: string;
  requestId?: string;
}> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    
    const response = await fetch(`${supabaseUrl}/functions/v1/ai-pin-verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pin }),
    });
    
    const data = await response.json();
    
    if (data.success && data.token && data.expiresAt) {
      setAIToken(data.token, data.expiresAt);
      return { success: true, requestId: data.requestId };
    }
    
    return {
      success: false,
      error: data.error || 'unknown_error',
      requestId: data.requestId,
    };
  } catch (e) {
    console.error('PIN verification failed:', e);
    return {
      success: false,
      error: 'network_error',
    };
  }
}
