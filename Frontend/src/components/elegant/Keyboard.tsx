import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  ScrollView,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Uniform breathing room between the keyboard and any input it pushes up. */
export const KEYBOARD_GAP = 48;

/**
 * Software keyboard height in px (0 when hidden), via RN core Keyboard events.
 * Replaces Reanimated's useAnimatedKeyboard, which reports 0 on Android under
 * SDK 54's enforced edge-to-edge.
 */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    // iOS "will" events fire ahead of the animation; Android only has "did".
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/**
 * Wraps bottom input rows (chat composers, comment bars) so they sit above
 * the software keyboard. When the keyboard is closed, the safe-area bottom
 * inset is used instead.
 */
// ponytail: padding snaps rather than animating with the keyboard; wire an
// Animated.timing on the height if the jump ever bothers anyone.
export function StickyInputBar({
  children, style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const keyboardHeight = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  // Measured on device: under Expo SDK 54's app-wide edge-to-edge the window
  // does NOT shrink when the keyboard opens (win stayed == scr, and the layout
  // did not move), so SOFT_INPUT_ADJUST_RESIZE is a no-op here. Both platforms
  // therefore have to do the lifting themselves.
  const lift = keyboardHeight;
  // GAP is added on top, not max'd against the inset — otherwise any value
  // below insets.bottom (~24-48px on Android) silently does nothing.
  const paddingBottom = Math.max(insets.bottom, lift) + KEYBOARD_GAP;
  return <View style={[style, { paddingBottom }]}>{children}</View>;
}

/**
 * Scrollable form that always leaves room to scroll the focused field
 * clear of the keyboard (Auth, EditProfile, stream/upload title setup).
 * A trailing spacer grows with the keyboard, so no field can be trapped
 * underneath it.
 */
export function KeyboardAwareForm({
  children, style, contentContainerStyle,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const keyboardHeight = useKeyboardHeight();
  const scrollRef = useRef<ScrollView>(null);
  const offsetY = useRef(0);

  // Android: enforced edge-to-edge means the window never resizes under the
  // keyboard, so nothing built-in scrolls the focused field clear — do it here.
  useEffect(() => {
    if (Platform.OS !== 'android' || keyboardHeight === 0) return;
    const input = TextInput.State.currentlyFocusedInput();
    if (!input) return;
    input.measureInWindow((_x, y, _w, h) => {
      const keyboardTop = Dimensions.get('window').height - keyboardHeight;
      const overlap = y + h + KEYBOARD_GAP - keyboardTop;
      if (overlap > 0) scrollRef.current?.scrollTo({ y: offsetY.current + overlap, animated: true });
    });
  }, [keyboardHeight]);

  return (
    <ScrollView
      ref={scrollRef}
      style={style}
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
      // iOS: the system insets the scroll view and scrolls the focused field clear.
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      onScroll={(e) => { offsetY.current = e.nativeEvent.contentOffset.y; }}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
    >
      {children}
      {/* Android needs the spacer to make room to scroll bottom fields up;
          iOS already gets it from the automatic keyboard insets. */}
      <View style={{ height: (Platform.OS === 'android' ? keyboardHeight : 0) + KEYBOARD_GAP + 24 }} />
    </ScrollView>
  );
}
