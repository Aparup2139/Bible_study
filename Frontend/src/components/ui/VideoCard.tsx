import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PressScale } from '../elegant/Kit';
import { Colors, Typography, BorderRadius, Spacing } from '../../theme';
import type { LiveStream } from '../../types';

interface Props {
  stream: LiveStream;
  onPress: (stream: LiveStream) => void;
}

function formatViewerCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K watching`;
  return `${n} watching`;
}

export function VideoCard({ stream, onPress }: Props) {
  return (
    <PressScale
      style={styles.card}
      onPress={() => onPress(stream)}
    >
      <LinearGradient
        colors={[Colors.gradientRedStart, Colors.gradientRedEnd]}
        style={styles.thumbnail}
      >
        <Text style={styles.emoji}>{stream.thumbnailEmoji}</Text>
        <View style={styles.playIcon}>
          <Text style={styles.playText}>▶</Text>
        </View>
      </LinearGradient>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{stream.title}</Text>
        <Text style={styles.meta}>{formatViewerCount(stream.viewerCount)}</Text>
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 48,
  },
  playIcon: {
    position: 'absolute',
    width: 50,
    height: 50,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playText: {
    fontSize: 18,
    color: '#000',
    marginLeft: 3,
  },
  info: {
    padding: Spacing.md,
  },
  title: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  meta: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
  },
});
