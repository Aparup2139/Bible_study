import { useEffect } from 'react';
import { wsService } from '../services/websocket';
import { useLiveStore } from '../store/useLiveStore';
import type { ChatMessage } from '../types';

/**
 * Connects to the WebSocket server when a live stream is active and
 * syncs viewer count and chat messages into the live store.
 *
 * Pass `roomId` when the user enters a live stream room.
 * Pass `null` to disconnect.
 */
export function useWebSocket(roomId: string | null) {
  const { setViewerCount, addMessage } = useLiveStore();

  useEffect(() => {
    if (!roomId) return;

    // In production replace with the real WS endpoint.
    const WS_URL = `wss://api.bibleway.app/ws/rooms/${roomId}`;
    wsService.connect(WS_URL);

    const unsubViewers = wsService.on<{ count: number }>('viewer_count_update', (event) => {
      setViewerCount(event.payload.count);
    });

    const unsubChat = wsService.on<ChatMessage>('chat_message', (event) => {
      addMessage(event.payload);
    });

    return () => {
      unsubViewers();
      unsubChat();
      wsService.disconnect();
    };
  }, [roomId, setViewerCount, addMessage]);
}
