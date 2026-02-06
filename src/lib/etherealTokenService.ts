/**
 * ETHEREAL TOKEN SERVICE
 * ======================
 *
 * SECURITY MODEL: Device-based sessions with HMAC tokens
 *
 * This service manages client-side storage of Ethereal session credentials.
 * The token stored here is an HMAC-signed payload containing:
 * - roomId: which room the session belongs to
 * - memberId: which member identity this device uses
 * - sessionId: database session ID (for revocation support)
 * - exp: expiration timestamp (7 days from creation)
 *
 * IMPORTANT SECURITY NOTES:
 * 1. Token stored in localStorage - provides session persistence across reloads
 * 2. Token is validated server-side on EVERY API call (Edge Functions)
 * 3. Even with valid token signature, server checks ethereal_sessions table
 *    to ensure session hasn't been revoked (kicked by room owner)
 * 4. channelKey (256-bit) is used for Supabase Realtime channel names,
 *    preventing unauthorized subscription to private room broadcasts
 *
 * This is NOT admin/role-based access control - it's a symmetric shared
 * secret system for partner pairs. Both partners have equal access.
 *
 * TOKEN FORMAT: base64(payload).base64(hmac-sha256-signature)
 * - Payload: { roomId, memberId, sessionId, iat, exp }
 * - Signature: HMAC-SHA256(payload, ETHEREAL_TOKEN_SECRET)
 *
 * @see supabase/functions/ethereal_join/index.ts - Token generation
 * @see supabase/functions/ethereal_messages/index.ts - Token validation
 */

const KEYS = {
  token: 'ethereal-access-token',
  roomId: 'ethereal-room-id',
  memberId: 'ethereal-member-id',
  channelKey: 'ethereal-channel-key',
  expiresAt: 'ethereal-expires-at',
  isOwner: 'ethereal-is-owner',
  displayName: 'ethereal-display-name',
};

export interface EtherealSession {
  token: string;
  roomId: string;
  memberId: string;
  channelKey: string;
  expiresAt: number;
  isOwner: boolean;
  displayName: string;
}

export function getEtherealSession(): EtherealSession | null {
  try {
    const token = localStorage.getItem(KEYS.token);
    const roomId = localStorage.getItem(KEYS.roomId);
    const memberId = localStorage.getItem(KEYS.memberId);
    const channelKey = localStorage.getItem(KEYS.channelKey);
    const expiresAt = localStorage.getItem(KEYS.expiresAt);
    const isOwner = localStorage.getItem(KEYS.isOwner);
    const displayName = localStorage.getItem(KEYS.displayName);

    if (!token || !roomId || !memberId || !channelKey || !expiresAt || !displayName) {
      return null;
    }

    return {
      token,
      roomId,
      memberId,
      channelKey,
      expiresAt: parseInt(expiresAt, 10),
      isOwner: isOwner === 'true',
      displayName,
    };
  } catch {
    return null;
  }
}

export function setEtherealSession(session: EtherealSession): void {
  localStorage.setItem(KEYS.token, session.token);
  localStorage.setItem(KEYS.roomId, session.roomId);
  localStorage.setItem(KEYS.memberId, session.memberId);
  localStorage.setItem(KEYS.channelKey, session.channelKey);
  localStorage.setItem(KEYS.expiresAt, session.expiresAt.toString());
  localStorage.setItem(KEYS.isOwner, session.isOwner.toString());
  localStorage.setItem(KEYS.displayName, session.displayName);
}

export function isEtherealSessionValid(): boolean {
  const session = getEtherealSession();
  if (!session) return false;
  return Date.now() < session.expiresAt;
}

export function clearEtherealSession(): void {
  Object.values(KEYS).forEach((key) => {
    localStorage.removeItem(key);
  });
}

export function getEtherealApiHeaders(): Record<string, string> {
  const session = getEtherealSession();
  if (!session) return {};
  return {
    'X-Ethereal-Token': session.token,
    'Content-Type': 'application/json',
  };
}
