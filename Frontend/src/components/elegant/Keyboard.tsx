import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Uniform breathing room between the keyboard and any input it pushes up. */
export const KEYBOARD_GAP = 12;

/**
 * Wraps bottom input rows (chat composers, comment bars).
 * Tracks the software keyboard frame-by-frame via Reanimated's
 * useAnimatedKeyboard, so the row rides the keyboard without the
 * KeyboardAvoidingView offset guesswork. When the keyboard is closed,
 * the safe-area bottom inset is used instead.
 */
export function StickyInputBar({
  children, style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const keyboard = useAnimatedKeyboard();
  const insets = useSafeAreaInsets();
  const animatedStyle = useAnimatedStyle(() => ({
    paddingBottom: Math.max(insets.bottom, keyboard.height.value + KEYBOARD_GAP),
  }));
  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

/**
 * Scrollable form that always leaves room to scroll the focused field
 * clear of the keyboard (Auth, EditProfile, stream/upload title setup).
 * Bottom padding animates with the keyboard height, so no field can be
 * trapped underneath it.
 */
export function KeyboardAwareForm({
  children, style, contentContainerStyle,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const keyboard = useAnimatedKeyboard();
  // Reanimated does not support animated styles on contentContainerStyle,
  // so the animated bottom padding lives in a trailing spacer view instead.
  const spacerStyle = useAnimatedStyle(() => ({
    height: keyboard.height.value + KEYBOARD_GAP + 24,
  }));
  return (
    <Animated.ScrollView
      style={style}
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets={false}
      showsVerticalScrollIndicator={false}
    >
      {children}
      <Animated.View style={spacerStyle} />
    </Animated.ScrollView>
  );
}
