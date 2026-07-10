import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, PermissionsAndroid, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IRtcEngine, IRtcEngineEventHandler } from 'react-native-agora';
import { Colors, Typography, Spacing, BorderRadius } from '../theme';
import { useAppStore } from '../store/useAppStore';
import { useGoLive, useEndStream, useRtcToken, useStreamDetail } from '../hooks/useLiveStreams';
import { getAgora, getEngine, destroyEngine, isAgoraAvailable } from '../services/agoraEngine';

interface Props {
  onClose: () => void;
}

/** Host uid inside every Agora channel (matches the backend's HOST_UID). */
const HOST_UID = 1;

/**
 * Agora does NOT request runtime permissions itself — without these it silently
 * captures black frames instead of failing.
 */
async function ensureMediaPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const res = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  ]);
  return Object.values(res).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
}

/**
 * Host live streaming over Agora. GO LIVE registers the stream on the backend
 * (so it appears in the Home feed), then broadcasts the phone camera into the
 * stream's Agora channel. Requires a dev build (react-native-agora is native);
 * under Expo Go it shows a build prompt.
 */
export function LiveStreamScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const profile = useAppStore((s) => s.profile);
  const goLive = useGoLive();
  const endStream = useEndStream();
  const rtcToken = useRtcToken();

  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');
  const [error, setError] = useState('');
  const [streamId, setStreamId] = useState<string | null>(null);
  // The native video view attaches itself to the engine exactly once, on mount
  // (its callApi prop → setupLocalVideo, silently dropped if the engine doesn't
  // exist yet). Mount it only after getEngine() has initialized the engine.
  const [engineReady, setEngineReady] = useState(false);

  const engineRef = useRef<IRtcEngine | null>(null);
  const handlerRef = useRef<IRtcEngineEventHandler | null>(null);
  const streamIdRef = useRef<string | null>(null);

  // Viewer count comes from the backend (Agora doesn't report audience joins
  // to broadcasters in the live-broadcast profile).
  const { data: detail } = useStreamDetail(streamId, status === 'live');
  const viewers = detail?.viewerCount ?? 0;

  const agoraReady = isAgoraAvailable();

  const stopBroadcast = useCallback((endOnServer: boolean) => {
    const engine = engineRef.current;
    if (engine) {
      try {
        if (handlerRef.current) engine.unregisterEventHandler(handlerRef.current);
        engine.stopPreview();
        engine.leaveChannel();
      } catch {
        /* engine may already be gone */
      }
    }
    destroyEngine();
    engineRef.current = null;
    handlerRef.current = null;
    setEngineReady(false);
    if (endOnServer && streamIdRef.current) endStream.mutate(streamIdRef.current);
    streamIdRef.current = null;
    setStreamId(null);
    setStatus('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Never strand a live DB row if the modal is dismissed mid-broadcast.
  useEffect(() => {
    return () => {
      if (streamIdRef.current) stopBroadcast(true);
    };
  }, [stopBroadcast]);

  const renewToken = useCallback(async () => {
    const id = streamIdRef.current;
    const engine = engineRef.current;
    if (!id || !engine) return;
    try {
      const t = await rtcToken.mutateAsync(id);
      engine.renewToken(t.token);
    } catch {
      /* next expiry event retries */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGoLive = useCallback(async () => {
    const agora = getAgora();
    if (!agora) return;
    setError('');
    setStatus('connecting');
    try {
      if (!(await ensureMediaPermissions())) {
        setStatus('error');
        setError('Camera and microphone permission are required to go live. Enable them in Settings → Apps → BibleWay → Permissions.');
        return;
      }
      const title = `${profile.displayName}'s live`;
      const res = await goLive.mutateAsync({ title });
      streamIdRef.current = res.streamId;
      setStreamId(res.streamId);

      const engine = getEngine(res.appId);
      engineRef.current = engine;
      setEngineReady(true);
      const handler: IRtcEngineEventHandler = {
        onJoinChannelSuccess: () => setStatus('live'),
        onTokenPrivilegeWillExpire: () => void renewToken(),
        onRequestToken: () => void renewToken(),
      };
      handlerRef.current = handler;
      engine.registerEventHandler(handler);
      engine.enableVideo();
      engine.setVideoEncoderConfiguration({
        dimensions: { width: 720, height: 1280 },
        frameRate: 24,
      });
      engine.startPreview();
      engine.joinChannel(res.token, res.channel, HOST_UID, {
        clientRoleType: agora.ClientRoleType.ClientRoleBroadcaster,
        publishCameraTrack: true,
        publishMicrophoneTrack: true,
      });
    } catch (e) {
      stopBroadcast(true);
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Could not start the stream.');
    }
  }, [goLive, profile.displayName, renewToken, stopBroadcast]);

  const handleEnd = useCallback(() => {
    stopBroadcast(true);
    onClose();
  }, [stopBroadcast, onClose]);

  // ── Expo Go (or Agora unavailable): explain, don't crash ──
  if (!agoraReady) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + Spacing.base }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Go Live</Text>
          <View style={{ width: 48 }} />
        </View>
        <View style={styles.center}>
          <Text style={styles.hero}>📹</Text>
          <Text style={styles.heading}>Live needs the dev build</Text>
          <Text style={styles.sub}>
            Camera live streaming uses Agora, a native module that isn't in Expo Go. Install
            the custom dev build (eas build --profile development) to broadcast. Everything
            else in the app works here in Expo Go.
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
  const isBroadcasting = status === 'live' || status === 'connecting';

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.base }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={isBroadcasting ? handleEnd : onClose} hitSlop={12}>
          <Text style={styles.close}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Go Live</Text>
        {status === 'live' ? (
          <View style={styles.liveBadge}>
            <View style={styles.dot} />
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </View>
        ) : (
          <View style={{ width: 48 }} />
        )}
      </View>

      {isBroadcasting && engineReady ? (
        <View style={StyleSheet.absoluteFill}>
          <VideoView
            canvas={{ uid: 0, sourceType: agora.VideoSourceType.VideoSourceCamera }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      ) : null}

      {status === 'idle' && (
        <View style={styles.center}>
          <Text style={styles.hero}>📹</Text>
          <Text style={styles.heading}>Ready to Go Live?</Text>
          <Text style={styles.sub}>
            Broadcast straight from your camera. Your stream shows up in everyone's
            Streaming Now feed the moment you go live.
          </Text>
        </View>
      )}

      {status === 'error' && (
        <View style={styles.center}>
          <Text style={styles.hero}>⚠️</Text>
          <Text style={styles.heading}>Couldn't go live</Text>
          <Text style={styles.sub}>{error}</Text>
        </View>
      )}

      {isBroadcasting && (
        <View style={[styles.overlay, { paddingBottom: insets.bottom + 120 }]}>
          <View style={styles.linkCard}>
            <Text style={styles.linkLabel}>
              {status === 'connecting'
                ? 'Starting…'
                : `${viewers} watching · live in the BibleWay feed`}
            </Text>
          </View>
        </View>
      )}

      <View style={[styles.controls, { paddingBottom: insets.bottom + Spacing.lg }]}>
        {status === 'idle' || status === 'error' ? (
          <TouchableOpacity style={styles.goLiveBtn} onPress={handleGoLive} activeOpacity={0.85}>
            <Text style={styles.goLiveText}>GO LIVE</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.endBtn} onPress={handleEnd} activeOpacity={0.85}>
            <Text style={styles.goLiveText}>END</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingHorizontal: Spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 },
  close: { color: '#fff', fontSize: Typography.xl, fontWeight: Typography.bold, width: 48 },
  title: { color: '#fff', fontSize: Typography.lg, fontWeight: Typography.bold },
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
  linkCard: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  linkLabel: { color: 'rgba(255,255,255,0.8)', fontSize: Typography.sm, fontWeight: Typography.semibold },
  controls: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  goLiveBtn: {
    backgroundColor: Colors.primary,
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endBtn: {
    backgroundColor: '#666',
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goLiveText: { color: '#fff', fontSize: Typography.sm, fontWeight: Typography.bold, letterSpacing: 1 },
});
