import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import { usePodcastStore } from '../store/usePodcastStore';
import { playEpisode, togglePlayPause, stopPlayback } from '../services/audioPlayer';
import {
  usePodcastEpisodes,
  usePodcastChannels,
  usePodcastCategories,
  useToggleSubscribe,
  useToggleSave,
  useUploadEpisode,
} from '../hooks/usePodcasts';
import { Colors, Typography, Spacing, BorderRadius } from '../theme';
import type { PodcastEpisode, PodcastChannel, PodcastCategory, PodcastTab } from '../types';

/** MIME types the podcast-audio bucket accepts. */
const ALLOWED_AUDIO_MIME = ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav'];
const EXT_TO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
};

/** Resolve a bucket-allowed MIME type from the picker's mimeType or the file extension. */
function resolveAudioMime(mimeType: string | undefined, name: string): string | null {
  if (mimeType && ALLOWED_AUDIO_MIME.includes(mimeType)) return mimeType;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_MIME[ext] ?? null;
}

async function readAudioDurationSeconds(uri: string): Promise<number> {
  try {
    const { sound, status } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false });
    const ms = status.isLoaded ? status.durationMillis ?? 0 : 0;
    await sound.unloadAsync();
    return Math.round(ms / 1000);
  } catch {
    return 0;
  }
}

const TABS: { key: PodcastTab; label: string }[] = [
  { key: 'library', label: 'Library' },
  { key: 'episodes', label: 'Episodes' },
  { key: 'downloads', label: 'Downloads' },
  { key: 'saved', label: 'Saved' },
  { key: 'categories', label: 'Categories' },
  { key: 'channels', label: 'Channels' },
];

function formatDuration(minutes: number): string {
  return `${minutes} min`;
}

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  return '1 week ago';
}

