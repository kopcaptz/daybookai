import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  getEtherealSession,
  clearEtherealSession,
  getEtherealApiHeaders,
} from '@/lib/etherealTokenService';
import {
  etherealDb,
  mergeMessages,
  stableMsgSort,
  type EtherealMessage,
} from '@/lib/etherealDb';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface PresenceMember {
  memberId: string;
  displayName: string;
  onlineAt: string;
}

export function useEtherealRealtime() {
  const [messages, setMessages] = useState<EtherealMessage[]>([]);
  const [onlineMembers, setOnlineMembers] = useState<PresenceMember[]>([]);
  const [typingMembers, setTypingMembers] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const historyInFlightRef = useRef(false);

  const session = getEtherealSession();

  // Load history with guard against parallel calls
  const loadHistory = useCallback(async () => {
    const currentSession = getEtherealSession();
    if (!currentSession) return;

    // Guard: prevent parallel loadHistory calls
    if (historyInFlightRef.current) return;
    historyInFlightRef.current = true;

    try {
      console.log('[RT] history:start');
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/ethereal_messages?limit=50`,
        { headers: getEtherealApiHeaders() }
      );

      if (response.status === 401 || response.status === 403) {
        clearEtherealSession();
        window.dispatchEvent(new CustomEvent('ethereal-session-expired'));
        return;
      }

      const data = await response.json();
      if (data.success && Array.isArray(data.messages)) {
        console.log('[RT] history:end', { count: data.messages.length });
        const merged = await mergeMessages(currentSession.roomId, data.messages);
        setMessages(merged);
      }
    } catch (error) {
      // Silent fail - masked error
    } finally {
      historyInFlightRef.current = false;
    }
  }, []);

  // Initial load when session changes
  useEffect(() => {
    if (!session?.channelKey) return;
    loadHistory();
  }, [session?.channelKey, loadHistory]);

  // Main channel subscription
  useEffect(() => {
    if (!session?.channelKey) return;

    const channel = supabase.channel(`ethereal:${session.channelKey}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'message' }, ({ payload }) => {
        if (!payload?.serverId) return;
        console.log('[RT] broadcast:received', { serverId: payload.serverId, ts: payload.createdAtMs });

        setMessages((prev) => {
          // Don't add duplicates
          if (prev.some((m) => m.serverId === payload.serverId)) return prev;

          const newMsg: EtherealMessage = {
            serverId: payload.serverId,
            roomId: session.roomId,
            senderId: payload.senderId,
            senderName: payload.senderName,
            content: payload.content,
            createdAtMs: payload.createdAtMs,
            syncStatus: 'synced',
            imagePath: payload.imagePath,
            imageUrl: payload.imageUrl,
          };

          // Upsert to Dexie
          etherealDb.messages.put(newMsg);

          return [...prev, newMsg].sort(stableMsgSort);
        });
      })
      .on('broadcast', { event: 'member_kicked' }, ({ payload }) => {
        if (payload?.targetMemberId === session.memberId) {
          clearEtherealSession();
          supabase.removeChannel(channel);
          channelRef.current = null;
          setIsConnected(false);
          window.dispatchEvent(new CustomEvent('ethereal-kicked'));
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const members = Object.values(state)
          .flat()
          .map((p: any) => ({
            memberId: p.memberId,
            displayName: p.displayName,
            onlineAt: p.online_at,
          }));
        setOnlineMembers(members);
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.memberId !== session.memberId) {
          setTypingMembers((prev) =>
            prev.includes(payload.memberId) ? prev : [...prev, payload.memberId]
          );
          setTimeout(() => {
            setTypingMembers((prev) => prev.filter((id) => id !== payload.memberId));
          }, 3000);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[RT] connected + reconcile');
          setIsConnected(true);
          // Reconcile on every reconnect
          await loadHistory();
          await channel.track({
            memberId: session.memberId,
            displayName: session.displayName,
            online_at: new Date().toISOString(),
          });
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setIsConnected(false);
        }
      });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setIsConnected(false);
    };
  }, [session?.channelKey, session?.memberId, session?.displayName, session?.roomId, loadHistory]);

  // Smart periodic reconcile (only when visible, saves battery on Android)
  useEffect(() => {
    if (!session?.channelKey) return;

    const intervalId = setInterval(() => {
      // Only reconcile if tab is visible and channel exists
      if (document.visibilityState === 'visible' && channelRef.current) {
        loadHistory();
      }
    }, 45_000);

    return () => clearInterval(intervalId);
  }, [session?.channelKey, loadHistory]);

  // Throttled typing indicator (400ms)
  const sendTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 400) return;
    if (!channelRef.current) return;

    const currentSession = getEtherealSession();
    if (!currentSession) return;

    lastTypingSentRef.current = now;
    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { memberId: currentSession.memberId, displayName: currentSession.displayName },
    });
  }, []);

  // Send message with instant UI update (supports optional image)
  const sendMessage = useCallback(
    async (content: string, imageBlob?: Blob) => {
      const currentSession = getEtherealSession();
      if (!currentSession) return { success: false, error: 'no_session' };

      // At least one of content or image required
      if (!content.trim() && !imageBlob) {
        return { success: false, error: 'empty_message' };
      }

      try {
        // Prepare FormData for multipart upload
        const formData = new FormData();
        formData.append('content', content.trim() || '');
        if (imageBlob) {
          formData.append('image', imageBlob, 'photo.jpg');
        }

        // Get headers without Content-Type (browser sets boundary automatically)
        const headers = { ...getEtherealApiHeaders() };
        delete (headers as any)['Content-Type'];

        const response = await fetch(`${SUPABASE_URL}/functions/v1/ethereal_messages`, {
          method: 'POST',
          headers,
          body: formData,
        });

        if (response.status === 401 || response.status === 403) {
          clearEtherealSession();
          window.dispatchEvent(new CustomEvent('ethereal-session-expired'));
          return { success: false, error: 'session_expired' };
        }

        const data = await response.json();
        if (!data.success) return data;
        console.log('[RT] POST ok', { id: data.id, ts: data.createdAtMs, hasImage: !!data.imagePath });

        // Build the new message
        const newMsg: EtherealMessage = {
          serverId: data.id,
          roomId: currentSession.roomId,
          senderId: currentSession.memberId,
          senderName: currentSession.displayName,
          content: content.trim() || '',
          createdAtMs: data.createdAtMs,
          syncStatus: 'synced',
          imagePath: data.imagePath || undefined,
          imageUrl: data.imageUrl || undefined,
        };

        // 1) Instant UI update
        setMessages((prev) => {
          if (prev.some((m) => m.serverId === newMsg.serverId)) return prev;
          return [...prev, newMsg].sort(stableMsgSort);
        });

        // 2) Persist to Dexie
        await etherealDb.messages.put(newMsg);

        // 3) Broadcast to others (include imagePath for durability)
        channelRef.current?.send({
          type: 'broadcast',
          event: 'message',
          payload: {
            serverId: newMsg.serverId,
            senderId: newMsg.senderId,
            senderName: newMsg.senderName,
            content: newMsg.content,
            createdAtMs: newMsg.createdAtMs,
            imagePath: newMsg.imagePath,
            imageUrl: newMsg.imageUrl,
          },
        });
        console.log('[RT] broadcast:sent', { serverId: newMsg.serverId });

        return { success: true };
      } catch (error) {
        // Could save as 'failed' for retry logic
        return { success: false, error: 'network_error' };
      }
    },
    []
  );

  // Broadcast kick event to force target member logout
  const broadcastKick = useCallback((targetMemberId: string) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'member_kicked',
      payload: { targetMemberId },
    });
  }, []);

  return {
    messages,
    onlineMembers,
    typingMembers,
    sendTyping,
    sendMessage,
    broadcastKick,
    refresh: loadHistory,
    isConnected,
  };
}
