import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../services/queryClient';
import { MOCK_LIVE_STREAMS } from '../services/mockData';
import type { LiveStream } from '../types';

export function useLiveStreams() {
  return useQuery<LiveStream[]>({
    queryKey: queryKeys.liveStreams(),
    queryFn: async () => {
      // TODO: replace with real API call e.g. fetch('/api/v1/streams/live')
      return MOCK_LIVE_STREAMS;
    },
    refetchInterval: 30_000, // Poll every 30 s while screen is mounted
  });
}
