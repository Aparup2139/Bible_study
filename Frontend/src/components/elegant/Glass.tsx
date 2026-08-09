import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

/**
 * Frosted-glass container: caller provides translucent bg/border/radius via
 * `style`; Glass injects the backdrop blur beneath. Use ONLY over
 * video/imagery/deep gradients where blur is visible.
 */
export function Glass({
  children, style, intensity = 24, tint = 'dark',
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  tint?: 'dark' | 'light';
}) {
  return (
    <View style={[style, styles.clip]}>
      <BlurView
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        intensity={intensity}
        tint={tint}
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
      />
      {children}
    </View>
  );
}

// overflow:'hidden' is required so the blur respects the caller's borderRadius.
const styles = StyleSheet.create({ clip: { overflow: 'hidden' } });
