/**
 * Profile data hooks (Phase 1) — backed by the real API (replaces mock profile).
 */
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { useAuthSession } from '../services/session';
import { useAppStore } from '../store/useAppStore';
import type { UserProfile } from '../types';

/** Fields the user may change on their own profile (mirrors the API contract). */
export interface UpdateProfileInput {
  displayName?: string;
  handle?: string;
  bio?: string;
  avatarPath?: string | null;
  denominationId?: string | null;
}

export interface HandleAvailability {
  handle: string;
  available: boolean;
}

const MY_PROFILE_KEY = ['profile', 'me'] as const;

/** The signed-in user's profile. Disabled until authenticated. */
export function useMyProfile() {
  const { isAuthenticated } = useAuthSession();
  return useQuery({
    queryKey: MY_PROFILE_KEY,
    queryFn: () => api.get<UserProfile>('/profiles/me'),
    enabled: isAuthenticated,
  });
}

/** PATCH /profiles/me. Updates the cache + global store on success. */
export function useUpdateProfile() {
  const qc = useQueryClient();
  const setProfile = useAppStore((s) => s.setProfile);
  return useMutation({
    mutationFn: (input: UpdateProfileInput) =>
      api.patch<UserProfile>('/profiles/me', input),
    onSuccess: (profile) => {
      qc.setQueryData(MY_PROFILE_KEY, profile);
      setProfile(profile);
    },
  });
}

/** Live handle-availability check for the edit screen. */
export function useCheckHandle(handle: string, enabled: boolean) {
  return useQuery({
    queryKey: ['profile', 'check-handle', handle],
    queryFn: () =>
      api.get<HandleAvailability>('/profiles/check-handle', {
        query: { handle },
      }),
    enabled: enabled && handle.length >= 3,
    staleTime: 0,
  });
}

/**
 * Hydrate the global store with the fetched profile once signed in. This is what
 * "replaces DEFAULT_PROFILE" — the store still seeds a placeholder so the app
 * renders before auth, then this swaps in the real profile.
 */
export function useSyncProfileToStore() {
  const { data } = useMyProfile();
  const setProfile = useAppStore((s) => s.setProfile);
  useEffect(() => {
    if (data) setProfile(data);
  }, [data, setProfile]);
}
