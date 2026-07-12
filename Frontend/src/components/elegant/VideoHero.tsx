import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';
import { Deep, Fonts } from '../../theme/elegant';
import { Icon } from './Icons';
import { GlassCircle, LiveBadge, PressScale } from './Kit';

const { width } = Dimensions.get('window');
const HERO_HEIGHT = 264;

interface Props {
  onAvatarPress: () => void;
  initial?: string;
  viewerCount?: number;
}

/**
 * The live-video hero. Deep "cathedral dusk" tones in BOTH themes — video is
 * dark content — with glass overlays, a floating gold emblem, wordmark,
 * theme toggle and avatar. Drop-in replacement for the old VideoPlayer.
 */
export function VideoHero({ onAvatarPress, initial = '?', viewerCount = 1248 }: Props) {
  const { c, isDark, toggle } = useTheme();
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float]);

  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [4, -6] });
  const formatted = viewerCount >= 1000 ? `${(viewerCount / 1000).toFixed(1)}K` : `${viewerCount}`;

  return (
    <View style={{ width: '100%', height: HERO_HEIGHT, overflow: 'hidden' }}>
      {/* deep gradient + gold candle-glow */}
      <LinearGradient
        colors={[...Deep.heroStops]}
        locations={[...Deep.heroLocations]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <Svg width={width} height={HERO_HEIGHT} style={{ position: 'absolute' }}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="112%" rx="62%" ry="95%">
            <Stop offset="0" stopColor="#C9A257" stopOpacity={0.5} />
            <Stop offset="1" stopColor="#C9A257" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={HERO_HEIGHT} fill="url(#glow)" />
      </Svg>

      {/* centered scene */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 18 }}>
        <Animated.View
          style={{
            transform: [{ translateY }],
            width: 76, height: 76, borderRadius: 38,
            borderWidth: 1, borderColor: 'rgba(232,203,143,0.4)',
            backgroundColor: 'rgba(201,162,87,0.14)',
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#C9A257', shadowOpacity: 0.5, shadowRadius: 22, shadowOffset: { width: 0, height: 0 },
          }}
        >
          <Icon name="book" size={34} color={Deep.goldOnDeep} strokeWidth={1.4} />
        </Animated.View>
        <Text style={{ fontFamily: Fonts.serif, fontSize: 31, color: Deep.onDeep, letterSpacing: 0.4 }}>
          Sunday Worship
        </Text>
        <Text style={{ fontFamily: Fonts.sansLight, fontSize: 11.5, color: Deep.onDeepSoft, letterSpacing: 1.4, textTransform: 'uppercase' }}>
          Live from our congregation
        </Text>
      </View>

      {/* top glass bar */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 18, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ gap: 9, alignItems: 'flex-start' }}>
          <Text style={{ fontFamily: Fonts.serif, fontSize: 24, color: Deep.onDeep, letterSpacing: 0.6 }}>
            BibleWay
          </Text>
          <LiveBadge onDeep />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <GlassCircle icon={isDark ? 'sun' : 'moon'} onPress={toggle} onDeep iconSize={17} />
          <PressScale onPress={onAvatarPress} to={0.88}>
            <View
              style={{
                width: 38, height: 38, borderRadius: 19,
                backgroundColor: 'rgba(14,11,7,0.55)',
                borderWidth: 1, borderColor: 'rgba(232,203,143,0.5)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ fontFamily: Fonts.serif, color: Deep.goldOnDeep, fontSize: 17 }}>{initial}</Text>
            </View>
          </PressScale>
        </View>
      </View>

      {/* bottom watching pill */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 18, flexDirection: 'row' }}>
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 7,
            backgroundColor: 'rgba(14,11,7,0.58)',
            borderWidth: 1, borderColor: 'rgba(232,203,143,0.24)',
            paddingHorizontal: 13, paddingVertical: 6, borderRadius: 999,
          }}
        >
          <Icon name="eye" size={13} color={Deep.goldOnDeep} strokeWidth={1.6} />
          <Text style={{ color: '#EEDFBE', fontSize: 11, fontFamily: Fonts.sansMed, letterSpacing: 0.6 }}>
            {formatted} watching
          </Text>
        </View>
      </View>
    </View>
  );
}
