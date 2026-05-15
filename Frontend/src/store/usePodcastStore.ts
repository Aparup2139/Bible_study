import { create } from 'zustand';
import type { PodcastTab, PodcastEpisode } from '../types';

interface PodcastState {
  activeTab: PodcastTab;
  setActiveTab: (tab: PodcastTab) => void;

  currentlyPlaying: PodcastEpisode | null;
  setCurrentlyPlaying: (episode: PodcastEpisode | null) => void;

  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;

  playbackPosition: number;
  setPlaybackPosition: (position: number) => void;
}

export const usePodcastStore = create<PodcastState>((set) => ({
  activeTab: 'library',
  setActiveTab: (tab) => set({ activeTab: tab }),

  currentlyPlaying: null,
  setCurrentlyPlaying: (episode) => set({ currentlyPlaying: episode }),

  isPlaying: false,
  setIsPlaying: (isPlaying) => set({ isPlaying }),

  playbackPosition: 0,
  setPlaybackPosition: (playbackPosition) => set({ playbackPosition }),
}));
