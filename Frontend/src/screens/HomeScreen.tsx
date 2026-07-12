import React, { useCallback } from 'react';
import { Dimensions, FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { VideoHero } from '../components/elegant/VideoHero';
import { ActionGrid } from '../components/elegant/ActionGrid';
import { VideoCard } from '../components/elegant/VideoCard';
import { LiveBadge, SearchBar, SerifTitle } from '../components/elegant/Kit';
import { useTheme } from '../theme/ThemeContext';
import { useAppStore } from '../store/useAppStore';
import { useLiveStreams } from '../hooks/useLiveStreams';
import type { LiveStream } from '../types';

const { width } = Dimensions.get('window');
const CARD_GAP = 14;
const H_PAD = 22;
const CARD_WIDTH = (width - H_PAD * 2 - CARD_GAP) / 2;

export function HomeScreen() {
  const { c } = useTheme();
  const { profile, searchQuery, setSearchQuery, setActiveScreen, setWatchStreamId } = useAppStore();

  // Real "Streaming Now" feed from the backend (GET /streams).
  const { data: streams = [] } = useLiveStreams();

  const filteredStreams = searchQuery.trim()
    ? streams.filter((s) => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : streams;

  const handleActionPress = useCallback(
    (key: string) => {
      switch (key) {
        case 'live': setActiveScreen('livestream'); break;
        case 'studychat': setActiveScreen('studychat'); break;
        case 'ask': setActiveScreen('askbible'); break;
        case 'podcasts': setActiveScreen('podcasts'); break;
        case 'denomination': setActiveScreen('denomination'); break;
        case 'post': setActiveScreen('post'); break;
      }
    },
    [setActiveScreen],
  );

  const handleVideoPress = useCallback(
    (stream: LiveStream) => {
      setWatchStreamId(stream.id);
      setActiveScreen('liveviewer');
    },
    [setWatchStreamId, setActiveScreen],
  );

  const renderStream = useCallback(
    ({ item }: { item: LiveStream }) => (
      <View style={{ width: CARD_WIDTH }}>
        <VideoCard stream={item} onPress={handleVideoPress} />
      </View>
    ),
    [handleVideoPress],
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      stickyHeaderIndices={[0]}
    >
      {/* Sticky hero */}
      <VideoHero
        viewerCount={1248}
        initial={(profile.displayName?.trim()?.[0] ?? '?').toUpperCase()}
        onAvatarPress={() => setActiveScreen('editprofile')}
      />

      <View style={styles.body}>
        <ActionGrid onPress={handleActionPress} />

        <View style={{ paddingHorizontal: H_PAD }}>
          <SearchBar value={searchQuery} onChangeText={setSearchQuery} />
        </View>

        <View style={{ paddingHorizontal: H_PAD, gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            <SerifTitle size={23}>Streaming Now</SerifTitle>
            <LiveBadge small />
          </View>

          <FlatList
            data={filteredStreams}
            keyExtractor={(item) => item.id}
            renderItem={renderStream}
            numColumns={2}
            columnWrapperStyle={{ gap: CARD_GAP }}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={{ height: CARD_GAP }} />}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 96 },
  body: { gap: 22, paddingTop: 22 },
});
