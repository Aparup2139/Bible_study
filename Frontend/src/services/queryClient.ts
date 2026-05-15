import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 5-minute stale time matches typical feed freshness requirements
      staleTime: 5 * 60 * 1000,
      // Cache for 10 minutes after component unmounts
      gcTime: 10 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

// ─── Query Keys ──────────────────────────────────────────────────────────────
// Centralised key factory prevents key collisions across features.

export const queryKeys = {
  liveStreams: () => ['live-streams'] as const,
  liveStream: (id: string) => ['live-streams', id] as const,

  podcasts: {
    episodes: () => ['podcasts', 'episodes'] as const,
    channels: () => ['podcasts', 'channels'] as const,
    categories: () => ['podcasts', 'categories'] as const,
    downloads: () => ['podcasts', 'downloads'] as const,
    saved: () => ['podcasts', 'saved'] as const,
  },

  denominations: () => ['denominations'] as const,
  denomination: (id: string) => ['denominations', id] as const,

  profile: (userId: string) => ['profile', userId] as const,
} as const;
