import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IRtcEngine, IRtcEngineEventHandler } from 'react-native-agora';
import { Colors, Typography, Spacing, BorderRadius } from '../theme';
import { useRtcToken, useStreamDetail, joinViewer, leaveViewer } from '../hooks/useLiveStreams';
import { getAgora, getEngine, destroyEngine, isAgoraAvailable } from '../services/agoraEngine';

interface Props {
  streamId: string;
  onClose: () => void;
}

/**
 * Watch a live stream (Agora audience role). Joins the stream's channel with a
 * backend-minted subscriber token and renders the host's video. Requires a dev
 * build; under Expo Go it shows a build prompt.
 */
export function LiveViewerScreen({ streamId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const rtcToken = useRtcToken();

  const [phase, setPhase] = useState<'connecting' | 'watching' | 'ended' | 'error'>('connecting');
  const [error, setError] = useState('');
  const [hostUid, setHostUid] = useState<number | null>(null);

  const engineRef = useRef<IRtcEngine | null>(null);
  const handlerRef = useRef<IRtcEngineEventHandler | null>(null);
  const joinedRef = useRef(false);

  // Title / host / viewer count overlay (and "ended" detection via the DB row).
  const { data: detail } = useStreamDetail(streamId, phase !== 'error');

  const agoraReady = isAgoraAvailable();

  const teardown = useCallback(() => {
    const engine = engineRef.current;
    if (engine) {
      try {
        if (handlerRef.current) engine.unregisterEventHandler(handlerRef.current);
        engine.leaveChannel();
      } catch {
        /* engine may already be gone */
      }
    }
    destroyEngine();
    engineRef.current = null;
    handlerRef.current = null;
    if (joinedRef.current) {
      leaveViewer(streamId);
      joinedRef.current = false;
    }
  }, [streamId]);

  useEffect(() => {
    if (!agoraReady) return;
    const agora = getAgora()!;
    let cancelled = false;

    (async () => {
      try {
        const t = await rtcToken.mutateAsync(streamId);
        if (cancelled) return;
        const engine = getEngine(t.appId);
        engineRef.current = engine;
        const handler: IRtcEngineEventHandler = {
          // In the live-broadcast profile these fire for broadcasters only —
          // i.e. exactly the host joining/leaving.
          onUserJoined: (_conn, remoteUid) => setHostUid(remoteUid),
          onUserOffline: () => {
            setHostUid(null);
            setPhase('ended');
          },
          onJoinChannelSuccess: () => setPhase('watching'),
          onTokenPrivilegeWillExpire: () => {
            void rtcToken
              .mutateAsync(streamId)
              .then((nt) => engineRef.current?.renewToken(nt.token))
              .catch(() => {});
          },
        };
        handlerRef.current = handler;
        engine.registerEventHandler(handler);
        engine.enableVideo();
        engine.joinChannel(t.token, t.channel, t.uid, {
          clientRoleType: agora.ClientRoleType.ClientRoleAudience,
          audienceLatencyLevel:
            agora.AudienceLatencyLevelType.AudienceLatencyLevelLowLatency,
          autoSubscribeVideo: true,
          autoSubscribeAudio: true,
        });
        joinViewer(streamId);
        joinedRef.current = true;
      } catch (e) {
        if (!cancelled) {
          setPhase('error');
          setError(e instanceof Error ? e.message : 'Could not join the stream.');
        }
      }
    })();

    return () => {
      cancelled = true;
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId, agoraReady]);

  // The host's END updates the DB before viewers get onUserOffline — catch both.
  useEffect(() => {
    if (detail?.status === 'ended' && phase === 'watching') setPhase('ended');
  }, [detail?.status, phase]);

  // ── Expo Go (or Agora unavailable): explain, don't crash ──
  if (!agoraReady) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + Spacing.base }]}>
        <Header onClose={onClose} title="Live" />
        <View style={styles.center}>
          <Text style={styles.hero}>📺</Text>
          <Text style={styles.heading}>Watching live needs the dev build</Text>
          <Text style={styles.sub}>
            Live playback uses Agora, a native module that isn't in Expo Go. Install the
            custom dev build (eas build --profile development) to watch streams.
          </Text>
        </View>
      </View>
    );
  }

  const agora = getAgora()!;
  // TextureView on Android: this screen lives inside a RN Modal, and a
  // SurfaceView composites behind the Modal's window — video renders black.
  // iOS keeps RtcSurfaceView (a plain UIView there; RtcTextureView is Android-only).
  const VideoView = Platform.OS === 'android' ? agora.RtcTextureView : agora.RtcSurfaceView;

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.base }]}>
      {hostUid != null && phase === 'watching' ? (
        <View style={StyleSheet.absoluteFill}>
          <VideoView canvas={{ uid: hostUid }} style={StyleSheet.absoluteFill} />
        </View>
      ) : null}

      <Header onClose={onClose} title={detail?.title ?? 'Live'} live={phase === 'watching'} />

      {phase === 'connecting' && (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.sub}>Joining stream…</Text>
        </View>
      )}

      {phase === 'watching' && hostUid == null && (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.sub}>Waiting for the host's video…</Text>
        </View>
      )}

      {phase === 'ended' && (
        <View style={styles.center}>
          <Text style={styles.hero}>🙏</Text>
          <Text style={styles.heading}>Stream ended</Text>
          <Text style={styles.sub}>Thanks for watching.</Text>
          <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.doneText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'error' && (
        <View style={styles.center}>
          <Text style={styles.hero}>⚠️</Text>
          <Text style={styles.heading}>Couldn't join</Text>
          <Text style={styles.sub}>{error}</Text>
        </View>
      )}

      {phase === 'watching' && (
        <View style={[styles.overlay, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle} numberOfLines={1}>
              {detail?.title ?? 'Live stream'}
            </Text>
            <Text style={styles.infoSub}>{detail?.viewerCount ?? 0} watching</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function Header({ onClose, title, live }: { onClose: () => void; title: string; live?: boolean }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onClose} hitSlop={12}>
        <Text style={styles.close}>✕</Text>
      </TouchableOpacity>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {live ? (
        <View style={styles.liveBadge}>
          <View style={styles.dot} />
          <Text style={styles.liveBadgeText}>LIVE</Text>
        </View>
      ) : (
        <View style={{ width: 48 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingHorizontal: Spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 },
  close: { color: '#fff', fontSize: Typography.xl, fontWeight: Typography.bold, width: 48 },
  title: {
    color: '#fff',
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    flex: 1,
    textAlign: 'center',
    paddingHorizontal: Spacing.sm,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,0,0,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    width: 48,
    justifyContent: 'center',
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  liveBadgeText: { color: '#fff', fontSize: Typography.xs, fontWeight: Typography.bold },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, zIndex: 5 },
  hero: { fontSize: 72 },
  heading: { color: '#fff', fontSize: Typography['2xl'], fontWeight: Typography.bold, textAlign: 'center' },
  sub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: Typography.base,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: Spacing.lg, zIndex: 8 },
  infoCard: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    gap: 4,
  },
  infoTitle: { color: '#fff', fontSize: Typography.base, fontWeight: Typography.bold },
  infoSub: { color: 'rgba(255,255,255,0.8)', fontSize: Typography.sm },
  doneBtn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  doneText: { color: '#fff', fontSize: Typography.base, fontWeight: Typography.semibold },
});
