import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IRtcEngine, IRtcEngineEventHandler } from 'react-native-agora';
import { useAppStore } from '../store/useAppStore';
import { useGoLive, useEndStream, useRtcToken, useStreamDetail } from '../hooks/useLiveStreams';
import { useLiveChat } from '../hooks/useLiveChat';
import { getAgora, getEngine, destroyEngine, isAgoraAvailable } from '../services/agoraEngine';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Radii } from '../theme/elegant';
import { Icon } from '../components/elegant/Icons';
import { GlassCircle, LiveBadge, PressScale } from '../components/elegant/Kit';
import { ChatFeed } from '../components/elegant/LiveChat';

interface Props {
  onClose: () => void;
}

/** Host uid inside every Agora channel (matches the backend's HOST_UID). */
const HOST_UID = 1;

/** Agora does NOT request runtime permissions itself. */
async function ensureMediaPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const res = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  ]);
  return Object.values(res).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
}

function CenterMessage({ icon, heading, sub }: { icon: 'video' | 'x'; heading: string; sub: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.center}>
      <View style={{ width: 88, height: 88, borderRadius: 44, borderWidth: 1, borderColor: c.hairline, backgroundColor: c.goldSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={32} color={c.gold} strokeWidth={1.4} />
      </View>
      <Text style={{ fontFamily: Fonts.serif, fontSize: 27, color: c.ink, textAlign: 'center' }}>{heading}</Text>
      <Text style={{ color: c.ink2, fontSize: 13, fontFamily: Fonts.sansLight, textAlign: 'center', lineHeight: 22, paddingHorizontal: 34, letterSpacing: 0.2 }}>
        {sub}
      </Text>
    </View>
  );
}

export function LiveStreamScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const profile = useAppStore((s) => s.profile);
  const goLive = useGoLive();
  const endStream = useEndStream();
  const rtcToken = useRtcToken();

  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');
  const [error, setError] = useState('');
  const [streamId, setStreamId] = useState<string | null>(null);
  const [engineReady, setEngineReady] = useState(false);

  // Host reads chat and answers on air — no input bar while broadcasting.
  const { messages } = useLiveChat(streamId ?? '', profile.displayName);

  const engineRef = useRef<IRtcEngine | null>(null);
  const handlerRef = useRef<IRtcEngineEventHandler | null>(null);
  const streamIdRef = useRef<string | null>(null);

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
      engine.setVideoEncoderConfiguration({ dimensions: { width: 720, height: 1280 }, frameRate: 24 });
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

  const header = (showLive: boolean) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, zIndex: 10 }}>
      <GlassCircle icon="x" onPress={status === 'live' || status === 'connecting' ? handleEnd : onClose} />
      <Text style={{ fontFamily: Fonts.serif, fontSize: 20, color: c.ink, letterSpacing: 0.4 }}>Go Live</Text>
      {showLive ? <LiveBadge /> : <View style={{ width: 38 }} />}
    </View>
  );

  // ── Expo Go (or Agora unavailable): explain, don't crash ──
  if (!agoraReady) {
    return (
      <View style={{ flex: 1, backgroundColor: c.sheet, paddingTop: insets.top + 12 }}>
        {header(false)}
        <CenterMessage
          icon="video"
          heading="Live needs the dev build"
          sub="Camera live streaming uses Agora, a native module that isn't in Expo Go. Install the custom dev build (eas build --profile development) to broadcast. Everything else in the app works here in Expo Go."
        />
      </View>
    );
  }

  const agora = getAgora()!;
  // TextureView on Android: this screen lives inside a RN Modal.
  const VideoView = Platform.OS === 'android' ? agora.RtcTextureView : agora.RtcSurfaceView;
  const isBroadcasting = status === 'live' || status === 'connecting';

  return (
    <View style={{ flex: 1, backgroundColor: isBroadcasting ? '#0A0806' : c.sheet, paddingTop: insets.top + 12 }}>
      {header(status === 'live')}

      {isBroadcasting && engineReady ? (
        <View style={StyleSheet.absoluteFill}>
          <VideoView canvas={{ uid: 0, sourceType: agora.VideoSourceType.VideoSourceCamera }} style={StyleSheet.absoluteFill} />
        </View>
      ) : null}

      {status === 'idle' && (
        <CenterMessage
          icon="video"
          heading="Ready to Go Live?"
          sub="Broadcast straight from your camera. Your stream appears in everyone's Streaming Now feed the moment you go live."
        />
      )}

      {status === 'error' && (
        <CenterMessage icon="x" heading="Couldn't go live" sub={error} />
      )}

      {isBroadcasting && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 130, paddingHorizontal: 22, zIndex: 8, gap: 10 }}>
          <ChatFeed messages={messages} />
          <View style={{ backgroundColor: 'rgba(12,9,6,0.62)', borderWidth: 1, borderColor: 'rgba(232,203,143,0.22)', borderRadius: Radii.md, paddingVertical: 14, paddingHorizontal: 16 }}>
            <Text style={{ color: '#EEDFBE', fontSize: 12, fontFamily: Fonts.sans, letterSpacing: 0.4 }}>
              {status === 'connecting' ? 'Starting…' : `${viewers} watching · live in the BibleWay feed`}
            </Text>
          </View>
        </View>
      )}

      {/* GO LIVE / END */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingBottom: insets.bottom + 24, zIndex: 10 }}>
        {status === 'idle' || status === 'error' ? (
          <PressScale onPress={handleGoLive} to={0.92}>
            <View style={{ shadowColor: c.gold, shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 0 } }}>
              <LinearGradient
                colors={[c.goldBright, c.gold]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ width: 86, height: 86, borderRadius: 43, alignItems: 'center', justifyContent: 'center', borderWidth: 6, borderColor: c.goldSoft }}
              >
                <Text style={{ color: c.onGold, fontSize: 10.5, fontFamily: Fonts.sansSemi, letterSpacing: 2 }}>GO LIVE</Text>
              </LinearGradient>
            </View>
          </PressScale>
        ) : (
          <PressScale onPress={handleEnd} to={0.92}>
            <View style={{ width: 86, height: 86, borderRadius: 43, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(14,11,7,0.6)', borderWidth: 1, borderColor: 'rgba(232,203,143,0.4)' }}>
              <Text style={{ color: '#EEDFBE', fontSize: 10.5, fontFamily: Fonts.sansSemi, letterSpacing: 2 }}>END</Text>
            </View>
          </PressScale>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 15, zIndex: 5 },
});
