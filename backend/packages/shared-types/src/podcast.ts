// Podcast domain types (Phase 3).

export interface PodcastEpisode {
  id: string;
  title: string;
  channelName: string;
  thumbnailEmoji: string;
  durationMinutes: number;
  publishedAt: string;
  /** Signed/CDN audio URL. */
  audioUrl: string;
  isDownloaded: boolean;
  isSaved: boolean;
  playbackPosition: number;
}

export interface PodcastChannel {
  id: string;
  name: string;
  avatarEmoji: string;
  episodeCount: number;
  subscriberCount: number;
  isSubscribed: boolean;
}

export interface PodcastCategory {
  id: string;
  name: string;
  icon: string;
  showCount: number;
}

export type PodcastTab =
  | 'library'
  | 'episodes'
  | 'downloads'
  | 'saved'
  | 'categories'
  | 'channels';

export interface UpdatePlaybackProgressInput {
  episodeId: string;
  playbackPosition: number;
}
