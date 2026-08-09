import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, ScrollView, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import { usePodcastStore } from '../store/usePodcastStore';
import { playEpisode, togglePlayPause, stopPlayback } from '../services/audioPlayer';
import {
  usePodcastEpisodes, usePodcastChannels, usePodcastCategories,
  useToggleSubscribe, useToggleSave, useUploadEpisode,
} from '../hooks/usePodcasts';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Radii } from '../theme/elegant';
import { Icon, type IconName } from '../components/elegant/Icons';
import { GlassCircle, GoldPill, Medallion, PressScale, SerifTitle } from '../components/elegant/Kit';
import { StickyInputBar } from '../components/elegant/Keyboard';
import { Glass } from '../components/elegant/Glass';
import type { PodcastEpisode, PodcastChannel, PodcastCategory, PodcastTab } from '../types';

/** MIME types the podcast-audio bucket accepts. */
const ALLOWED_AUDIO_MIME = ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav'];
const EXT_TO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', wav: 'audio/wav',
};

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

const EP_ICON: Record<string, IconName> = { '🎙️': 'mic', '📖': 'book', '🙏': 'sunrise', '✝️': 'cross' };

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  return '1 week ago';
}

function EpisodeCard({ episode }: { episode: PodcastEpisode }) {
  const { c, elev } = useTheme();
  const [saved, setSaved] = useState(episode.isSaved);
  const toggleSave = useToggleSave();
  const currentlyPlaying = usePodcastStore((s) => s.currentlyPlaying);
  const isPlaying = usePodcastStore((s) => s.isPlaying);
  const isCurrent = currentlyPlaying?.id === episode.id;

  const onSave = () => {
    const next = !saved;
    setSaved(next);
    toggleSave.mutate({ episodeId: episode.id, save: next }, { onError: () => setSaved(!next) });
  };

  const onPlay = () => {
    playEpisode(episode).catch((err) =>
      Alert.alert('Playback error', err instanceof Error ? err.message : 'Could not play audio.'),
    );
  };

  return (
    <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairlineSoft, borderRadius: Radii.lg, padding: 13, marginBottom: 11, flexDirection: 'row', gap: 13, ...elev.card }}>
      <View style={{ width: 64, height: 64, borderRadius: Radii.sm, backgroundColor: c.goldSoft, borderWidth: 1, borderColor: c.hairlineSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={EP_ICON[episode.thumbnailEmoji] ?? 'mic'} size={22} color={c.gold} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text numberOfLines={1} style={{ fontSize: 9.5, color: c.gold, fontFamily: Fonts.sansSemi, letterSpacing: 1.4, textTransform: 'uppercase' }}>
          {episode.channelName}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 13.5, fontFamily: Fonts.sansMed, color: c.ink, letterSpacing: 0.2 }}>
          {episode.title}
        </Text>
        <Text style={{ fontSize: 11, color: c.ink3, fontFamily: Fonts.sansLight }}>
          {episode.durationMinutes} min · {formatRelativeDate(episode.publishedAt)}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 7, alignItems: 'center' }}>
          <GoldPill
            label={isCurrent && isPlaying ? 'Pause' : 'Play'}
            icon={isCurrent && isPlaying ? 'pause' : 'play'}
            iconSize={9}
            onPress={onPlay}
            paddingH={14}
            paddingV={6}
            fontSize={10.5}
          />
          <PressScale onPress={onSave} to={0.88}>
            <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: saved ? c.hopeBorder : c.hairlineSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="star" size={12} color={saved ? c.hope : c.ink3} strokeWidth={1.5} />
            </View>
          </PressScale>
        </View>
      </View>
    </View>
  );
}

