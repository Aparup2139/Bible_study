// Cloudflare Stream — live + on-demand video (Phase 4).
// Self-contained types for the video-streaming feature. Intentionally separate
// from the existing `LiveStream` type (live-stream.ts) so this feature is additive
// and does not change any other part of the app.

export interface CreateStreamInput {
  title: string;
  subtitle?: string;
  denominationId?: string | null;
  /** Public streams play without a signed token; private streams require one. */
  isPublic?: boolean;
}

export type StreamStatus = 'idle' | 'live' | 'ended';

/** Returned only to the host when going live — contains ingest credentials. */
export interface GoLiveResult {
  streamId: string;
  liveInputId: string;
  /** RTMPS ingest URL (e.g. rtmps://live.cloudflare.com:443/live/) — give to the broadcaster only. */
  rtmpsUrl: string;
  rtmpsKey: string;
  srtUrl?: string;
}

/** A live or ended stream as shown in the feed / detail. */
export interface StreamSummary {
  id: string;
  title: string;
  subtitle: string;
  hostId: string;
  status: StreamStatus;
  isPublic: boolean;
  denomination: string | null;
  startedAt: string | null;
  viewerCount: number;
  /** HLS .m3u8 manifest (signed token embedded when the stream is private). Null when idle. */
  playbackUrl: string | null;
}

/** A recorded VOD produced automatically from a finished live broadcast. */
export interface StreamRecording {
  uid: string;
  status: 'ready' | 'inprogress' | 'error';
  playbackUrl: string | null;
  createdAt: string | null;
  durationSeconds: number | null;
}

/** One-time direct-creator upload target (client uploads a VOD without the API token). */
export interface DirectUploadResult {
  uploadUrl: string;
  uid: string;
}
