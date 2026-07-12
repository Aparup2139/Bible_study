import React from 'react';
import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme/ThemeContext';
import { DefaultThumbGradient, Fonts, Radii, ThumbGradients } from '../../theme/elegant';
import { Icon, type IconName } from './Icons';
import { PressScale, PulseDot } from './Kit';
import type { LiveStream } from '../../types';

const EMOJI_ICON: Record<string, IconName> = {
  '🎵': 'music',
  '⛪': 'church',
  '📖': 'book',
  '🙌': 'star',
  '🎙️': 'mic',
};

function formatViewers(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`;
}

interface Props {
  stream: LiveStream;
  onPress: (stream: LiveStream) => void;
}

/** Streaming Now card — deep gradient thumb, gold emblem, glass chips. */
export function VideoCard({ stream, onPress }: Props) {
  const { c } = useTheme();
  const grad = ThumbGradients[stream.thumbnailEmoji] ?? DefaultThumbGradient;
  const icon = EMOJI_ICON[stream.thumbnailEmoji] ?? 'book';

  return (
    <PressScale onPress={() => onPress(stream)} to={0.97}>
      <View
        style={{
          backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairlineSoft,
          borderRadius: Radii.xl, overflow: 'hidden',
        }}
      >
        <LinearGradient colors={[...grad]} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={{ height: 112, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={30} color="#E8CB8F" strokeWidth={1.4} />
          <View
            style={{
              position: 'absolute', top: 9, left: 9,
              flexDirection: 'row', alignItems: 'center', gap: 5,
              backgroundColor: 'rgba(12,9,6,0.62)',
              borderWidth: 1, borderColor: 'rgba(232,203,143,0.22)',
              paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
            }}
          >
            <PulseDot color="#E06A50" size={4.5} />
            <Text style={{ color: '#EEDFBE', fontSize: 7.5, fontFamily: Fonts.sansSemi, letterSpacing: 1.8 }}>LIVE</Text>
          </View>
          <View
            style={{
              position: 'absolute', bottom: 9, right: 9,
              width: 30, height: 30, borderRadius: 15,
              backgroundColor: 'rgba(12,9,6,0.58)',
              borderWidth: 1, borderColor: 'rgba(232,203,143,0.3)',
              alignItems: 'center', justifyContent: 'center', paddingLeft: 2,
            }}
          >
            <Icon name="play" size={11} color="#E8CB8F" />
          </View>
        </LinearGradient>
        <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 13, gap: 5 }}>
          <Text numberOfLines={1} style={{ fontSize: 13.5, fontFamily: Fonts.sansMed, color: c.ink, letterSpacing: 0.2 }}>
            {stream.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Icon name="eye" size={11} color={c.ink3} strokeWidth={1.6} />
            <Text numberOfLines={1} style={{ fontSize: 11, color: c.ink3, fontFamily: Fonts.sansLight, flex: 1 }}>
              {stream.hostName} · {formatViewers(stream.viewerCount)}
            </Text>
          </View>
        </View>
      </View>
    </PressScale>
  );
}
