import React, { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MOCK_ROOM_PARTICIPANTS } from '../services/mockData';
import { useTheme } from '../theme/ThemeContext';
import { Deep, Fonts, Radii } from '../theme/elegant';
import { Icon } from '../components/elegant/Icons';
import { GlassCircle, PressScale, SectionLabel } from '../components/elegant/Kit';
import type { RoomParticipant } from '../types';

interface Props {
  onClose: () => void;
}

function initialsOf(name: string): string {
  const parts = name.replace(/_/g, ' ').split(' ').filter(Boolean);
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 1).toUpperCase();
}

function SpeakerAvatar({ participant }: { participant: RoomParticipant }) {
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

  return (
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
}

function ListenerAvatar({ participant }: { participant: RoomParticipant }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', width: 62, gap: 6 }}>
      <View
        style={{
          width: 54, height: 54, borderRadius: 27,
          backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairlineSoft,
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
    </View>
  );
}

export function StudyChatScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const [isMuted, setIsMuted] = useState(true);
  const participants = MOCK_ROOM_PARTICIPANTS;

  const speakers = participants.filter((p) => p.role === 'host' || p.role === 'speaker');
  const listeners = participants.filter((p) => p.role === 'listener');

  const headerPill = {
    backgroundColor: 'rgba(244,232,205,0.1)',
    borderWidth: 1, borderColor: 'rgba(232,203,143,0.28)',
    paddingHorizontal: 17, paddingVertical: 9, borderRadius: Radii.pill,
  } as const;

  return (
    <View style={{ flex: 1, backgroundColor: c.sheet }}>
      {/* deep gradient header */}
      <LinearGradient colors={[...Deep.chatHeaderStops]} style={{ paddingHorizontal: 20, paddingBottom: 22, paddingTop: insets.top }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, marginBottom: 22 }}>
          <GlassCircle icon="x" onPress={onClose} onDeep />
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
            Bible Study Discussion
          </Text>
          <Text style={{ fontSize: 11.5, fontFamily: Fonts.sansLight, color: Deep.onDeepFaint, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            Understanding the Beatitudes · Matthew 5
          </Text>
        </View>
      </LinearGradient>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 24 }} showsVerticalScrollIndicator={false}>
        <View style={{ marginBottom: 16 }}>
          <SectionLabel>Speakers · {speakers.length}</SectionLabel>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginBottom: 26 }}>
          {speakers.map((p) => <SpeakerAvatar key={p.id} participant={p} />)}
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
          <TouchableOpacity activeOpacity={0.7}>
            <Text style={{ color: c.gold, fontSize: 12, fontFamily: Fonts.sansMed, letterSpacing: 0.4 }}>Raise hand</Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginBottom: 16 }}>
          <SectionLabel>Listeners · {listeners.length}</SectionLabel>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          {listeners.map((p) => <ListenerAvatar key={p.id} participant={p} />)}
        </View>
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* footer */}
      <View
        style={{
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          paddingHorizontal: 22, paddingTop: 15, paddingBottom: insets.bottom + 15,
          borderTopWidth: 1, borderTopColor: c.hairlineSoft,
        }}
      >
        <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
          <Text style={{ color: c.live, fontSize: 12.5, fontFamily: Fonts.sansMed, letterSpacing: 0.5 }}>Leave quietly</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 13 }}>
          <PressScale onPress={() => setIsMuted((m) => !m)} to={0.9}>
            <View
              style={{
                width: 46, height: 46, borderRadius: 23,
                backgroundColor: isMuted ? 'rgba(224,106,80,0.13)' : c.surface2,
                borderWidth: 1, borderColor: isMuted ? 'rgba(224,106,80,0.4)' : c.hairlineSoft,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Icon name={isMuted ? 'micOff' : 'mic'} size={17} color={isMuted ? c.live : c.gold} strokeWidth={1.6} />
            </View>
          </PressScale>
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
    </View>
  );
}
