import React from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Layout, BorderRadius } from '../../theme';

interface Props {
  icon: string;
  label: string;
  isActive?: boolean;
  onPress: () => void;
}

export function ActionButton({ icon, label, isActive = false, onPress }: Props) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={styles.wrapper}>
      {isActive ? (
        <LinearGradient
          colors={[Colors.gradientRedStart, Colors.gradientRedEnd]}
          style={styles.circle}
        >
          <Text style={styles.icon}>{icon}</Text>
        </LinearGradient>
      ) : (
        <View style={styles.circle}>
          <Text style={styles.icon}>{icon}</Text>
        </View>
      )}
      <Text style={[styles.label, isActive && styles.labelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: 6,
  },
  circle: {
    width: Layout.actionButtonSize,
    height: Layout.actionButtonSize,
    borderRadius: Layout.actionButtonSize / 2,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 32,
  },
  label: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  labelActive: {
    color: Colors.textPrimary,
  },
});
