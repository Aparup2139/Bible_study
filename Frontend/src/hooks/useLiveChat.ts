/**
 * Live-stream chat over a Supabase Realtime Broadcast channel (`chat:{streamId}`).
 * Ephemeral by design — you see messages sent after you join, like any live chat.
 * No DB table, no backend: the message IS the broadcast payload.
 * ponytail: free tier ≈ 200 concurrent connections / 2M msgs/month — swap to
 * Realtime with auth + persistence if a stream ever nears 150+ live viewers.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../services/supabase';

export interface ChatMessage {
  id: string;
  name: string;
  text: string;
  at: number;
}

const MAX_MESSAGES = 50;
const MAX_TEXT_LEN = 280;

/** Append with a ring-buffer cap (exported for the harness check in Task 4). */
export function appendMessage(list: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  const next = [...list, msg];
  return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next;
}

export function useLiveChat(streamId: string, senderName: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !streamId) return;
    // `self: true` → the sender receives their own message through the same
    // path as everyone else (one ordering, no local echo bookkeeping).
    const channel = supabase.channel(`chat:${streamId}`, {
      config: { broadcast: { self: true } },
    });
    channel
      .on('broadcast', { event: 'msg' }, ({ payload }) => {
        const m = payload as ChatMessage;
        if (typeof m?.text !== 'string' || typeof m?.name !== 'string' || typeof m?.id !== 'string') return;
        setMessages((prev) => appendMessage(prev, m));
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [streamId]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim().slice(0, MAX_TEXT_LEN);
      if (!trimmed || !channelRef.current) return;
      void channelRef.current.send({
        type: 'broadcast',
        event: 'msg',
        payload: {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: senderName || 'Guest',
          text: trimmed,
          at: Date.now(),
        } satisfies ChatMessage,
      });
    },
    [senderName],
  );

  return { messages, send };
}
