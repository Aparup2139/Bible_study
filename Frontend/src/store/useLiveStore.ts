import { create } from 'zustand';
import type { LiveStreamStatus, ChatMessage } from '../types';

interface LiveState {
  // Stream status
  status: LiveStreamStatus;
  setStatus: (status: LiveStreamStatus) => void;

  // Viewer count (updated via WebSocket)
  viewerCount: number;
  setViewerCount: (count: number) => void;

  // Countdown
  countdown: number;
  setCountdown: (n: number) => void;

  // Chat visibility overlay
  isChatVisible: boolean;
  toggleChat: () => void;

  // Chat messages for current live stream
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
}

export const useLiveStore = create<LiveState>((set) => ({
  status: 'idle',
  setStatus: (status) => set({ status }),

  viewerCount: 0,
  setViewerCount: (viewerCount) => set({ viewerCount }),

  countdown: 5,
  setCountdown: (countdown) => set({ countdown }),

  isChatVisible: false,
  toggleChat: () => set((state) => ({ isChatVisible: !state.isChatVisible })),

  messages: [
    {
      id: '1',
      userId: 'grace',
      username: 'Grace_M',
      text: 'Hello! Excited for this! 🙏',
      sentAt: new Date().toISOString(),
      roomId: 'main',
    },
    {
      id: '2',
      userId: 'david',
      username: 'David_K',
      text: 'Amen! God bless you!',
      sentAt: new Date().toISOString(),
      roomId: 'main',
    },
    {
      id: '3',
      userId: 'sarah',
      username: 'Sarah_P',
      text: 'Thank you for going live!',
      sentAt: new Date().toISOString(),
      roomId: 'main',
    },
  ],
  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),
  clearMessages: () => set({ messages: [] }),
}));
