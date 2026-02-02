import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getEtherealSession,
  getEtherealApiHeaders,
  clearEtherealSession,
} from '@/lib/etherealTokenService';
import { etherealDb, type EtherealTask } from '@/lib/etherealDb';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// Sort tasks by group priority then updatedAtMs
function sortTasks(tasks: EtherealTask[]): EtherealTask[] {
  const now = Date.now();
  const urgentThreshold = 24 * 60 * 60 * 1000; // 24 hours

  // Group order: urgent -> todo -> done
  const getGroupPriority = (task: EtherealTask): number => {
    if (task.status === 'done') return 3;
    const isUrgent = task.priority === 'urgent' || 
      (task.dueAtMs && task.dueAtMs < now + urgentThreshold);
    return isUrgent ? 1 : 2;
  };

  return [...tasks].sort((a, b) => {
    const groupA = getGroupPriority(a);
    const groupB = getGroupPriority(b);
    if (groupA !== groupB) return groupA - groupB;
    return b.updatedAtMs - a.updatedAtMs;
  });
}

export interface TaskInput {
  title: string;
  description?: string;
  assigneeId?: string;
  dueAt?: string;
  priority?: 'normal' | 'urgent';
}

export function useEtherealTasks() {
  const [tasks, setTasks] = useState<EtherealTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const seenEventsRef = useRef(new Set<string>());
  const session = getEtherealSession();

  // Load tasks from server
  const loadTasks = useCallback(async (includeDone = true) => {
    const currentSession = getEtherealSession();
    if (!currentSession) return;

    try {
      const params = new URLSearchParams({
        includeDone: includeDone.toString(),
        limit: '80',
      });

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/ethereal_tasks?${params}`,
        { headers: getEtherealApiHeaders() }
      );

      if (response.status === 401 || response.status === 403) {
        clearEtherealSession();
        window.dispatchEvent(new CustomEvent('ethereal-session-expired'));
        return;
      }

      const data = await response.json();
      if (data.success && Array.isArray(data.tasks)) {
        // Store in Dexie
        const tasksWithSync: EtherealTask[] = data.tasks.map((t: any) => ({
          ...t,
          syncStatus: 'synced' as const,
        }));

        await etherealDb.tasks.bulkPut(tasksWithSync);
        setTasks(sortTasks(tasksWithSync));
        setError(null);
      }
    } catch (e) {
      console.error('[useEtherealTasks] loadTasks error:', e);
      setError('Не удалось загрузить задачи');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (!session?.channelKey) return;
    loadTasks();
  }, [session?.channelKey, loadTasks]);

  // Subscribe to broadcast events (using same channel as messages)
  useEffect(() => {
    if (!session?.channelKey) return;

    const channel = supabase.channel(`ethereal:${session.channelKey}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'task_upsert' }, async ({ payload }) => {
        if (!payload?.serverId) return;

        const eventKey = `${payload.serverId}-${payload.updatedAtMs}`;
        if (seenEventsRef.current.has(eventKey)) return;
        seenEventsRef.current.add(eventKey);

        console.log('[Tasks] broadcast:task_upsert', payload.serverId);

        const task: EtherealTask = {
          ...payload,
          syncStatus: 'synced',
        };

        // Update UI
        setTasks((prev) => {
          const filtered = prev.filter((t) => t.serverId !== task.serverId);
          return sortTasks([...filtered, task]);
        });

        // Persist to Dexie
        await etherealDb.tasks.put(task);

        // Cleanup set
        if (seenEventsRef.current.size > 500) {
          seenEventsRef.current.clear();
        }
      })
      .on('broadcast', { event: 'task_delete' }, async ({ payload }) => {
        if (!payload?.taskId) return;

        console.log('[Tasks] broadcast:task_delete', payload.taskId);

        setTasks((prev) => prev.filter((t) => t.serverId !== payload.taskId));
        await etherealDb.tasks.delete(payload.taskId);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [session?.channelKey]);

  // Create task
  const createTask = useCallback(async (input: TaskInput) => {
    const currentSession = getEtherealSession();
    if (!currentSession) return { success: false, error: 'no_session' };

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/ethereal_tasks`, {
        method: 'POST',
        headers: getEtherealApiHeaders(),
        body: JSON.stringify(input),
      });

      if (response.status === 401 || response.status === 403) {
        clearEtherealSession();
        window.dispatchEvent(new CustomEvent('ethereal-session-expired'));
        return { success: false, error: 'session_expired' };
      }

      const data = await response.json();
      if (!data.success) return { success: false, error: data.error };

      const task: EtherealTask = {
        ...data.task,
        syncStatus: 'synced',
      };

      // Update UI
      setTasks((prev) => sortTasks([...prev, task]));

      // Persist
      await etherealDb.tasks.put(task);

      // Broadcast to others
      channelRef.current?.send({
        type: 'broadcast',
        event: 'task_upsert',
        payload: task,
      });

      return { success: true, task };
    } catch (e) {
      console.error('[useEtherealTasks] createTask error:', e);
      return { success: false, error: 'network_error' };
    }
  }, []);

  // Update task
  const updateTask = useCallback(async (taskId: string, input: Partial<TaskInput>) => {
    const currentSession = getEtherealSession();
    if (!currentSession) return { success: false, error: 'no_session' };

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/ethereal_tasks/${taskId}`, {
        method: 'PUT',
        headers: getEtherealApiHeaders(),
        body: JSON.stringify(input),
      });

      if (response.status === 401 || response.status === 403) {
        clearEtherealSession();
        window.dispatchEvent(new CustomEvent('ethereal-session-expired'));
        return { success: false, error: 'session_expired' };
      }

      const data = await response.json();
      if (!data.success) return { success: false, error: data.error };

      const task: EtherealTask = {
        ...data.task,
        syncStatus: 'synced',
      };

      // Update UI
      setTasks((prev) => {
        const filtered = prev.filter((t) => t.serverId !== taskId);
        return sortTasks([...filtered, task]);
      });

      // Persist
      await etherealDb.tasks.put(task);

      // Broadcast
      channelRef.current?.send({
        type: 'broadcast',
        event: 'task_upsert',
        payload: task,
      });

      return { success: true, task };
    } catch (e) {
      console.error('[useEtherealTasks] updateTask error:', e);
      return { success: false, error: 'network_error' };
    }
  }, []);

  // Toggle task status (done <-> todo)
  const toggleTask = useCallback(async (taskId: string) => {
    const currentSession = getEtherealSession();
    if (!currentSession) return { success: false, error: 'no_session' };

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/ethereal_tasks/${taskId}/toggle`, {
        method: 'POST',
        headers: getEtherealApiHeaders(),
      });

      if (response.status === 401 || response.status === 403) {
        clearEtherealSession();
        window.dispatchEvent(new CustomEvent('ethereal-session-expired'));
        return { success: false, error: 'session_expired' };
      }

      const data = await response.json();
      if (!data.success) return { success: false, error: data.error };

      const task: EtherealTask = {
        ...data.task,
        syncStatus: 'synced',
      };

      // Update UI
      setTasks((prev) => {
        const filtered = prev.filter((t) => t.serverId !== taskId);
        return sortTasks([...filtered, task]);
      });

      // Persist
      await etherealDb.tasks.put(task);

      // Broadcast
      channelRef.current?.send({
        type: 'broadcast',
        event: 'task_upsert',
        payload: task,
      });

      return { success: true, task };
    } catch (e) {
      console.error('[useEtherealTasks] toggleTask error:', e);
      return { success: false, error: 'network_error' };
    }
  }, []);

  // Delete task
  const deleteTask = useCallback(async (taskId: string) => {
    const currentSession = getEtherealSession();
    if (!currentSession) return { success: false, error: 'no_session' };

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/ethereal_tasks/${taskId}`, {
        method: 'DELETE',
        headers: getEtherealApiHeaders(),
      });

      if (response.status === 401 || response.status === 403) {
        clearEtherealSession();
        window.dispatchEvent(new CustomEvent('ethereal-session-expired'));
        return { success: false, error: 'session_expired' };
      }

      const data = await response.json();
      if (!data.success) return { success: false, error: data.error };

      // Update UI
      setTasks((prev) => prev.filter((t) => t.serverId !== taskId));

      // Remove from Dexie
      await etherealDb.tasks.delete(taskId);

      // Broadcast
      channelRef.current?.send({
        type: 'broadcast',
        event: 'task_delete',
        payload: { taskId },
      });

      return { success: true };
    } catch (e) {
      console.error('[useEtherealTasks] deleteTask error:', e);
      return { success: false, error: 'network_error' };
    }
  }, []);

  // Group tasks by status
  const groupedTasks = {
    urgent: tasks.filter((t) => {
      if (t.status === 'done') return false;
      const isUrgent = t.priority === 'urgent' || 
        (t.dueAtMs && t.dueAtMs < Date.now() + 24 * 60 * 60 * 1000);
      return isUrgent;
    }),
    active: tasks.filter((t) => {
      if (t.status === 'done') return false;
      const isUrgent = t.priority === 'urgent' || 
        (t.dueAtMs && t.dueAtMs < Date.now() + 24 * 60 * 60 * 1000);
      return !isUrgent;
    }),
    done: tasks.filter((t) => t.status === 'done'),
  };

  return {
    tasks,
    groupedTasks,
    isLoading,
    error,
    createTask,
    updateTask,
    toggleTask,
    deleteTask,
    refresh: loadTasks,
  };
}
