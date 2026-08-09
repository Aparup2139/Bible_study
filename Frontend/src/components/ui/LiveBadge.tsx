import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Colors, Typography } from '../../theme';

interface Props {
  size?: 'sm' | 'md';
}

export function LiveBadge({ size = 'md' }: Props) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.4, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
      ])
    ).start();
  }, [opacity]);

  const isSmall = size === 'sm';

  return (
    <View style={[styles.badge, isSmall && styles.badgeSm]}>
      <Animated.View style={[styles.dot, isSmall && styles.dotSm, { opacity }]} />
      <Text style={[styles.text, isSmall && styles.textSm]}>LIVE</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.live,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeSm: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  dotSm: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    color: '#fff',
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    letterSpacing: 0.5,
  },
  textSm: {
    fontSize: Typography.xs,
  },
});
