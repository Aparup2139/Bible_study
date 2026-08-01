/**
 * Study Chat — real Agora audio room, brokered by our backend.
 *
 * There is one live room at a time; POST /rooms/join auto-hosts if none
 * exists. Role changes (raise-hand → promote, force-mute) are discovered by
 * polling — the same low-effort pattern useLiveStreams.ts uses for viewer
 * counts. No WebSocket/Redis needed at this scale.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { AudioRoom, RoomParticipant } from '../types';

export interface JoinRoomResult {
  roomId: string;
  /** Agora channel name (== roomId). */
  channel: string;
  /** Wildcard uid — Agora assigns the session's actual uid on join. */
  uid: number;
  token: string;
  appId: string;
  role: 'host' | 'speaker' | 'listener';
}

interface ParticipantDto {
  userId: string;
  displayName: string;
  avatarEmoji: string;
  role: 'host' | 'speaker' | 'listener';
  handRaised: boolean;
  forceMuted: boolean;
}

function toParticipant(p: ParticipantDto): RoomParticipant {
  return {
    id: p.userId,
    displayName: p.displayName,
    avatarEmoji: p.avatarEmoji,
    role: p.role,
    isMuted: p.forceMuted,
    isSpeaking: false, // remote active-speaker highlighting isn't wired yet (needs uid→user mapping)
    handRaised: p.handRaised,
  };
}

/** Enter the singleton Study Chat room. */
export function useJoinRoom() {
  return useMutation({
    mutationFn: (input: { displayName: string; avatarEmoji: string }) =>
      api.post<JoinRoomResult>('/rooms/join', input),
  });
}

/** Re-mint a token for the caller's current role — used after a promotion and on token-expiry renewal. */
export function useRtcRoomToken() {
  return useMutation({
    mutationFn: (roomId: string) => api.post<JoinRoomResult>(`/rooms/${roomId}/token`),
  });
}

/** Poll room status/counts (5s) — detects when the host ends the room. */
export function useRoomDetail(roomId: string | null, enabled: boolean) {
  return useQuery<AudioRoom>({
    queryKey: ['room', roomId],
    queryFn: () => api.get<AudioRoom>(`/rooms/${roomId}`),
    enabled: enabled && Boolean(roomId),
    refetchInterval: 5_000,
  });
}

/** Poll the participant roster (4s) — roles, hand-raises, force-mutes. */
export function useRoomParticipants(roomId: string | null, enabled: boolean) {
  return useQuery<RoomParticipant[]>({
    queryKey: ['room-participants', roomId],
    queryFn: async () => {
      const rows = await api.get<ParticipantDto[]>(`/rooms/${roomId}/participants`);
      return rows.map(toParticipant);
    },
    enabled: enabled && Boolean(roomId),
    refetchInterval: 4_000,
  });
}

export function useRaiseHand() {
  return useMutation({
    mutationFn: (roomId: string) => api.post(`/rooms/${roomId}/raise-hand`),
  });
}

export function usePromoteParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { roomId: string; userId: string }) =>
      api.post(`/rooms/${vars.roomId}/promote/${vars.userId}`),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['room-participants', vars.roomId] }),
  });
}

export function useSetForceMuted() {
  return useMutation({
    mutationFn: (vars: { roomId: string; userId: string; muted: boolean }) =>
      api.post(`/rooms/${vars.roomId}/mute/${vars.userId}`, { muted: vars.muted }),
  });
}

export function useLeaveRoom() {
  return useMutation({
    mutationFn: (roomId: string) => api.post(`/rooms/${roomId}/leave`),
  });
}

export function useEndRoom() {
  return useMutation({
    mutationFn: (roomId: string) => api.post(`/rooms/${roomId}/end`),
  });
}
