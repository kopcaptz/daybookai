import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  getEtherealSession,
  clearEtherealSession,
  getEtherealApiHeaders,
} from '@/lib/etherealTokenService';
import { etherealDb, mergeMessages, type EtherealMessage } from '@/lib/etherealDb';

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

  const session = getEtherealSession();

  // B.6: loadHistory depends on channelKey
  useEffect(() => {
    if (!session) return;
    loadHistory();
  }, [session?.channelKey]);

  async function loadHistory() {
    const currentSession = getEtherealSession();
    if (!currentSession) return;

    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/ethereal_messages?limit=50`,
        { headers: getEtherealApiHeaders() }
      );

      if (response.status === 401 || response.status === 403) {
        // Session revoked (kick) or expired
        clearEtherealSession();
        window.dispatchEvent(new CustomEvent('ethereal-session-expired'));
        return;
      }

      const data = await response.json();
      if (data.success) {
        const merged = await mergeMessages(currentSession.roomId, data.messages);
        setMessages(merged);
      }
    } catch (error) {
      console.log('Load failed');
    }
  }

  useEffect(() => {
    if (!session?.channelKey) return;

    // One channel for the entire hook lifetime
    const channel = supabase.channel(`ethereal:${session.channelKey}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'message' }, ({ payload }) => {
        // Only if it has serverId (protection against fake)
        if (payload.serverId) {
          setMessages((prev) => {
            // Don't add duplicates
            if (prev.some((m) => m.serverId === payload.serverId)) return prev;
            const newMsg: EtherealMessage = {
              ...payload,
              roomId: session.roomId,
              syncStatus: 'synced',
            };
            etherealDb.messages.put(newMsg);
            return [...prev, newMsg].sort((a, b) => a.createdAtMs - b.createdAtMs);
          });
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
          setIsConnected(true);
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
  }, [session?.channelKey, session?.memberId, session?.displayName, session?.roomId]);

  // Throttled typing indicator (400ms)
  const sendTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 400) return;
    if (!channelRef.current) return;
    if (!session) return;

    lastTypingSentRef.current = now;
    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { memberId: session.memberId, displayName: session.displayName },
    });
  }, [session?.memberId, session?.displayName]);

  // Send message + broadcast
  const sendMessage = useCallback(
    async (content: string) => {
      const currentSession = getEtherealSession();
      if (!currentSession) return { success: false, error: 'no_session' };

      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/ethereal_messages`, {
          method: 'POST',
          headers: getEtherealApiHeaders(),
          body: JSON.stringify({ content }),
        });

        if (response.status === 401 || response.status === 403) {
          clearEtherealSession();
          window.dispatchEvent(new CustomEvent('ethereal-session-expired'));
          return { success: false, error: 'session_expired' };
        }

        const data = await response.json();
        if (!data.success) return data;

        // Broadcast via existing channel
        const payload = {
          serverId: data.id,
          senderId: currentSession.memberId,
          senderName: currentSession.displayName,
          content,
          createdAtMs: data.createdAtMs,
        };

        channelRef.current?.send({ type: 'broadcast', event: 'message', payload });

        // Save locally
        await etherealDb.messages.put({
          ...payload,
          roomId: currentSession.roomId,
          syncStatus: 'synced',
        });

        return { success: true };
      } catch (error) {
        console.log('Send failed');
        return { success: false, error: 'network_error' };
      }
    },
    []
  );

  return {
    messages,
    onlineMembers,
    typingMembers,
    sendTyping,
    sendMessage,
    isConnected,
    refresh: loadHistory,
  };
}