function PlayerBar() {
  const { c, elev } = useTheme();
  const episode = usePodcastStore((s) => s.currentlyPlaying);
  const isPlaying = usePodcastStore((s) => s.isPlaying);
  const position = usePodcastStore((s) => s.playbackPosition);
  if (!episode) return null;

  const totalSeconds = Math.max(episode.durationMinutes * 60, 1);
  const progress = Math.min(position / totalSeconds, 1);

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: c.hairlineSoft, backgroundColor: c.surface2 }}>
      <View style={{ height: 2.5, backgroundColor: c.hairlineSoft }}>
        <View style={{ height: 2.5, width: `${progress * 100}%`, backgroundColor: c.gold }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 11 }}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.goldSoft, borderWidth: 1, borderColor: c.hairlineSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={EP_ICON[episode.thumbnailEmoji] ?? 'mic'} size={15} color={c.gold} strokeWidth={1.6} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 12.5, fontFamily: Fonts.sansMed, color: c.ink }}>{episode.title}</Text>
          <Text numberOfLines={1} style={{ fontSize: 10.5, color: c.ink3, fontFamily: Fonts.sansLight }}>{episode.channelName}</Text>
        </View>
        <PressScale onPress={() => togglePlayPause()} to={0.88}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center', paddingLeft: isPlaying ? 0 : 2, ...elev.chip }}>
            <Icon name={isPlaying ? 'pause' : 'play'} size={12} color={c.onGold} />
          </View>
        </PressScale>
        <PressScale onPress={() => stopPlayback()} to={0.88}>
          <Icon name="x" size={13} color={c.ink3} strokeWidth={1.7} />
        </PressScale>
      </View>
    </View>
  );
}

function ChannelCard({ channel }: { channel: PodcastChannel }) {
  const { c, elev } = useTheme();
  const [subscribed, setSubscribed] = useState(channel.isSubscribed);
  const toggleSubscribe = useToggleSubscribe();

  const onToggle = () => {
    const next = !subscribed;
    setSubscribed(next);
    toggleSubscribe.mutate({ channelId: channel.id, subscribe: next }, { onError: () => setSubscribed(!next) });
  };

  return (
    <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairlineSoft, borderRadius: Radii.lg, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 11, flexDirection: 'row', alignItems: 'center', gap: 13, ...elev.card }}>
      <Medallion initial={channel.name[0]} size={50} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text numberOfLines={1} style={{ fontSize: 13.5, fontFamily: Fonts.sansMed, color: c.ink, letterSpacing: 0.2 }}>{channel.name}</Text>
        <Text style={{ fontSize: 10.5, color: c.ink3, fontFamily: Fonts.sansLight, letterSpacing: 0.3 }}>
          {channel.episodeCount} episodes · {(channel.subscriberCount / 1000).toFixed(0)}K subscribers
        </Text>
      </View>
      {subscribed ? (
        <PressScale onPress={onToggle} to={0.93}>
          <View style={{ backgroundColor: c.surface2, borderWidth: 1, borderColor: c.hairline, paddingHorizontal: 15, paddingVertical: 8, borderRadius: Radii.pill }}>
            <Text style={{ color: c.ink2, fontSize: 10.5, fontFamily: Fonts.sansSemi, letterSpacing: 0.8 }}>Following</Text>
          </View>
        </PressScale>
      ) : (
        <GoldPill label="Subscribe" onPress={onToggle} paddingH={15} paddingV={8} fontSize={10.5} />
      )}
    </View>
  );
}

function CategoryCard({ category }: { category: PodcastCategory }) {
  const { c, elev } = useTheme();
  return (
    <PressScale onPress={() => Alert.alert(category.name, `${category.showCount} shows`)} to={0.97}>
      <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairlineSoft, borderRadius: Radii.lg, paddingVertical: 18, paddingHorizontal: 12, alignItems: 'center', gap: 8, ...elev.card }}>
        <Medallion initial={category.name[0]} size={44} />
        <Text style={{ fontSize: 12.5, fontFamily: Fonts.sansMed, color: c.ink, letterSpacing: 0.3 }}>{category.name}</Text>
        <Text style={{ fontSize: 10, color: c.ink3, fontFamily: Fonts.sansLight, letterSpacing: 0.6 }}>{category.showCount} shows</Text>
      </View>
    </PressScale>
  );
}

function EmptyState({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 64, paddingHorizontal: 24, gap: 14 }}>
      <View style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 1, borderColor: c.hairlineSoft, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={26} color={c.ink3} strokeWidth={1.4} />
      </View>
      <Text style={{ fontFamily: Fonts.serif, fontSize: 21, color: c.ink }}>{title}</Text>
      <Text style={{ fontSize: 12, fontFamily: Fonts.sansLight, color: c.ink3, textAlign: 'center', lineHeight: 20 }}>{text}</Text>
    </View>
  );
}

