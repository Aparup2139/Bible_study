import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IRtcEngine, IRtcEngineEventHandler } from 'react-native-agora';
import { useRtcToken, useStreamDetail, joinViewer, leaveViewer } from '../hooks/useLiveStreams';
import { getAgora, getEngine, destroyEngine, isAgoraAvailable } from '../services/agoraEngine';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Radii } from '../theme/elegant';
import { Icon } from '../components/elegant/Icons';
import { GlassCircle, GoldPill, PulseDot } from '../components/elegant/Kit';

interface Props {
  streamId: string;
  onClose: () => void;
}

function Header({ onClose, title, live }: { onClose: () => void; title: string; live?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, zIndex: 10 }}>
      <GlassCircle icon="x" onPress={onClose} onDeep />
      <Text numberOfLines={1} style={{ flex: 1, textAlign: 'center', paddingHorizontal: 8, fontFamily: Fonts.serif, fontSize: 20, color: '#F5EFDF', letterSpacing: 0.4 }}>
        {title}
      </Text>
      {live ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(14,11,7,0.55)', borderWidth: 1, borderColor: 'rgba(232,203,143,0.32)', paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999 }}>
          <PulseDot color="#E06A50" size={6} />
          <Text style={{ color: '#EEDFBE', fontSize: 9.5, fontFamily: Fonts.sansSemi, letterSpacing: 2.2 }}>LIVE</Text>
        </View>
      ) : (
        <View style={{ width: 38 }} />
      )}
    </View>
  );
}

function CenterMessage({ heading, sub, children }: { heading: string; sub: string; children?: React.ReactNode }) {
  return (
    <View style={styles.center}>
      <Text style={{ fontFamily: Fonts.serif, fontSize: 25, color: '#F5EFDF', textAlign: 'center' }}>{heading}</Text>
      <Text style={{ color: 'rgba(242,234,218,0.72)', fontSize: 13, fontFamily: Fonts.sansLight, textAlign: 'center', lineHeight: 22, paddingHorizontal: 34 }}>
        {sub}
      </Text>
      {children}
    </View>
  );
}

/**
 * Watch a live stream (Agora audience role). Requires a dev build; under
 * Expo Go it shows a build prompt.
 */
export function LiveViewerScreen({ streamId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const rtcToken = useRtcToken();

  const [phase, setPhase] = useState<'connecting' | 'watching' | 'ended' | 'error'>('connecting');
  const [error, setError] = useState('');
  const [hostUid, setHostUid] = useState<number | null>(null);

  const engineRef = useRef<IRtcEngine | null>(null);
  const handlerRef = useRef<IRtcEngineEventHandler | null>(null);
  const joinedRef = useRef(false);

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
          audienceLatencyLevel: agora.AudienceLatencyLevelType.AudienceLatencyLevelLowLatency,
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
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Header onClose={onClose} title="Live" />
        <CenterMessage
          heading="Watching live needs the dev build"
          sub="Live playback uses Agora, a native module that isn't in Expo Go. Install the custom dev build (eas build --profile development) to watch streams."
        />
      </View>
    );
  }

  const agora = getAgora()!;
  const VideoView = Platform.OS === 'android' ? agora.RtcTextureView : agora.RtcSurfaceView;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {hostUid != null && phase === 'watching' ? (
        <View style={StyleSheet.absoluteFill}>
          <VideoView canvas={{ uid: hostUid }} style={StyleSheet.absoluteFill} />
        </View>
      ) : null}

      <Header onClose={onClose} title={detail?.title ?? 'Live'} live={phase === 'watching'} />

      {phase === 'connecting' && (
        <View style={styles.center}>
          <ActivityIndicator color="#C9A257" size="large" />
          <Text style={styles.waiting}>Joining stream…</Text>
        </View>
      )}

      {phase === 'watching' && hostUid == null && (
        <View style={styles.center}>
          <ActivityIndicator color="#C9A257" size="large" />
          <Text style={styles.waiting}>Waiting for the host's video…</Text>
        </View>
      )}

      {phase === 'ended' && (
        <CenterMessage heading="Stream ended" sub="Thanks for watching.">
          <View style={{ marginTop: 10 }}>
            <GoldPill label="Back to Home" onPress={onClose} paddingH={24} paddingV={12} fontSize={12} />
          </View>
        </CenterMessage>
      )}

      {phase === 'error' && <CenterMessage heading="Couldn't join" sub={error} />}

      {phase === 'watching' && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, paddingBottom: insets.bottom + 20, zIndex: 8 }}>
          <View style={{ backgroundColor: 'rgba(12,9,6,0.62)', borderWidth: 1, borderColor: 'rgba(232,203,143,0.22)', borderRadius: Radii.xl, paddingVertical: 16, paddingHorizontal: 18, gap: 6 }}>
            <Text numberOfLines={1} style={{ fontFamily: Fonts.serif, color: '#F5EFDF', fontSize: 21, letterSpacing: 0.3 }}>
              {detail?.title ?? 'Live stream'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="eye" size={12} color="#E8CB8F" strokeWidth={1.6} />
              <Text style={{ color: 'rgba(242,234,218,0.72)', fontSize: 11.5, fontFamily: Fonts.sansLight, letterSpacing: 0.5 }}>
                {detail?.viewerCount ?? 0} watching
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0806' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 13, zIndex: 5 },
  waiting: { color: 'rgba(242,234,218,0.72)', fontSize: 13, fontFamily: Fonts.sansLight },
});
