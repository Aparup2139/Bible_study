/**
 * Featured YouTube videos — the four fixed slots under "Streaming Now" (GET /featured-videos).
 * placeholderData renders the 2x2 placeholder grid instantly (and offline) before the fetch lands.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { FeaturedVideo } from '../types';

const EMPTY_SLOTS: FeaturedVideo[] = [1, 2, 3, 4].map((slot) => ({
  slot,
  youtubeVideoId: null,
  title: '',
}));

export function useFeaturedVideos() {
  const query = useQuery({
    queryKey: ['featured-videos'],
    queryFn: () => api.get<FeaturedVideo[]>('/featured-videos'),
    staleTime: 5 * 60 * 1000,
    placeholderData: EMPTY_SLOTS,
  });
  // Errors (e.g. backend cold start) fall back to the placeholder grid instead of an empty section.
  return { ...query, data: query.data ?? EMPTY_SLOTS };
}
