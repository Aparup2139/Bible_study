/**
 * Podcast data + mutation hooks (Phase 3) — backed by the real API.
 * Episodes/channels are cursor-paginated; `select` flattens pages to a plain
 * array so existing screens keep consuming `data` as a list (with fetchNextPage
 * available for infinite scroll).
 */
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '../services/api';
import { queryKeys } from '../services/queryClient';
import type {
  PodcastCategory,
  PodcastChannel,
  PodcastEpisode,
} from '../types';

interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export function usePodcastEpisodes(channelId?: string) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.podcasts.episodes(), channelId ?? 'all'],
    queryFn: ({ pageParam }) =>
      api.get<Paginated<PodcastEpisode>>('/podcasts/episodes', {
        query: { cursor: pageParam ?? undefined, channelId },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    select: (data) => data.pages.flatMap((p) => p.items),
  });
}

export function usePodcastChannels() {
  return useInfiniteQuery({
    queryKey: queryKeys.podcasts.channels(),
    queryFn: ({ pageParam }) =>
      api.get<Paginated<PodcastChannel>>('/podcasts/channels', {
        query: { cursor: pageParam ?? undefined },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    select: (data) => data.pages.flatMap((p) => p.items),
  });
}

export function usePodcastCategories() {
  return useQuery({
    queryKey: queryKeys.podcasts.categories(),
    queryFn: () => api.get<PodcastCategory[]>('/podcasts/categories'),
    staleTime: 60 * 60 * 1000,
  });
}

export function useToggleSubscribe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, subscribe }: { channelId: string; subscribe: boolean }) =>
      subscribe
        ? api.post(`/podcasts/channels/${channelId}/subscribe`)
        : api.delete(`/podcasts/channels/${channelId}/subscribe`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.podcasts.channels() }),
  });
}

export function useToggleSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ episodeId, save }: { episodeId: string; save: boolean }) =>
      save
        ? api.post(`/podcasts/episodes/${episodeId}/save`)
        : api.delete(`/podcasts/episodes/${episodeId}/save`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.podcasts.episodes() });
      qc.invalidateQueries({ queryKey: queryKeys.podcasts.saved() });
    },
  });
}

/**
 * Persist playback position. The audio player should call this on a ~10s debounce
 * and on pause/stop (the backend buffers writes in Redis — never write per-second).
 */
export function useUpdateProgress() {
  return useMutation({
    mutationFn: ({ episodeId, positionSeconds }: { episodeId: string; positionSeconds: number }) =>
      api.put(`/podcasts/episodes/${episodeId}/progress`, { positionSeconds }),
  });
}
