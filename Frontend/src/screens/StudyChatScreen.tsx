import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, PermissionsAndroid, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IRtcEngine, IRtcEngineEventHandler } from 'react-native-agora';
import { useAppStore } from '../store/useAppStore';
import {
  useEndRoom,
  useJoinRoom,
  useLeaveRoom,
  usePromoteParticipant,
  useRaiseHand,
  useRoomDetail,
  useRoomParticipants,
  useRtcRoomToken,
  useSetForceMuted,
} from '../hooks/useStudyRoom';
import { destroyEngine, getAgora, getEngine, isAgoraAvailable } from '../services/agoraEngine';
import { useTheme } from '../theme/ThemeContext';
import { Deep, Fonts, Radii } from '../theme/elegant';
import { Icon } from '../components/elegant/Icons';
import { GlassCircle, PressScale, SectionLabel } from '../components/elegant/Kit';
import type { RoomParticipant } from '../types';

interface Props {
  onClose: () => void;
}

/** Agora does not request runtime permissions itself. */
async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

function initialsOf(name: string): string {
  const parts = name.replace(/_/g, ' ').split(' ').filter(Boolean);
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 1).toUpperCase();
}

function SpeakerAvatar({ participant, onForceMute }: { participant: RoomParticipant; onForceMute?: () => void }) {
  const { c } = useTheme();
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!participant.isSpeaking) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ring, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(ring, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [participant.isSpeaking, ring]);

  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.28] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  const avatarBody = (
    <View style={{ alignItems: 'center', width: 82, gap: 9 }}>
      <View style={{ width: 72, height: 72 }}>
        {participant.isSpeaking ? (
          <Animated.View
            style={{
              position: 'absolute', top: 0, left: 0, width: 72, height: 72, borderRadius: 36,
              borderWidth: 1.5, borderColor: c.gold,
              transform: [{ scale: ringScale }], opacity: ringOpacity,
            }}
          />
        ) : null}
        <View
          style={{
            width: 72, height: 72, borderRadius: 36,
            backgroundColor: c.surface2,
            borderWidth: participant.isSpeaking ? 1.5 : 1,
            borderColor: participant.isSpeaking ? c.gold : c.hairlineSoft,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: Fonts.serif, fontSize: 23, color: c.gold }}>
            {initialsOf(participant.displayName)}
          </Text>
        </View>
        <View
          style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 24, height: 24, borderRadius: 12,
            backgroundColor: c.surface2, borderWidth: 1, borderColor: c.hairline,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon name={participant.isMuted ? 'micOff' : 'mic'} size={10} color={participant.isMuted ? c.live : c.gold} strokeWidth={1.8} />
        </View>
      </View>
      <Text numberOfLines={1} style={{ fontSize: 11, fontFamily: Fonts.sans, color: c.ink2, textAlign: 'center', letterSpacing: 0.3, maxWidth: 82 }}>
        {participant.displayName}
      </Text>
    </View>
  );

  return onForceMute ? (
    <PressScale onPress={onForceMute} to={0.95}>{avatarBody}</PressScale>
  ) : (
    avatarBody
  );
}

