// ─── User & Profile ──────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  displayName: string;
  handle: string;
  bio: string;
  avatarUri: string | null;
  subscriberCount: number;
  denominationId: string | null;
  isVerified: boolean;
  createdAt: string;
}

// ─── AI Bible Agent ───────────────────────────────────────────────────────────

export interface AskResponse {
  answer: string;
  references: string[];
}

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  references?: string[];
  isError?: boolean;
}

// ─── Live Stream ──────────────────────────────────────────────────────────────

export interface LiveStream {
  id: string;
  title: string;
  hostId: string;
  hostName: string;
  thumbnailEmoji: string;
  viewerCount: number;
  startedAt: string;
  streamUrl: string;
  isPublic: boolean;
  quality: '720p' | '1080p' | '480p';
  denomination: string | null;
}

export type LiveStreamStatus = 'idle' | 'countdown' | 'live' | 'ended';

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  sentAt: string;
  roomId: string;
}

// ─── Study Chat (Audio Room) ──────────────────────────────────────────────────

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
  role: 'host' | 'speaker' | 'listener';
  isMuted: boolean;
  isSpeaking: boolean;
}

// ─── Podcast ──────────────────────────────────────────────────────────────────

export interface PodcastEpisode {
  id: string;
  title: string;
  channelName: string;
  thumbnailEmoji: string;
  durationMinutes: number;
  publishedAt: string;
  audioUrl: string;
  isDownloaded: boolean;
  isSaved: boolean;
  playbackPosition: number;
}

export interface PodcastChannel {
  id: string;
  name: string;
  avatarEmoji: string;
  episodeCount: number;
  subscriberCount: number;
  isSubscribed: boolean;
}

export interface PodcastCategory {
  id: string;
  name: string;
  icon: string;
  showCount: number;
}

export type PodcastTab = 'library' | 'episodes' | 'downloads' | 'saved' | 'categories' | 'channels';

// ─── Denomination ─────────────────────────────────────────────────────────────

export interface Denomination {
  id: string;
  name: string;
  group: DenominationGroup;
  description: string;
  globalFollowers: string;
  bibleVersion: string;
  foundedYear: number;
  worldwideMembers: string;
}

export type DenominationGroup =
  | 'CATHOLIC'
  | 'ORTHODOX'
  | 'PROTESTANT_MAINLINE'
  | 'PROTESTANT_EVANGELICAL'
  | 'PENTECOSTAL'
  | 'CHARISMATIC'
  | 'BAPTIST'
  | 'ADVENTIST'
  | 'OTHER';

// ─── Navigation ───────────────────────────────────────────────────────────────

export type RootStackParamList = {
  index: undefined;
  'live-stream': undefined;
  'study-chat': undefined;
  podcasts: undefined;
  denomination: undefined;
  'edit-profile': undefined;
};

// ─── WebSocket ────────────────────────────────────────────────────────────────

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
