// Real-time event contract. These event types are emitted by the backend
// (often triggered by Mux / LiveKit webhooks) and consumed by the frontend
// WebSocket service (Frontend/src/services/websocket.ts).

export type WSEventType =
  | 'chat_message'
  | 'viewer_count_update'
  | 'stream_started'
  | 'stream_ended'
  | 'room_participant_update';

export interface WSEvent<T = unknown> {
  type: WSEventType;
  payload: T;
  roomId: string;
  timestamp: string;
}

/** Generic cursor-paginated response shape used across list endpoints. */
export interface Paginated<T> {
  items: T[];
  /** Opaque cursor for the next page, or null when there are no more results. */
  nextCursor: string | null;
}
