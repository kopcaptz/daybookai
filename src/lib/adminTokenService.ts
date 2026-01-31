const ADMIN_TOKEN_KEY = 'daybook-admin-token';
const ADMIN_TOKEN_EXPIRY_KEY = 'daybook-admin-token-expiry';

export interface AdminTokenData {
  token: string;
  expiresAt: number;
}

export function getAdminToken(): AdminTokenData | null {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  const expiresAt = localStorage.getItem(ADMIN_TOKEN_EXPIRY_KEY);
  
  if (!token || !expiresAt) {
    return null;
  }
  
  const expiry = parseInt(expiresAt, 10);
  
  // Check if token is expired (with 5 minute buffer)
  if (Date.now() > expiry - 5 * 60 * 1000) {
    clearAdminToken();
    return null;
  }
  
  return { token, expiresAt: expiry };
}

export function setAdminToken(token: string, expiresAt: number): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
  localStorage.setItem(ADMIN_TOKEN_EXPIRY_KEY, expiresAt.toString());
}

export function clearAdminToken(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_TOKEN_EXPIRY_KEY);
}

export function isAdminAuthenticated(): boolean {
  return getAdminToken() !== null;
}