interface PickedAudio {
  uri: string;
  name: string;
  contentType: string;
  durationSeconds: number;
}

function UploadModal({ visible, channels, onClose }: { visible: boolean; channels: PodcastChannel[]; onClose: () => void }) {
  const { c, elev, isDark } = useTheme();
  const [title, setTitle] = useState('');
  const [channelId, setChannelId] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickedAudio | null>(null);
  const upload = useUploadEpisode();

  const reset = () => { setTitle(''); setChannelId(null); setPicked(null); };

  const onPickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
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
      { channelId, title: title.trim(), uri: picked.uri, contentType: picked.contentType, durationSeconds: picked.durationSeconds },
      {
        onSuccess: () => { reset(); onClose(); Alert.alert('Posted', 'Your episode is now live.'); },
        onError: (err) => Alert.alert('Upload failed', err instanceof Error ? err.message : 'Please try again.'),
      },
    );
  };

  const label = { fontSize: 9.5, fontFamily: Fonts.sansSemi, color: c.ink3, letterSpacing: 2, textTransform: 'uppercase' as const };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(6,5,5,0.5)', justifyContent: 'flex-end' }}>
        {/* StickyInputBar keeps the sheet's inputs riding the keyboard — replaces KeyboardAvoidingView. */}
        <StickyInputBar style={{ maxHeight: '85%' }}>
          <Glass intensity={28} tint={isDark ? 'dark' : 'light'} style={{ backgroundColor: c.sheet, borderTopWidth: 1, borderTopColor: c.hairline, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
          <View style={{ paddingHorizontal: 22, paddingTop: 12, paddingBottom: 10, gap: 13 }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 38, height: 4.5, borderRadius: 3, backgroundColor: c.grabber }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <SerifTitle size={21}>Post an episode</SerifTitle>
            <GlassCircle icon="x" onPress={onClose} size={32} iconSize={13} />
          </View>

          <Text style={label}>Title</Text>
          <TextInput
            style={{ backgroundColor: c.input, borderWidth: 1, borderColor: c.hairlineSoft, borderRadius: Radii.sm, height: 46, paddingHorizontal: 16, color: c.ink, fontSize: 13.5, fontFamily: Fonts.sansLight }}
            placeholder="Episode title"
            placeholderTextColor={c.ink3}
            value={title}
            onChangeText={setTitle}
            maxLength={200}
          />

          <Text style={label}>Channel</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {channels.map((ch) => {
              const on = channelId === ch.id;
              return (
                <PressScale
                  key={ch.id}
                  onPress={() => setChannelId(ch.id)}
                  style={{
                    borderWidth: 1, borderColor: on ? c.hope : c.hairlineSoft,
                    backgroundColor: on ? c.hopeSoft : c.surface,
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radii.pill,
                  }}
                >
                  <Text style={{ fontSize: 11, color: on ? c.hope : c.ink2, fontFamily: on ? Fonts.sansMed : Fonts.sans, letterSpacing: 0.4 }}>
                    {ch.name}
                  </Text>
                </PressScale>
              );
            })}
          </ScrollView>

          <Text style={label}>Audio file</Text>
          <PressScale
            onPress={onPickFile}
            style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: c.hairline, borderRadius: Radii.sm, paddingVertical: 15, alignItems: 'center' }}
          >
            <Text style={{ color: c.gold, fontSize: 12.5, fontFamily: Fonts.sansMed, letterSpacing: 0.4 }}>
              {picked ? picked.name : 'Choose an mp3'}
            </Text>
          </PressScale>
          {picked && picked.durationSeconds > 0 && (
            <Text style={{ fontSize: 11, color: c.ink3, fontFamily: Fonts.sansLight }}>
              {Math.round(picked.durationSeconds / 60)} min
            </Text>
          )}

          <PressScale onPress={onSubmit} disabled={!canSubmit} to={0.97}>
            <View style={{ backgroundColor: c.hope, borderWidth: 1, borderColor: c.hopeBorder, borderRadius: Radii.pill, paddingVertical: 14, alignItems: 'center', opacity: canSubmit ? 1 : 0.45, marginTop: 6, ...elev.chip }}>
              {upload.isPending ? (
                <ActivityIndicator color={c.onHope} />
              ) : (
                <Text style={{ color: c.onHope, fontSize: 13, fontFamily: Fonts.sansSemi, letterSpacing: 0.8 }}>Post episode</Text>
              )}
            </View>
          </PressScale>
          </View>
          </Glass>
        </StickyInputBar>
      </View>
    </Modal>
  );
}

