/**
 * Denomination reference data (Phase 2) — backed by GET /denominations.
 * Long stale time: this data changes monthly at most (matches the API's cache policy).
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { queryKeys } from '../services/queryClient';
import type { Denomination } from '../types';

export function useDenominations() {
  return useQuery({
    queryKey: queryKeys.denominations(),
    queryFn: () => api.get<Denomination[]>('/denominations'),
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}
