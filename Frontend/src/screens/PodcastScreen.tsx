import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { usePodcastStore } from '../store/usePodcastStore';
import { queryKeys } from '../services/queryClient';
import {
  MOCK_PODCAST_EPISODES,
  MOCK_PODCAST_CHANNELS,
  MOCK_PODCAST_CATEGORIES,
} from '../services/mockData';
import { Colors, Typography, Spacing, BorderRadius } from '../theme';
import type { PodcastEpisode, PodcastChannel, PodcastCategory, PodcastTab } from '../types';

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
  return (
    <TouchableOpacity
      style={styles.episodeCard}
      activeOpacity={0.8}
      onPress={() => Alert.alert(episode.title, `Playing: ${episode.channelName}`)}
    >
      <View style={styles.episodeThumbnail}>
        <Text style={{ fontSize: 32 }}>{episode.thumbnailEmoji}</Text>
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
          <TouchableOpacity style={[styles.episodeBtn, styles.episodeBtnPrimary]}>
            <Text style={styles.episodeBtnText}>▶ Play</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.episodeBtn}>
            <Text style={styles.episodeBtnText}>{showDelete ? '🗑️' : '⬇️'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function ChannelCard({ channel }: { channel: PodcastChannel }) {
  const [subscribed, setSubscribed] = React.useState(channel.isSubscribed);
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
        onPress={() => setSubscribed((s) => !s)}
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

interface Props {
  onClose: () => void;
}

export function PodcastScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { activeTab, setActiveTab } = usePodcastStore();

  const { data: episodes = [] } = useQuery({
    queryKey: queryKeys.podcasts.episodes(),
    queryFn: async () => MOCK_PODCAST_EPISODES,
  });
  const { data: channels = [] } = useQuery({
    queryKey: queryKeys.podcasts.channels(),
    queryFn: async () => MOCK_PODCAST_CHANNELS,
  });
  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.podcasts.categories(),
    queryFn: async () => MOCK_PODCAST_CATEGORIES,
  });

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
        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.searchIcon}>🔍</Text>
        </TouchableOpacity>
      </View>

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