function ListenerAvatar({ participant, onApprove }: { participant: RoomParticipant; onApprove?: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', width: 62, gap: 6 }}>
      <View
        style={{
          width: 54, height: 54, borderRadius: 27,
          backgroundColor: c.surface, borderWidth: 1, borderColor: participant.handRaised ? c.gold : c.hairlineSoft,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Text style={{ fontFamily: Fonts.serif, fontSize: 19, color: c.ink3 }}>
          {initialsOf(participant.displayName)}
        </Text>
      </View>
      <Text numberOfLines={1} style={{ fontSize: 10, fontFamily: Fonts.sansLight, color: c.ink3, textAlign: 'center', maxWidth: 62 }}>
        {participant.displayName}
      </Text>
      {participant.handRaised && onApprove ? (
        <TouchableOpacity onPress={onApprove} activeOpacity={0.7}>
          <Text style={{ color: c.gold, fontSize: 9.5, fontFamily: Fonts.sansMed }}>✋ Approve</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function StudyChatScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const profile = useAppStore((s) => s.profile);
  const myId = profile.id;

  const joinRoom = useJoinRoom();
  const leaveRoom = useLeaveRoom();
  const endRoom = useEndRoom();
  const raiseHand = useRaiseHand();
  const promoteParticipant = usePromoteParticipant();
  const setForceMuted = useSetForceMuted();
  const rtcToken = useRtcRoomToken();
  const wasListenerRef = useRef(true);

  const [phase, setPhase] = useState<'connecting' | 'live' | 'ended' | 'error'>('connecting');
  const [error, setError] = useState('');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [role, setRole] = useState<'host' | 'speaker' | 'listener'>('listener');
  const [muted, setMuted] = useState(true);

  const engineRef = useRef<IRtcEngine | null>(null);
  const handlerRef = useRef<IRtcEngineEventHandler | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const isHostRef = useRef(false);

  const agoraReady = isAgoraAvailable();
  const { data: detail } = useRoomDetail(roomId, phase !== 'error');
  const { data: participants = [] } = useRoomParticipants(roomId, phase === 'live');

  const teardown = useCallback((endOnServer: boolean) => {
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
    if (roomIdRef.current) {
      if (endOnServer && isHostRef.current) endRoom.mutate(roomIdRef.current);
      else if (endOnServer) leaveRoom.mutate(roomIdRef.current);
    }
    roomIdRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!agoraReady) return;
    const agora = getAgora()!;
    let cancelled = false;

    // Bail out of "Connecting…" if the join never completes (bad network, server down, etc).
    const connectTimeout = setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      teardown(true);
      setPhase('error');
      setError('Connecting to the audio room timed out. Check your connection and try again.');
    }, 20_000);

    (async () => {
      try {
        if (!(await ensureMicPermission())) {
          clearTimeout(connectTimeout);
          setPhase('error');
          setError('Microphone permission is required to join Study Chat. Enable it in Settings.');
          return;
        }
        const res = await joinRoom.mutateAsync({ displayName: profile.displayName, avatarEmoji: '🙂' });
        // The server-side join already happened even if we were cancelled while in flight —
        // record it so the cleanup below still notifies the server instead of orphaning the room.
        roomIdRef.current = res.roomId;
        isHostRef.current = res.role === 'host';
        wasListenerRef.current = res.role === 'listener';
        if (cancelled) return;
        setRoomId(res.roomId);
        setRole(res.role);

        const engine = getEngine(res.appId);
        engineRef.current = engine;
        const isPublisher = res.role !== 'listener';
        const handler: IRtcEngineEventHandler = {
          onJoinChannelSuccess: () => {
            clearTimeout(connectTimeout);
            setPhase('live');
          },
          onError: () => {
            if (cancelled) return;
            clearTimeout(connectTimeout);
            setPhase('error');
            setError('Could not connect to the audio room.');
          },
        };
        handlerRef.current = handler;
        engine.registerEventHandler(handler);
        engine.enableAudio();
        engine.joinChannel(res.token, res.channel, res.uid, {
          clientRoleType: isPublisher ? agora.ClientRoleType.ClientRoleBroadcaster : agora.ClientRoleType.ClientRoleAudience,
          publishMicrophoneTrack: isPublisher,
          autoSubscribeAudio: true,
        });
        if (isPublisher) engine.muteLocalAudioStream(true); // join muted, matches the footer's default
      } catch (e) {
        clearTimeout(connectTimeout);
        if (!cancelled) {
          setPhase('error');
          setError(e instanceof Error ? e.message : 'Could not join Study Chat.');
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(connectTimeout);
      teardown(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agoraReady]);

  useEffect(() => {
    if (detail?.status === 'ended' && phase === 'live') {
      // Room ended server-side (host left) — drop our own engine without re-notifying the server.
      teardown(false);
      setPhase('ended');
    }
  }, [detail?.status, phase, teardown]);

  useEffect(() => {
    if (phase !== 'live' || !roomId) return;
    const me = participants.find((p) => p.id === myId);
    if (!me) return;

    if (wasListenerRef.current && me.role !== 'listener') {
      wasListenerRef.current = false;
      setRole(me.role);
      (async () => {
        const engine = engineRef.current;
        const agora = getAgora();
        if (!engine || !agora) return;
        const t = await rtcToken.mutateAsync(roomId);
        engine.renewToken(t.token);
        engine.setClientRole(agora.ClientRoleType.ClientRoleBroadcaster);
        engine.updateChannelMediaOptions({ publishMicrophoneTrack: true });
        engine.muteLocalAudioStream(true); // promoted while muted, same as an initial join
        setMuted(true);
      })();
    } else if (me.role === 'listener') {
      wasListenerRef.current = true;
    }

    if (me.isMuted && !muted) {
      // RoomParticipant.isMuted mirrors the server's forceMuted flag for everyone but ourselves
      // (see displayParticipants below, which overrides it with local mute state for `myId`).
      setMuted(true);
      engineRef.current?.muteLocalAudioStream(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants, phase, roomId, myId]);

  const toggleMute = useCallback(() => {
    if (role === 'listener') return; // listeners never publish audio
    const engine = engineRef.current;
    if (!engine) return;
    const next = !muted;
    setMuted(next);
    engine.muteLocalAudioStream(next);
  }, [muted, role]);

  const handleClose = useCallback(() => {
    teardown(true);
    onClose();
  }, [teardown, onClose]);

  const displayParticipants: RoomParticipant[] = participants.map((p) =>
    p.id === myId ? { ...p, isMuted: role === 'listener' ? true : muted } : p,
  );
  const speakers = displayParticipants.filter((p) => p.role === 'host' || p.role === 'speaker');
  const listeners = displayParticipants.filter((p) => p.role === 'listener');

  const headerPill = {
    backgroundColor: 'rgba(244,232,205,0.1)',
    borderWidth: 1, borderColor: 'rgba(232,203,143,0.28)',
    paddingHorizontal: 17, paddingVertical: 9, borderRadius: Radii.pill,
  } as const;

  if (!agoraReady) {
    return (
      <View style={{ flex: 1, backgroundColor: c.sheet, paddingTop: insets.top + 12, alignItems: 'center', justifyContent: 'center', gap: 15, paddingHorizontal: 34 }}>
        <GlassCircle icon="x" onPress={onClose} onDeep />
        <Text style={{ fontFamily: Fonts.serif, fontSize: 25, color: c.ink, textAlign: 'center' }}>Study Chat needs the dev build</Text>
        <Text style={{ color: c.ink2, fontSize: 13, fontFamily: Fonts.sansLight, textAlign: 'center', lineHeight: 22 }}>
          Study Chat uses Agora, the same native module as Live video. Install the custom dev build to join.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.sheet }}>
      <LinearGradient colors={[...Deep.chatHeaderStops]} style={{ paddingHorizontal: 20, paddingBottom: 22, paddingTop: insets.top }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, marginBottom: 22 }}>
          <GlassCircle icon="x" onPress={handleClose} onDeep />
          <View style={{ flexDirection: 'row', gap: 9 }}>
            <PressScale to={0.94}>
              <View style={headerPill}>
                <Text style={{ color: '#EEDFBE', fontSize: 11.5, fontFamily: Fonts.sansMed, letterSpacing: 0.6 }}>Share</Text>
              </View>
            </PressScale>
            <PressScale to={0.94}>
              <View style={headerPill}>
                <Text style={{ color: '#EEDFBE', fontSize: 11.5, fontFamily: Fonts.sansMed, letterSpacing: 0.6 }}>+ Invite</Text>
              </View>
            </PressScale>
          </View>
        </View>
        <View style={{ gap: 7 }}>
          <Text style={{ fontFamily: Fonts.serif, fontSize: 26, color: Deep.onDeep, letterSpacing: 0.3 }}>
            {detail?.title ?? 'Bible Study Discussion'}
          </Text>
          <Text style={{ fontSize: 11.5, fontFamily: Fonts.sansLight, color: Deep.onDeepFaint, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            {phase === 'connecting' ? 'Connecting…' : detail?.subtitle ?? 'Understanding the Beatitudes · Matthew 5'}
          </Text>
        </View>
      </LinearGradient>

      {phase === 'error' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 34 }}>
          <Text style={{ fontFamily: Fonts.serif, fontSize: 22, color: c.ink, textAlign: 'center' }}>Couldn't join</Text>
          <Text style={{ color: c.ink2, fontSize: 13, fontFamily: Fonts.sansLight, textAlign: 'center', lineHeight: 22 }}>{error}</Text>
        </View>
      ) : phase === 'ended' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Text style={{ fontFamily: Fonts.serif, fontSize: 22, color: c.ink }}>Room ended</Text>
          <PressScale onPress={onClose} to={0.94}>
            <View style={headerPill}><Text style={{ color: c.gold, fontSize: 12, fontFamily: Fonts.sansMed }}>Back to Home</Text></View>
          </PressScale>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 24 }} showsVerticalScrollIndicator={false}>
          <View style={{ marginBottom: 16 }}>
            <SectionLabel>Speakers · {speakers.length}</SectionLabel>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginBottom: 26 }}>
            {speakers.map((p) => (
              <SpeakerAvatar
                key={p.id}
                participant={p}
                onForceMute={
                  role === 'host' && p.id !== myId && roomId
                    ? () => setForceMuted.mutate({ roomId, userId: p.id, muted: !p.isMuted })
                    : undefined
                }
              />
            ))}
          </View>

          <View
            style={{
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairlineSoft,
              borderRadius: Radii.md, paddingHorizontal: 17, paddingVertical: 14, marginBottom: 26,
            }}
          >
            <Text style={{ color: c.ink3, fontSize: 12, fontFamily: Fonts.sansLight, letterSpacing: 0.3 }}>
              {listeners.length} others listening
            </Text>
            {role === 'listener' && (
              <TouchableOpacity activeOpacity={0.7} onPress={() => roomId && raiseHand.mutate(roomId)} disabled={raiseHand.isPending}>
                <Text style={{ color: c.gold, fontSize: 12, fontFamily: Fonts.sansMed, letterSpacing: 0.4 }}>
                  {participants.find((p) => p.id === myId)?.handRaised ? 'Hand raised ✋' : 'Raise hand'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ marginBottom: 16 }}>
            <SectionLabel>Listeners · {listeners.length}</SectionLabel>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
            {listeners.map((p) => (
              <ListenerAvatar
                key={p.id}
                participant={p}
                onApprove={
                  role === 'host' && roomId
                    ? () => promoteParticipant.mutate({ roomId, userId: p.id })
                    : undefined
                }
              />
            ))}
          </View>
          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      {phase === 'live' && (
        <View
          style={{
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            paddingHorizontal: 22, paddingTop: 15, paddingBottom: insets.bottom + 15,
            borderTopWidth: 1, borderTopColor: c.hairlineSoft,
          }}
        >
          <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
            <Text style={{ color: c.live, fontSize: 12.5, fontFamily: Fonts.sansMed, letterSpacing: 0.5 }}>Leave quietly</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 13 }}>
            {role !== 'listener' && (
              <PressScale onPress={toggleMute} to={0.9}>
                <View
                  style={{
                    width: 46, height: 46, borderRadius: 23,
                    backgroundColor: muted ? 'rgba(224,106,80,0.13)' : c.surface2,
                    borderWidth: 1, borderColor: muted ? 'rgba(224,106,80,0.4)' : c.hairlineSoft,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Icon name={muted ? 'micOff' : 'mic'} size={17} color={muted ? c.live : c.gold} strokeWidth={1.6} />
                </View>
              </PressScale>
            )}
            <PressScale to={0.9}>
              <LinearGradient
                colors={[c.goldBright, c.gold]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="chat" size={17} color={c.onGold} strokeWidth={1.6} />
              </LinearGradient>
            </PressScale>
          </View>
        </View>
      )}
    </View>
  );
}
