/**
 * Live streaming — Agora interactive live streaming, brokered by our backend.
 *
 * - useLiveStreams(): the "Streaming Now" feed (GET /streams).
 * - useGoLive(): register a stream; returns the Agora channel + publisher token
 *   the host uses to broadcast from the phone camera (dev build required).
 * - useRtcToken(): mint a channel token (publisher for the host, subscriber for
 *   viewers) — used by the viewer screen and for token renewal.
 * - useStreamDetail(): poll a stream's status/viewer count (4s).
 * - useEndStream(): host ends the broadcast.
 * - joinViewer()/leaveViewer(): best-effort viewer-count beacons.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { queryKeys } from '../services/queryClient';
import type { LiveStream } from '../types';

export interface StreamSummary {
  id: string;
  title: string;
  subtitle: string;
  hostId: string;
  status: 'idle' | 'live' | 'ended';
  isPublic: boolean;
  denomination: string | null;
  startedAt: string | null;
  viewerCount: number;
  /** HLS .m3u8 — present only while live. */
  playbackUrl: string | null;
}

export interface GoLiveResult {
  streamId: string;
  /** Agora channel name (== streamId). */
  channel: string;
  /** Host uid (fixed 1). */
  uid: number;
  token: string;
  appId: string;
  expiresAt: string;
}

export interface RtcTokenResult {
  channel: string;
  uid: number;
  token: string;
  appId: string;
  expiresAt: string;
  role: 'publisher' | 'subscriber';
}

interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

/** Adapt the backend StreamSummary to the LiveStream shape the feed UI expects. */
function toLiveStream(s: StreamSummary): LiveStream {
  return {
    id: s.id,
    title: s.title,
    hostId: s.hostId,
    hostName: s.subtitle || 'Live',
    thumbnailEmoji: '📖',
    viewerCount: s.viewerCount,
    startedAt: s.startedAt ?? '',
    streamUrl: s.playbackUrl ?? '',
    isPublic: s.isPublic,
    quality: '720p',
    denomination: s.denomination,
  };
}

export function useLiveStreams() {
  return useQuery<LiveStream[]>({
    queryKey: queryKeys.liveStreams(),
    queryFn: async () => {
      const page = await api.get<Paginated<StreamSummary>>('/streams');
      return page.items.map(toLiveStream);
    },
    refetchInterval: 15_000,
  });
}

export function useGoLive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; subtitle?: string; isPublic?: boolean }) =>
      api.post<GoLiveResult>('/streams', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.liveStreams() }),
  });
}

/** Poll a stream's live status + playback URL (every 4s while `enabled`). */
export function useStreamDetail(streamId: string | null, enabled: boolean) {
  return useQuery<StreamSummary>({
    queryKey: ['stream', streamId],
    queryFn: () => api.get<StreamSummary>(`/streams/${streamId}`),
    enabled: enabled && Boolean(streamId),
    refetchInterval: 4_000,
  });
}

export function useEndStream() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (streamId: string) => api.post(`/streams/${streamId}/end`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.liveStreams() }),
  });
}

/** Channel token for a stream — publisher for the host, subscriber for viewers. */
export function useRtcToken() {
  return useMutation({
    mutationFn: (streamId: string) => api.post<RtcTokenResult>(`/streams/${streamId}/token`),
  });
}

/** Best-effort viewer-count beacons — losing one only skews the "watching" badge. */
export function joinViewer(streamId: string): void {
  api.post(`/streams/${streamId}/viewers/join`).catch(() => {});
}

export function leaveViewer(streamId: string): void {
  api.post(`/streams/${streamId}/viewers/leave`).catch(() => {});
}
