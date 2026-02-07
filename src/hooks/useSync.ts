import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import {
  syncEntries,
  fullSync,
  migrateLegacyData,
  loadSyncMeta,
  startAutoSync,
  stopAutoSync,
  type SyncStatus,
} from '@/lib/syncService';
import { toast } from 'sonner';

export function useSync() {
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [migrationProgress, setMigrationProgress] = useState<{ current: number; total: number } | null>(null);

  // Load sync meta on mount and when auth changes
  useEffect(() => {
    const meta = loadSyncMeta();
    setLastSynced(meta.lastSyncedAt);
  }, [isAuthenticated]);

  // Start/stop auto-sync based on auth state
  useEffect(() => {
    if (isAuthenticated) {
      startAutoSync();
    } else {
      stopAutoSync();
    }
    return () => stopAutoSync();
  }, [isAuthenticated]);

  const syncNow = useCallback(async () => {
    if (!isAuthenticated || status === 'syncing') return;

    setStatus('syncing');
    try {
      const result = await syncEntries();
      setLastSynced(new Date().toISOString());
      setStatus('idle');

      if (result.errors.length > 0) {
        console.warn('[Sync] Errors:', result.errors);
      }

      return result;
    } catch (err) {
      setStatus('error');
      console.error('[Sync] Failed:', err);
      throw err;
    }
  }, [isAuthenticated, status]);

  const syncFull = useCallback(async () => {
    if (!isAuthenticated || status === 'syncing') return;

    setStatus('syncing');
    try {
      const result = await fullSync();
      setLastSynced(new Date().toISOString());
      setStatus('idle');
      return result;
    } catch (err) {
      setStatus('error');
      throw err;
    }
  }, [isAuthenticated, status]);

  const migrateData = useCallback(async () => {
    if (!isAuthenticated || status === 'syncing') return;

    setStatus('syncing');
    setMigrationProgress({ current: 0, total: 0 });
    try {
      const result = await migrateLegacyData((current, total) => {
        setMigrationProgress({ current, total });
      });
      setLastSynced(new Date().toISOString());
      setStatus('idle');
      setMigrationProgress(null);
      return result;
    } catch (err) {
      setStatus('error');
      setMigrationProgress(null);
      throw err;
    }
  }, [isAuthenticated, status]);

  return {
    status,
    lastSynced,
    isAuthenticated,
    migrationProgress,
    syncNow,
    syncFull,
    migrateData,
  };
}
