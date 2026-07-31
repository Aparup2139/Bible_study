// Study Chat (audio room) — backed by Agora RTC, reusing the same App ID as
// video live streaming (see streams/agora.service.ts). One room is live at a
// time; joining auto-hosts if none exists (no discovery/list UI for this).

export type ParticipantRole = 'host' | 'speaker' | 'listener';

export interface StudyRoomSummary {
  id: string;
  title: string;
  subtitle: string;
  status: 'live' | 'ended';
  speakerCount: number;
  listenerCount: number;
}

export interface StudyRoomParticipant {
  userId: string;
  displayName: string;
  avatarEmoji: string;
  role: ParticipantRole;
  handRaised: boolean;
  forceMuted: boolean;
}

/** Returned by POST /rooms/join and POST /rooms/:id/token — what the client needs to join the Agora channel. */
export interface JoinRoomResult {
  roomId: string;
  /** Agora channel name (== roomId). */
  channel: string;
  /** Wildcard uid — Agora assigns the session's actual uid on join. */
  uid: number;
  token: string;
  appId: string;
  role: ParticipantRole;
}
