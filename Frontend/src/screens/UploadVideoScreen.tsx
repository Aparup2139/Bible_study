import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { Video, ResizeMode } from 'expo-av';
import { useUploadVideo, waitForPlayable } from '../hooks/useUploadVideo';
import { Colors, Typography, Spacing, BorderRadius } from '../theme';

interface Props {
  onClose: () => void;
}

type Phase = 'idle' | 'uploading' | 'processing' | 'ready' | 'error';

const { width } = Dimensions.get('window');
const PLAYER_HEIGHT = width * (9 / 16);

/** Map a picked file to a Cloudflare-friendly video MIME type. */
function resolveVideoMime(mimeType: string | undefined, name: string): string {
  if (mimeType && mimeType.startsWith('video/')) return mimeType;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
  };
  return map[ext] ?? 'video/mp4';
}

export function UploadVideoScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const upload = useUploadVideo();

  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState<string>('');
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [error, setError] = useState<string>('');

  const pickAndUpload = useCallback(async () => {
    setError('');
    const picked = await DocumentPicker.getDocumentAsync({
      type: 'video/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled || !picked.assets?.length) return;

    const asset = picked.assets[0];
    const name = asset.name ?? 'video.mp4';
    const contentType = resolveVideoMime(asset.mimeType, name);
    setFileName(name);

    try {
      setPhase('uploading');
      const { playbackUrl: url } = await upload.mutateAsync({
        uri: asset.uri,
        name,
        contentType,
      });

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

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.base }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} hitSlop={12}>
          <Text style={styles.close}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Upload Video</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.body}>
        {phase === 'idle' && (
          <View style={styles.center}>
            <Text style={styles.hero}>🎬</Text>
            <Text style={styles.heading}>Share a video</Text>
            <Text style={styles.sub}>
              Pick a video from your device. It uploads to Cloudflare Stream and plays back here.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={pickAndUpload} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Choose a video</Text>
            </TouchableOpacity>
          </View>
        )}

        {(phase === 'uploading' || phase === 'processing') && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.heading}>
              {phase === 'uploading' ? 'Uploading…' : 'Processing…'}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {fileName}
            </Text>
            <Text style={styles.note}>
              {phase === 'uploading'
                ? 'Sending your video to Cloudflare.'
                : 'Cloudflare is transcoding to HLS — this can take a few seconds.'}
            </Text>
          </View>
        )}

        {phase === 'ready' && playbackUrl && (
          <View style={styles.center}>
            <Text style={styles.heading}>Now playing</Text>
            <Video
              source={{ uri: playbackUrl }}
              style={styles.player}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
            />
            <Text style={styles.note} numberOfLines={1}>{fileName}</Text>
            <TouchableOpacity style={styles.secondaryBtn} onPress={reset} activeOpacity={0.85}>
              <Text style={styles.secondaryBtnText}>Upload another</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'error' && (
          <View style={styles.center}>
            <Text style={styles.hero}>⚠️</Text>
            <Text style={styles.heading}>Something went wrong</Text>
            <Text style={styles.sub}>{error}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={reset} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  close: {
    color: Colors.textPrimary,
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    width: 24,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
  },
  body: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  hero: {
    fontSize: 72,
  },
  heading: {
    color: Colors.textPrimary,
    fontSize: Typography['2xl'],
    fontWeight: Typography.bold,
  },
  sub: {
    color: Colors.textSecondary,
    fontSize: Typography.base,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  note: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.md,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: Typography.base,
    fontWeight: Typography.bold,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.md,
  },
  secondaryBtnText: {
    color: Colors.textPrimary,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  player: {
    width: '100%',
    height: PLAYER_HEIGHT,
    backgroundColor: '#000',
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
});
