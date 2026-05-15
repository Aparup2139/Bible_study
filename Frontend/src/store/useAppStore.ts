import { create } from 'zustand';
import type { UserProfile } from '../types';

interface AppState {
  // Profile
  profile: UserProfile;
  setProfile: (profile: Partial<UserProfile>) => void;

  // Active screen overlays
  activeScreen: 'home' | 'livestream' | 'studychat' | 'podcasts' | 'denomination' | 'editprofile';
  setActiveScreen: (screen: AppState['activeScreen']) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

const DEFAULT_PROFILE: UserProfile = {
  id: 'local-user',
  displayName: 'BibleWay',
  handle: '@bibleway',
  bio: 'Sharing faith, hope, and inspiration through video content. Join me on this journey! 🙏✨',
  avatarUri: null,
  subscriberCount: 1200,
  denominationId: null,
  isVerified: false,
  createdAt: new Date().toISOString(),
};

export const useAppStore = create<AppState>((set) => ({
  profile: DEFAULT_PROFILE,
  setProfile: (partial) =>
    set((state) => ({ profile: { ...state.profile, ...partial } })),

  activeScreen: 'home',
  setActiveScreen: (screen) => set({ activeScreen: screen }),

  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
