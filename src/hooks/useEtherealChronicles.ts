import { useState, useCallback, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { etherealDb, EtherealChronicle } from '@/lib/etherealDb';
import { getEtherealSession } from '@/lib/etherealTokenService';

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

interface UseEtherealChroniclesResult {
  chronicles: EtherealChronicle[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createChronicle: (title: string, content: string, tags?: string[]) => Promise<EtherealChronicle | null>;
  updateChronicle: (serverId: string, data: { title?: string; content?: string; tags?: string[] }) => Promise<EtherealChronicle | null>;
  togglePin: (serverId: string) => Promise<boolean>;
  lockChronicle: (serverId: string) => Promise<{ locked: boolean; expiresAt?: number; lockedByName?: string } | null>;
  unlockChronicle: (serverId: string) => Promise<boolean>;
  getChronicle: (serverId: string) => Promise<EtherealChronicle | null>;
}

export function useEtherealChronicles(): UseEtherealChroniclesResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const session = getEtherealSession();
  const roomId = session?.roomId;

  // Live query from local DB, sorted by pinned DESC, updatedAtMs DESC
  const chronicles = useLiveQuery(
    async () => {
      if (!roomId) return [];
      const all = await etherealDb.chronicles.where('roomId').equals(roomId).toArray();
      return all.sort((a, b) => {
        // Pinned first
        if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
        // Then by updatedAtMs DESC
        return b.updatedAtMs - a.updatedAtMs;
      });
    },
    [roomId],
    []
  );

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const getHeaders = useCallback(() => {
    const session = getEtherealSession();
    if (!session?.token) throw new Error('No session');
    return {
      'Content-Type': 'application/json',
      'X-Ethereal-Token': session.token,
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${FUNCTIONS_URL}/ethereal_chronicles`, {
        headers: getHeaders(),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch chronicles');
      }

      const { chronicles: serverChronicles } = await res.json();

      // Upsert to local DB
      if (serverChronicles && serverChronicles.length > 0) {
        const toUpsert: EtherealChronicle[] = serverChronicles.map((c: EtherealChronicle) => ({
          ...c,
          syncStatus: 'synced' as const,
        }));
        await etherealDb.chronicles.bulkPut(toUpsert);
      }
    } catch (err) {
      console.error('[useEtherealChronicles] refresh error:', err);
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [roomId, getHeaders]);

  // Refresh on mount
  useEffect(() => {
    if (roomId) {
      refresh();
    }
  }, [roomId, refresh]);

  const createChronicle = useCallback(
    async (title: string, content: string, tags: string[] = []): Promise<EtherealChronicle | null> => {
      try {
        const res = await fetch(`${FUNCTIONS_URL}/ethereal_chronicles`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ title, content, tags }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to create chronicle');
        }

        const { chronicle } = await res.json();
        
        // Save to local DB
        await etherealDb.chronicles.put({
          ...chronicle,
          syncStatus: 'synced',
        });

        return chronicle;
      } catch (err) {
        console.error('[useEtherealChronicles] create error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        return null;
      }
    },
    [getHeaders]
  );

  const updateChronicle = useCallback(
    async (serverId: string, data: { title?: string; content?: string; tags?: string[] }): Promise<EtherealChronicle | null> => {
      try {
        const res = await fetch(`${FUNCTIONS_URL}/ethereal_chronicles/${serverId}`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify(data),
        });

        if (!res.ok) {
          const resData = await res.json();
          throw new Error(resData.error || 'Failed to update chronicle');
        }

        const { chronicle } = await res.json();
        
        // Update local DB
        await etherealDb.chronicles.put({
          ...chronicle,
          syncStatus: 'synced',
        });

        return chronicle;
      } catch (err) {
        console.error('[useEtherealChronicles] update error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        return null;
      }
    },
    [getHeaders]
  );

  const togglePin = useCallback(
    async (serverId: string): Promise<boolean> => {
      try {
        const res = await fetch(`${FUNCTIONS_URL}/ethereal_chronicles/${serverId}/pin`, {
          method: 'POST',
          headers: getHeaders(),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to toggle pin');
        }

        const { pinned } = await res.json();
        
        // Update local DB
        await etherealDb.chronicles.update(serverId, { pinned });

        return pinned;
      } catch (err) {
        console.error('[useEtherealChronicles] togglePin error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        return false;
      }
    },
    [getHeaders]
  );

  const lockChronicle = useCallback(
    async (serverId: string): Promise<{ locked: boolean; expiresAt?: number; lockedByName?: string } | null> => {
      try {
        const res = await fetch(`${FUNCTIONS_URL}/ethereal_chronicles/${serverId}/lock`, {
          method: 'POST',
          headers: getHeaders(),
        });

        const data = await res.json();

        if (res.status === 423) {
          // Locked by another user
          return {
            locked: false,
            lockedByName: data.lockedByName,
            expiresAt: data.expiresAt,
          };
        }

        if (!res.ok) {
          throw new Error(data.error || 'Failed to lock chronicle');
        }

        return { locked: true, expiresAt: data.expiresAt };
      } catch (err) {
        console.error('[useEtherealChronicles] lock error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        return null;
      }
    },
    [getHeaders]
  );

  const unlockChronicle = useCallback(
    async (serverId: string): Promise<boolean> => {
      try {
        const res = await fetch(`${FUNCTIONS_URL}/ethereal_chronicles/${serverId}/unlock`, {
          method: 'POST',
          headers: getHeaders(),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to unlock chronicle');
        }

        return true;
      } catch (err) {
        console.error('[useEtherealChronicles] unlock error:', err);
        return false;
      }
    },
    [getHeaders]
  );

  const getChronicle = useCallback(
    async (serverId: string): Promise<EtherealChronicle | null> => {
      try {
        const res = await fetch(`${FUNCTIONS_URL}/ethereal_chronicles/${serverId}`, {
          headers: getHeaders(),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Chronicle not found');
        }

        const { chronicle } = await res.json();
        
        // Update local DB
        await etherealDb.chronicles.put({
          ...chronicle,
          syncStatus: 'synced',
        });

        return chronicle;
      } catch (err) {
        console.error('[useEtherealChronicles] getChronicle error:', err);
        return null;
      }
    },
    [getHeaders]
  );

  return {
    chronicles,
    loading,
    error,
    refresh,
    createChronicle,
    updateChronicle,
    togglePin,
    lockChronicle,
    unlockChronicle,
    getChronicle,
  };
}
