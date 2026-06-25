/**
 * Singleton audio controller for podcast playback (expo-av).
 *
 * Owns a single `Audio.Sound` instance so only one episode plays at a time, and
 * mirrors playback state into `usePodcastStore` so any component (episode cards,
 * the mini player bar) can read/drive it. Resume position is persisted to the
 * backend on a ~10s cadence and on pause/stop.
 */
import { Audio, type AVPlaybackStatus } from 'expo-av';
import { usePodcastStore } from '../store/usePodcastStore';
import { api } from './api';
import type { PodcastEpisode } from '../types';

let sound: Audio.Sound | null = null;
let currentEpisodeId: string | null = null;
let configured = false;
let lastSavedAt = 0;

async function configure(): Promise<void> {
  if (configured) return;
  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
  });
  configured = true;
}

function persistProgress(positionSeconds: number): void {
  if (!currentEpisodeId) return;
  api
    .put(`/podcasts/episodes/${currentEpisodeId}/progress`, { positionSeconds })
    .catch(() => {/* best-effort; backend buffers writes */});
}

function onStatus(status: AVPlaybackStatus): void {
  if (!status.isLoaded) return;
  const store = usePodcastStore.getState();
  store.setIsPlaying(status.isPlaying);
  const positionSeconds = Math.floor((status.positionMillis ?? 0) / 1000);
  store.setPlaybackPosition(positionSeconds);

  const now = Date.now();
  if (status.isPlaying && now - lastSavedAt > 10_000) {
    lastSavedAt = now;
    persistProgress(positionSeconds);
  }
  if (status.didJustFinish) {
    store.setIsPlaying(false);
    persistProgress(positionSeconds);
  }
}

/** Play an episode. Tapping the one already loaded toggles play/pause. */
export async function playEpisode(episode: PodcastEpisode): Promise<void> {
  if (!episode.audioUrl) return;
  await configure();
  const store = usePodcastStore.getState();

  if (sound && currentEpisodeId === episode.id) {
    await togglePlayPause();
    return;
  }

  if (sound) {
    await sound.unloadAsync().catch(() => {});
    sound = null;
  }
  currentEpisodeId = episode.id;
  store.setCurrentlyPlaying(episode);

  const { sound: created } = await Audio.Sound.createAsync(
    { uri: episode.audioUrl },
    { shouldPlay: true, positionMillis: (episode.playbackPosition ?? 0) * 1000 },
    onStatus,
  );
  sound = created;
}

export async function togglePlayPause(): Promise<void> {
  if (!sound) return;
  const status = await sound.getStatusAsync();
  if (!status.isLoaded) return;
  if (status.isPlaying) {
    await sound.pauseAsync();
    persistProgress(Math.floor((status.positionMillis ?? 0) / 1000));
  } else {
    await sound.playAsync();
  }
}

export async function stopPlayback(): Promise<void> {
  if (sound) {
    const status = await sound.getStatusAsync();
    if (status.isLoaded) persistProgress(Math.floor((status.positionMillis ?? 0) / 1000));
    await sound.unloadAsync().catch(() => {});
    sound = null;
  }
  currentEpisodeId = null;
  const store = usePodcastStore.getState();
  store.setCurrentlyPlaying(null);
  store.setIsPlaying(false);
  store.setPlaybackPosition(0);
}
