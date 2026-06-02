// Audio room ("Study Chat") domain types (Phase 6 — backed by LiveKit).

export type ParticipantRole = 'host' | 'speaker' | 'listener';

export interface AudioRoom {
  id: string;
  title: string;
  subtitle: string;
  speakerCount: number;
  listenerCount: number;
  isLive: boolean;
}

export interface RoomParticipant {
  id: string;
  displayName: string;
  avatarEmoji: string;
  role: ParticipantRole;
  isMuted: boolean;
  isSpeaking: boolean;
}

export interface CreateRoomInput {
  title: string;
  subtitle: string;
}

/** Response when joining a room — the LiveKit access token + connection URL. */
export interface RoomJoinToken {
  roomId: string;
  token: string;
  url: string;
  role: ParticipantRole;
}
