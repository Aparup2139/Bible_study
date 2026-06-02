// Live video streaming domain types (Phase 4 — backed by Mux).

export type StreamQuality = '720p' | '1080p' | '480p';

export type LiveStreamStatus = 'idle' | 'countdown' | 'live' | 'ended';

export interface LiveStream {
  id: string;
  title: string;
  hostId: string;
  hostName: string;
  thumbnailEmoji: string;
  viewerCount: number;
  startedAt: string;
  /** HLS playback URL (from Mux). Empty until the stream is live. */
  streamUrl: string;
  isPublic: boolean;
  quality: StreamQuality;
  denomination: string | null;
}

export interface CreateStreamInput {
  title: string;
  isPublic: boolean;
  quality: StreamQuality;
  denomination?: string | null;
}
