import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  FlatList,
  Dimensions,
  Alert,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { VideoPlayer } from '../components/VideoPlayer';
import { ActionButtons } from '../components/ActionButtons';
import { VideoCard, SearchBar, LiveBadge } from '../components/ui';
import { useAppStore } from '../store/useAppStore';
import { queryKeys } from '../services/queryClient';
import { MOCK_LIVE_STREAMS } from '../services/mockData';
import { Colors, Typography, Spacing } from '../theme';
import type { LiveStream } from '../types';

const { width } = Dimensions.get('window');
const CARD_GAP = Spacing.base;
const CARD_WIDTH = (width - Spacing.lg * 2 - CARD_GAP) / 2;

export function HomeScreen() {
  const { profile, searchQuery, setSearchQuery, setActiveScreen } = useAppStore();

  // In a real app this would hit an API; for now resolved from mock data
  const { data: streams = [] } = useQuery<LiveStream[]>({
    queryKey: queryKeys.liveStreams(),
    queryFn: async () => MOCK_LIVE_STREAMS,
    staleTime: 30_000,
  });

  const filteredStreams = searchQuery.trim()
    ? streams.filter((s) =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : streams;

  const handleActionPress = useCallback((key: string) => {
    switch (key) {
      case 'live':
        setActiveScreen('livestream');
        break;
      case 'studychat':
        setActiveScreen('studychat');
        break;
      case 'ask':
        setActiveScreen('askbible');
        break;
      case 'podcasts':
        setActiveScreen('podcasts');
        break;
      case 'denomination':
        setActiveScreen('denomination');
        break;
      case 'post':
        Alert.alert('Post', 'Create and share a video post.');
        break;
    }
  }, [setActiveScreen]);

  const handleVideoPress = useCallback((stream: LiveStream) => {
    Alert.alert(stream.title, `${stream.viewerCount.toLocaleString()} watching`);
  }, []);

  const renderStream = useCallback(
    ({ item }: { item: LiveStream }) => (
      <View style={{ width: CARD_WIDTH }}>
        <VideoCard stream={item} onPress={handleVideoPress} />
      </View>
    ),
    [handleVideoPress]
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      stickyHeaderIndices={[0]}
    >
      {/* Sticky video player */}
      <VideoPlayer
        viewerCount={1248}
        initial={(profile.displayName?.trim()?.[0] ?? '?').toUpperCase()}
        onAvatarPress={() => setActiveScreen('editprofile')}
      />

      {/* Scrollable body */}
      <View style={styles.body}>
        {/* Action buttons */}
        <ActionButtons onPress={handleActionPress} />

        {/* Search */}
        <View style={styles.searchRow}>
          <SearchBar value={searchQuery} onChangeText={setSearchQuery} />
        </View>

        {/* Live streams section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <LiveBadge size="sm" />
            <Text style={styles.sectionTitle}>Streaming Now</Text>
          </View>

          <FlatList
            data={filteredStreams}
            keyExtractor={(item) => item.id}
            renderItem={renderStream}
            numColumns={2}
            columnWrapperStyle={styles.columnWrapper}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={{ height: CARD_GAP }} />}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingBottom: 80,
  },
  body: {
    gap: Spacing.md,
    paddingTop: Spacing.md,
  },
  searchRow: {
    paddingHorizontal: Spacing.lg,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.base,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  columnWrapper: {
    gap: CARD_GAP,
  },
});