function EpisodeCard({ episode, showDelete }: { episode: PodcastEpisode; showDelete?: boolean }) {
  const [saved, setSaved] = React.useState(episode.isSaved);
  const toggleSave = useToggleSave();
  const currentlyPlaying = usePodcastStore((s) => s.currentlyPlaying);
  const isPlaying = usePodcastStore((s) => s.isPlaying);
  const isCurrent = currentlyPlaying?.id === episode.id;

  const onSave = () => {
    const next = !saved;
    setSaved(next);
    toggleSave.mutate(
      { episodeId: episode.id, save: next },
      { onError: () => setSaved(!next) },
    );
  };

  const onPlay = () => {
    playEpisode(episode).catch((err) =>
      Alert.alert('Playback error', err instanceof Error ? err.message : 'Could not play audio.'),
    );
  };

  return (
    <TouchableOpacity style={styles.episodeCard} activeOpacity={0.8} onPress={onPlay}>
      <View style={styles.episodeThumbnail}>
        <Text style={{ fontSize: 32 }}>{episode.thumbnailEmoji || '🎙️'}</Text>
      </View>
      <View style={styles.episodeInfo}>
        <Text style={styles.episodeChannel}>{episode.channelName}</Text>
        <Text style={styles.episodeTitle} numberOfLines={1}>{episode.title}</Text>
        <View style={styles.episodeMeta}>
          <Text style={styles.episodeMetaText}>{formatDuration(episode.durationMinutes)}</Text>
          <Text style={styles.episodeMetaText}>•</Text>
          <Text style={styles.episodeMetaText}>{formatRelativeDate(episode.publishedAt)}</Text>
        </View>
        <View style={styles.episodeActions}>
          <TouchableOpacity style={[styles.episodeBtn, styles.episodeBtnPrimary]} onPress={onPlay}>
            <Text style={styles.episodeBtnText}>
              {isCurrent && isPlaying ? '❚❚ Pause' : '▶ Play'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.episodeBtn} onPress={onSave}>
            <Text style={styles.episodeBtnText}>{saved ? '★' : '☆'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function PlayerBar() {
  const episode = usePodcastStore((s) => s.currentlyPlaying);
  const isPlaying = usePodcastStore((s) => s.isPlaying);
  const position = usePodcastStore((s) => s.playbackPosition);
  if (!episode) return null;

  const totalSeconds = Math.max(episode.durationMinutes * 60, 1);
  const progress = Math.min(position / totalSeconds, 1);

  return (
    <View style={styles.playerBar}>
      <View style={styles.playerProgressTrack}>
        <View style={[styles.playerProgressFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.playerRow}>
        <Text style={{ fontSize: 24 }}>{episode.thumbnailEmoji || '🎙️'}</Text>
        <View style={styles.playerInfo}>
          <Text style={styles.playerTitle} numberOfLines={1}>{episode.title}</Text>
          <Text style={styles.playerChannel} numberOfLines={1}>{episode.channelName}</Text>
        </View>
        <TouchableOpacity onPress={() => togglePlayPause()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.playerControl}>{isPlaying ? '❚❚' : '▶'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => stopPlayback()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.playerClose}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ChannelCard({ channel }: { channel: PodcastChannel }) {
  const [subscribed, setSubscribed] = React.useState(channel.isSubscribed);
  const toggleSubscribe = useToggleSubscribe();

  const onToggle = () => {
    const next = !subscribed;
    setSubscribed(next);
    toggleSubscribe.mutate(
      { channelId: channel.id, subscribe: next },
      { onError: () => setSubscribed(!next) },
    );
  };

  return (
    <View style={styles.channelCard}>
      <View style={styles.channelAvatar}>
        <Text style={{ fontSize: 28 }}>{channel.avatarEmoji}</Text>
      </View>
      <View style={styles.channelInfo}>
        <Text style={styles.channelName}>{channel.name}</Text>
        <Text style={styles.channelStats}>
          {channel.episodeCount} episodes · {(channel.subscriberCount / 1000).toFixed(0)}K subscribers
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.subscribeBtn, subscribed && styles.subscribedBtn]}
        onPress={onToggle}
        activeOpacity={0.8}
      >
        <Text style={styles.subscribeBtnText}>{subscribed ? 'Following' : 'Subscribe'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function CategoryCard({ category }: { category: PodcastCategory }) {
  return (
    <TouchableOpacity
      style={styles.categoryCard}
      activeOpacity={0.8}
      onPress={() => Alert.alert(category.name, `${category.showCount} shows`)}
    >
      <Text style={styles.categoryIcon}>{category.icon}</Text>
      <Text style={styles.categoryName}>{category.name}</Text>
      <Text style={styles.categoryCount}>{category.showCount} shows</Text>
    </TouchableOpacity>
  );
}

function EmptyState({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

interface PickedAudio {
  uri: string;
  name: string;
  contentType: string;
  durationSeconds: number;
}

function UploadModal({
  visible,
  channels,
  onClose,
}: {
  visible: boolean;
  channels: PodcastChannel[];
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [channelId, setChannelId] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickedAudio | null>(null);
  const upload = useUploadEpisode();

  const reset = () => {
    setTitle('');
    setChannelId(null);
    setPicked(null);
  };

  const onPickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    const contentType = resolveAudioMime(asset.mimeType, asset.name);
    if (!contentType) {
      Alert.alert('Unsupported file', 'Please choose an mp3, m4a, aac, ogg or wav file.');
      return;
    }
    const durationSeconds = await readAudioDurationSeconds(asset.uri);
    setPicked({ uri: asset.uri, name: asset.name, contentType, durationSeconds });
  };

  const canSubmit = Boolean(title.trim() && channelId && picked) && !upload.isPending;

  const onSubmit = () => {
    if (!channelId || !picked) return;
    upload.mutate(
      {
        channelId,
        title: title.trim(),
        uri: picked.uri,
        contentType: picked.contentType,
        durationSeconds: picked.durationSeconds,
      },
      {
        onSuccess: () => {
          reset();
          onClose();
          Alert.alert('Posted', 'Your episode is now live.');
        },
        onError: (err) =>
          Alert.alert('Upload failed', err instanceof Error ? err.message : 'Please try again.'),
      },
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Post an episode</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ gap: Spacing.base }}>
            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="Episode title"
              placeholderTextColor={Colors.textMuted}
              value={title}
              onChangeText={setTitle}
              maxLength={200}
            />

            <Text style={styles.fieldLabel}>Channel</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
              {channels.map((ch) => (
                <TouchableOpacity
                  key={ch.id}
                  style={[styles.chip, channelId === ch.id && styles.chipActive]}
                  onPress={() => setChannelId(ch.id)}
                >
                  <Text style={[styles.chipText, channelId === ch.id && styles.chipTextActive]}>
                    {ch.avatarEmoji} {ch.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Audio file</Text>
            <TouchableOpacity style={styles.fileBtn} onPress={onPickFile}>
              <Text style={styles.fileBtnText}>
                {picked ? `🎵 ${picked.name}` : '＋ Choose mp3'}
              </Text>
            </TouchableOpacity>
            {picked && picked.durationSeconds > 0 && (
              <Text style={styles.fileMeta}>{Math.round(picked.durationSeconds / 60)} min</Text>
            )}

            <TouchableOpacity
              style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
              onPress={onSubmit}
              disabled={!canSubmit}
            >
              {upload.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Post episode</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

interface Props {
  onClose: () => void;
}

export function PodcastScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { activeTab, setActiveTab } = usePodcastStore();
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data: episodes = [] } = usePodcastEpisodes();
  const { data: channels = [] } = usePodcastChannels();
  const { data: categories = [] } = usePodcastCategories();

  // Stop and unload audio when leaving the podcasts screen.
  useEffect(() => () => { stopPlayback(); }, []);

  const downloads = episodes.filter((e) => e.isDownloaded);
  const saved = episodes.filter((e) => e.isSaved);

  const renderTabContent = useCallback(() => {
    switch (activeTab) {
      case 'library':
        return (
          <ScrollView contentContainerStyle={styles.tabContent}>
            <Text style={styles.sectionTitle}>Latest Episodes</Text>
            {episodes.slice(0, 3).map((ep) => <EpisodeCard key={ep.id} episode={ep} />)}
            <Text style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>Recent Updates</Text>
            {episodes.slice(3).map((ep) => <EpisodeCard key={ep.id} episode={ep} />)}
          </ScrollView>
        );
      case 'episodes':
        return (
          <ScrollView contentContainerStyle={styles.tabContent}>
            <Text style={styles.sectionTitle}>All Episodes</Text>
            {episodes.map((ep) => <EpisodeCard key={ep.id} episode={ep} />)}
          </ScrollView>
        );
      case 'downloads':
        return (
          <ScrollView contentContainerStyle={styles.tabContent}>
            <Text style={styles.sectionTitle}>Downloaded Episodes</Text>
            {downloads.length === 0
              ? <EmptyState icon="⬇️" title="No Downloads" text="Downloaded episodes appear here for offline listening" />
              : downloads.map((ep) => <EpisodeCard key={ep.id} episode={ep} showDelete />)
            }
          </ScrollView>
        );
      case 'saved':
        return saved.length === 0
          ? <EmptyState icon="⭐" title="No Saved Episodes" text="Save your favourite episodes here for easy access later" />
          : (
            <ScrollView contentContainerStyle={styles.tabContent}>
              {saved.map((ep) => <EpisodeCard key={ep.id} episode={ep} />)}
            </ScrollView>
          );
      case 'categories':
        return (
          <ScrollView contentContainerStyle={styles.tabContent}>
            <Text style={styles.sectionTitle}>Browse by Category</Text>
            <View style={styles.categoryGrid}>
              {categories.map((cat) => <CategoryCard key={cat.id} category={cat} />)}
            </View>
          </ScrollView>
        );
      case 'channels':
        return (
          <ScrollView contentContainerStyle={styles.tabContent}>
            <Text style={styles.sectionTitle}>Popular Channels</Text>
            {channels.map((ch) => <ChannelCard key={ch.id} channel={ch} />)}
          </ScrollView>
        );
    }
  }, [activeTab, episodes, downloads, saved, categories, channels]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Podcasts</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.postBtn}
            onPress={() => setUploadOpen(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.postBtnText}>＋ Post</Text>
          </TouchableOpacity>
          <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.searchIcon}>🔍</Text>
          </TouchableOpacity>
        </View>
      </View>

      <UploadModal
        visible={uploadOpen}
        channels={channels}
        onClose={() => setUploadOpen(false)}
      />

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
      >
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab content */}
      <View style={styles.contentArea}>
        {renderTabContent()}
      </View>

      <PlayerBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.base,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
  },
  backArrow: {
    color: Colors.textPrimary,
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
  },
  headerTitle: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  searchIcon: {
    fontSize: Typography.xl,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
  },
  postBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  postBtnText: {
    color: '#fff',
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  modalClose: {
    fontSize: Typography.lg,
    color: Colors.textMuted,
  },
  fieldLabel: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.textMuted,
  },
  input: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    color: Colors.textPrimary,
    fontSize: Typography.base,
  },
  chip: {
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: Typography.sm,
    color: Colors.textPrimary,
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: Typography.semibold,
  },
  fileBtn: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.base,
    alignItems: 'center',
  },
  fileBtnText: {
    color: Colors.primary,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  fileMeta: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    marginTop: Spacing.base,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: Typography.base,
    fontWeight: Typography.bold,
  },
  playerBar: {
    backgroundColor: Colors.surfaceElevated,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  playerProgressTrack: {
    height: 3,
    backgroundColor: Colors.border,
  },
  playerProgressFill: {
    height: 3,
    backgroundColor: Colors.primary,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  playerInfo: {
    flex: 1,
    minWidth: 0,
  },
  playerTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  playerChannel: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
  },
  playerControl: {
    fontSize: Typography.xl,
    color: Colors.primary,
    fontWeight: Typography.bold,
  },
  playerClose: {
    fontSize: Typography.lg,
    color: Colors.textMuted,
  },
  tabBar: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    maxHeight: 48,
  },
  tabBarContent: {
    paddingHorizontal: Spacing.sm,
  },
  tab: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textMuted,
    whiteSpace: 'nowrap',
  } as any,
  tabTextActive: {
    color: Colors.primary,
  },
  contentArea: {
    flex: 1,
  },
  tabContent: {
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.base,
  },
  episodeCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.base,
    flexDirection: 'row',
    gap: Spacing.base,
  },
  episodeThumbnail: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  episodeInfo: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  episodeChannel: {
    fontSize: Typography.sm,
    color: Colors.primary,
    fontWeight: Typography.semibold,
  },
  episodeTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  episodeMeta: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  episodeMetaText: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
  },
  episodeActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  episodeBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  episodeBtnPrimary: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  episodeBtnText: {
    color: Colors.textPrimary,
    fontSize: Typography.sm,
  },
  channelCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
  },
  channelAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  channelInfo: {
    flex: 1,
    gap: 4,
  },
  channelName: {
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  channelStats: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
  },
  subscribeBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  subscribedBtn: {
    backgroundColor: Colors.border,
  },
  subscribeBtnText: {
    color: '#fff',
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryCard: {
    width: '47%',
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  categoryIcon: {
    fontSize: 36,
  },
  categoryName: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  categoryCount: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: Spacing.lg,
  },
  emptyIcon: {
    fontSize: 64,
    opacity: 0.3,
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    fontSize: Typography.base,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: Typography.base * 1.5,
  },
});
