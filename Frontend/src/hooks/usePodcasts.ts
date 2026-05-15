import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../services/queryClient';
import {
  MOCK_PODCAST_EPISODES,
  MOCK_PODCAST_CHANNELS,
  MOCK_PODCAST_CATEGORIES,
} from '../services/mockData';

export function usePodcastEpisodes() {
  return useQuery({
    queryKey: queryKeys.podcasts.episodes(),
    queryFn: async () => MOCK_PODCAST_EPISODES,
  });
}

export function usePodcastChannels() {
  return useQuery({
    queryKey: queryKeys.podcasts.channels(),
    queryFn: async () => MOCK_PODCAST_CHANNELS,
  });
}

export function usePodcastCategories() {
  return useQuery({
    queryKey: queryKeys.podcasts.categories(),
    queryFn: async () => MOCK_PODCAST_CATEGORIES,
  });
}
