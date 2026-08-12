import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Dimensions, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { Video, ResizeMode } from 'expo-av';
import { useUploadVideo, waitForPlayable } from '../hooks/useUploadVideo';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Radii } from '../theme/elegant';
import { Icon } from '../components/elegant/Icons';
import { GlassCircle, GoldPill, PressScale, SerifTitle } from '../components/elegant/Kit';

interface Props {
  onClose: () => void;
}

type Phase = 'idle' | 'uploading' | 'processing' | 'ready' | 'error';

const { width } = Dimensions.get('window');
const PLAYER_HEIGHT = (width - 52) * (9 / 16);

/** Map a picked file to a Cloudflare-friendly video MIME type. */
function resolveVideoMime(mimeType: string | undefined, name: string): string {
  if (mimeType && mimeType.startsWith('video/')) return mimeType;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', webm: 'video/webm', mkv: 'video/x-matroska',
  };
  return map[ext] ?? 'video/mp4';
}

export function UploadVideoScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { c, elev } = useTheme();
  const upload = useUploadVideo();

  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState<string>('');
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [error, setError] = useState<string>('');

  const pickAndUpload = useCallback(async () => {
    setError('');
    const picked = await DocumentPicker.getDocumentAsync({ type: 'video/*', copyToCacheDirectory: true, multiple: false });
    if (picked.canceled || !picked.assets?.length) return;

    const asset = picked.assets[0];
    const name = asset.name ?? 'video.mp4';
    const contentType = resolveVideoMime(asset.mimeType, name);
    setFileName(name);

    try {
      setPhase('uploading');
      const { playbackUrl: url } = await upload.mutateAsync({ uri: asset.uri, name, contentType });

      // Cloudflare needs a few seconds to transcode before HLS is playable.
      setPhase('processing');
      const ok = await waitForPlayable(url);
      if (!ok) {
        setError('The video is taking longer than expected to process. Try again shortly.');
        setPhase('error');
        return;
      }
      setPlaybackUrl(url);
      setPhase('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
      setPhase('error');
    }
  }, [upload]);

  const reset = useCallback(() => {
    setPhase('idle');
    setPlaybackUrl(null);
    setFileName('');
    setError('');
  }, []);

  const emblem = (
    <View style={{ width: 88, height: 88, borderRadius: 44, borderWidth: 1, borderColor: c.hairline, backgroundColor: c.goldSoft, alignItems: 'center', justifyContent: 'center', ...elev.chip }}>
      <Icon name="film" size={30} color={c.gold} strokeWidth={1.4} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.sheet, paddingTop: insets.top + 12 }}>
      {/* header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 }}>
        <GlassCircle icon="x" onPress={onClose} />
        <SerifTitle size={20}>Upload Video</SerifTitle>
        <View style={{ width: 38 }} />
      </View>

      <View style={{ flex: 1, paddingHorizontal: 26 }}>
        {phase === 'idle' && (
          <View style={styles.center}>
            {emblem}
            <SerifTitle size={26}>Share a video</SerifTitle>
            <Text style={{ color: c.ink2, fontSize: 12.5, fontFamily: Fonts.sansLight, textAlign: 'center', lineHeight: 21, letterSpacing: 0.2 }}>
              Pick a video from your device. It uploads to Cloudflare Stream and plays back here.
            </Text>
            <View style={{ marginTop: 8 }}>
              <GoldPill label="Choose a video" onPress={pickAndUpload} paddingH={30} paddingV={13} fontSize={12.5} />
            </View>
          </View>
        )}

        {(phase === 'uploading' || phase === 'processing') && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={c.gold} />
            <SerifTitle size={24}>{phase === 'uploading' ? 'Uploading…' : 'Processing…'}</SerifTitle>
            <Text numberOfLines={1} style={{ color: c.ink2, fontSize: 12, fontFamily: Fonts.sansLight, letterSpacing: 0.5 }}>{fileName}</Text>
            <Text style={{ color: c.ink3, fontSize: 10.5, fontFamily: Fonts.sansLight, textAlign: 'center', letterSpacing: 0.4 }}>
              {phase === 'uploading' ? 'Sending your video to Cloudflare.' : 'Cloudflare is transcoding to HLS — this can take a few seconds.'}
            </Text>
          </View>
        )}

        {phase === 'ready' && playbackUrl && (
          <View style={styles.center}>
            <SerifTitle size={24}>Now playing</SerifTitle>
            <Video
              source={{ uri: playbackUrl }}
              style={{ width: '100%', height: PLAYER_HEIGHT, backgroundColor: '#100E0D', borderRadius: Radii.xl, overflow: 'hidden' }}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
            />
            <Text numberOfLines={1} style={{ color: c.ink3, fontSize: 11, fontFamily: Fonts.sansLight, letterSpacing: 0.5 }}>{fileName}</Text>
            <PressScale onPress={reset} to={0.96}>
              <View style={{ borderWidth: 1, borderColor: c.hairline, paddingHorizontal: 26, paddingVertical: 12, borderRadius: Radii.pill, marginTop: 8 }}>
                <Text style={{ color: c.gold, fontSize: 12, fontFamily: Fonts.sansMed, letterSpacing: 0.8 }}>Upload another</Text>
              </View>
            </PressScale>
          </View>
        )}

        {phase === 'error' && (
          <View style={styles.center}>
            {emblem}
            <SerifTitle size={24}>Something went wrong</SerifTitle>
            <Text style={{ color: c.ink2, fontSize: 12.5, fontFamily: Fonts.sansLight, textAlign: 'center', lineHeight: 21 }}>{error}</Text>
            <View style={{ marginTop: 8 }}>
              <GoldPill label="Try again" onPress={reset} paddingH={26} paddingV={12} fontSize={12} />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = {
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 14 },
};