interface Props {
  onClose: () => void;
}

export function PodcastScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const { activeTab, setActiveTab } = usePodcastStore();
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data: episodes = [] } = usePodcastEpisodes();
  const { data: channels = [] } = usePodcastChannels();
  const { data: categories = [] } = usePodcastCategories();

  // Stop and unload audio when leaving the podcasts screen.
  useEffect(() => () => { stopPlayback(); }, []);

  const downloads = episodes.filter((e) => e.isDownloaded);
  const saved = episodes.filter((e) => e.isSaved);

  const sectionTitle = (t: string, mt = 0) => (
    <View style={{ marginBottom: 14, marginTop: mt }}>
      <SerifTitle size={19}>{t}</SerifTitle>
    </View>
  );

  const renderTabContent = useCallback(() => {
    switch (activeTab) {
      case 'library':
        return (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {sectionTitle('Latest Episodes')}
            {episodes.slice(0, 3).map((ep) => <EpisodeCard key={ep.id} episode={ep} />)}
            {sectionTitle('Recent Updates', 22)}
            {episodes.slice(3).map((ep) => <EpisodeCard key={ep.id} episode={ep} />)}
          </ScrollView>
        );
      case 'episodes':
        return (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {sectionTitle('All Episodes')}
            {episodes.map((ep) => <EpisodeCard key={ep.id} episode={ep} />)}
          </ScrollView>
        );
      case 'downloads':
        return (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {sectionTitle('Downloaded Episodes')}
            {downloads.length === 0
              ? <EmptyState icon="film" title="No downloads" text="Downloaded episodes appear here for offline listening." />
              : downloads.map((ep) => <EpisodeCard key={ep.id} episode={ep} />)}
          </ScrollView>
        );
      case 'saved':
        return saved.length === 0 ? (
          <EmptyState icon="star" title="No saved episodes" text="Save your favourite episodes here for easy access later." />
        ) : (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {saved.map((ep) => <EpisodeCard key={ep.id} episode={ep} />)}
          </ScrollView>
        );
      case 'categories':
        return (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {sectionTitle('Browse by Category')}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 11 }}>
              {categories.map((cat) => (
                <View key={cat.id} style={{ width: '47.5%' }}>
                  <CategoryCard category={cat} />
                </View>
              ))}
            </View>
          </ScrollView>
        );
      case 'channels':
        return (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {sectionTitle('Popular Channels')}
            {channels.map((ch) => <ChannelCard key={ch.id} channel={ch} />)}
          </ScrollView>
        );
    }
  }, [activeTab, episodes, downloads, saved, categories, channels]);

  return (
    <View style={{ flex: 1, backgroundColor: c.sheet, paddingTop: insets.top }}>
      {/* header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
          <GlassCircle icon="back" onPress={onClose} iconSize={16} />
          <SerifTitle size={23}>Podcasts</SerifTitle>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <GoldPill label="Post" icon="plus" onPress={() => setUploadOpen(true)} />
          <GlassCircle icon="search" iconSize={14} />
        </View>
      </View>

      <UploadModal visible={uploadOpen} channels={channels} onClose={() => setUploadOpen(false)} />

      {/* tabs */}
      <View style={{ borderBottomWidth: 1, borderBottomColor: c.hairlineSoft }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }}>
          {TABS.map((tab) => {
            const on = activeTab === tab.key;
            return (
              <PressScale
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                to={0.96}
                style={{ paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 2, borderBottomColor: on ? c.hope : 'transparent' }}
              >
                <Text style={{ fontSize: 12, fontFamily: Fonts.sansMed, color: on ? c.hope : c.ink3, letterSpacing: 0.5 }}>
                  {tab.label}
                </Text>
              </PressScale>
            );
          })}
        </ScrollView>
      </View>

      <View style={{ flex: 1 }}>{renderTabContent()}</View>

      <PlayerBar />
      <View style={{ height: insets.bottom }} />
    </View>
  );
}
