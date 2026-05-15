import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LiveBadge } from './ui/LiveBadge';
import { Colors, Typography, Spacing } from '../theme';

const { width } = Dimensions.get('window');
const PLAYER_HEIGHT = width * (9 / 16);

interface Props {
  onMenuPress: () => void;
  viewerCount?: number;
}

export function VideoPlayer({ onMenuPress, viewerCount = 1248 }: Props) {
  const translateY = useRef(new Animated.Value(-10)).current;
  const opacity = useRef(new Animated.Value(0.8)).current;

  // Floating scene icon animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(translateY, { toValue: 0, duration: 1500, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 1500, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(translateY, { toValue: -10, duration: 1500, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.8, duration: 1500, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, [translateY, opacity]);

  const formattedCount = viewerCount >= 1000
    ? `${(viewerCount / 1000).toFixed(1)}K`
    : `${viewerCount}`;

  return (
    <View style={[styles.container, { height: PLAYER_HEIGHT }]}>
      {/* Background gradient */}
      <LinearGradient
        colors={[Colors.gradientRedStart, Colors.gradientRedEnd]}
        style={StyleSheet.absoluteFill}
      />

      {/* Animated scene content */}
      <View style={styles.sceneContent}>
        <Animated.Text style={[styles.sceneIcon, { transform: [{ translateY }], opacity }]}>
          🙏
        </Animated.Text>
        <Text style={styles.sceneTitle}>Sunday Worship</Text>
        <Text style={styles.sceneSubtitle}>Live from our congregation</Text>
      </View>

      {/* Top overlay */}
      <LinearGradient
        colors={['rgba(0,0,0,0.7)', 'transparent']}
        style={styles.topOverlay}
      >
        <View style={styles.topLeft}>
          <Text style={styles.appTitle}>Motion Video</Text>
          <LiveBadge />
        </View>
        <TouchableOpacity onPress={onMenuPress} style={styles.menuBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
        </TouchableOpacity>
      </LinearGradient>

      {/* Bottom overlay — viewer count */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.5)']}
        style={styles.bottomOverlay}
      >
        <View style={styles.viewerBadge}>
          <Text style={styles.viewerText}>👁️  {formattedCount} watching</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  sceneContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  sceneIcon: {
    fontSize: 80,
  },
  sceneTitle: {
    fontSize: Typography['3xl'],
    fontWeight: Typography.bold,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 6,
  },
  sceneSubtitle: {
    fontSize: Typography.md,
    color: 'rgba(255,255,255,0.9)',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: Spacing.base,
    paddingTop: Spacing.base,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  topLeft: {
    gap: 8,
  },
  appTitle: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
  menuBtn: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    gap: 5,
  },
  menuLine: {
    width: '100%',
    height: 3,
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.base,
    paddingTop: 30,
  },
  viewerBadge: {
    backgroundColor: Colors.overlayDark,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  viewerText: {
    color: '#fff',
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
});
