// Live chat domain types (Phase 5).

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  sentAt: string;
  roomId: string;
}

export interface SendChatMessageInput {
  roomId: string;
  text: string;
}
