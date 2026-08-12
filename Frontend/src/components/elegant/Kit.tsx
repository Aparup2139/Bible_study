import React, { useEffect } from 'react';
import { Pressable, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme/ThemeContext';
import { Deep, Fonts, Radii } from '../../theme/elegant';
import { Icon, type IconName } from './Icons';
import { Glass } from './Glass';

/** Springy press feedback — the app's universal touch response. */
export function PressScale({
  onPress, children, style, disabled, to = 0.93,
}: {
  onPress?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  to?: number;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(to, { damping: 15, stiffness: 250 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 12, stiffness: 180 }); }}
      hitSlop={6}
    >
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Slow opacity pulse (live dots). */
export function PulseDot({ color, size = 6 }: { color: string; size?: number }) {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withTiming(0.35, { duration: 800 }), -1, true);
    return () => cancelAnimation(o);
  }, [o]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, animatedStyle]}
    />
  );
}

/** Round glass button (close, back, search, theme toggle…). */
export function GlassCircle({
  icon, onPress, size = 38, iconSize = 15, color, borderColor, bg, onDeep = false,
}: {
  icon: IconName;
  onPress?: () => void;
  size?: number;
  iconSize?: number;
  color?: string;
  borderColor?: string;
  bg?: string;
  onDeep?: boolean;
}) {
  const { c, elev } = useTheme();
  const resolvedBg = bg ?? (onDeep ? Deep.chipOnDeep : c.surface2);
  const resolvedBorder = borderColor ?? (onDeep ? Deep.chipBorderOnDeep : c.hairlineSoft);
  const resolvedColor = color ?? (onDeep ? Deep.goldOnDeep : c.ink2);
  const circle: ViewStyle = {
    width: size, height: size, borderRadius: size / 2,
    backgroundColor: resolvedBg, borderWidth: 1, borderColor: resolvedBorder,
    alignItems: 'center', justifyContent: 'center',
  };
  // onDeep circles float over video/deep gradients → real backdrop blur.
  // Shadow lives on the outer wrapper so Glass's overflow:'hidden' can't clip it.
  return (
    <PressScale onPress={onPress} to={0.88}>
      {onDeep ? (
        <View style={{ borderRadius: size / 2, ...elev.chip }}>
          <Glass intensity={22} style={circle}>
            <Icon name={icon} size={iconSize} color={resolvedColor} strokeWidth={1.7} />
          </Glass>
        </View>
      ) : (
        <View style={{ ...circle, ...elev.chip }}>
          <Icon name={icon} size={iconSize} color={resolvedColor} strokeWidth={1.7} />
        </View>
      )}
    </PressScale>
  );
}

/** Rose gradient pill button — the app's primary CTA (export name kept for call sites). */
export function GoldPill({
  label, onPress, icon, iconSize = 11, paddingH = 15, paddingV = 9, fontSize = 11, disabled,
}: {
  label: string;
  onPress?: () => void;
  icon?: IconName;
  iconSize?: number;
  paddingH?: number;
  paddingV?: number;
  fontSize?: number;
  disabled?: boolean;
}) {
  const { c, elev } = useTheme();
  return (
    <PressScale onPress={onPress} disabled={disabled}>
      <LinearGradient
        colors={[c.hopeBright, c.hope]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingHorizontal: paddingH, paddingVertical: paddingV,
          borderWidth: 1, borderColor: c.hopeBorder,
          borderRadius: Radii.pill, opacity: disabled ? 0.5 : 1,
          ...elev.chip,
        }}
      >
        {icon ? <Icon name={icon} size={iconSize} color={c.onHope} strokeWidth={2} /> : null}
        <Text style={{ color: c.onHope, fontSize, fontFamily: Fonts.sansSemi, letterSpacing: 0.8 }}>
          {label}
        </Text>
      </LinearGradient>
    </PressScale>
  );
}

/** LIVE badge — rose pulse dot + tracked-out label. */
export function LiveBadge({ onDeep = false, small = false }: { onDeep?: boolean; small?: boolean }) {
  const { c, elev } = useTheme();
  const pill: ViewStyle = {
    flexDirection: 'row', alignItems: 'center', gap: small ? 5 : 7,
    backgroundColor: onDeep ? Deep.chipOnDeep : c.hopeSoft,
    borderWidth: 1, borderColor: onDeep ? Deep.chipBorderOnDeep : c.hopeBorder,
    paddingHorizontal: small ? 9 : 11, paddingVertical: small ? 4 : 5,
    borderRadius: Radii.pill, alignSelf: 'flex-start',
  };
  const inner = (
    <>
      <PulseDot color={onDeep ? Deep.liveOnDeep : c.live} size={small ? 5 : 6} />
      <Text
        style={{
          color: onDeep ? Deep.goldOnDeep : c.hope,
          fontSize: small ? 8 : 9.5, fontFamily: Fonts.sansSemi, letterSpacing: 2.2,
        }}
      >
        LIVE
      </Text>
    </>
  );
  // onDeep badges overlay video → backdrop blur; shadow on outer wrapper.
  return onDeep ? (
    <View style={{ borderRadius: Radii.pill, alignSelf: 'flex-start', ...elev.chip }}>
      <Glass intensity={20} style={pill}>{inner}</Glass>
    </View>
  ) : (
    <View style={{ ...pill, ...elev.chip }}>{inner}</View>
  );
}

/** Small-caps section label. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <Text style={{ fontSize: 9.5, fontFamily: Fonts.sansSemi, color: c.ink3, letterSpacing: 2.4, textTransform: 'uppercase' }}>
      {children}
    </Text>
  );
}

/** Serif heading. */
export function SerifTitle({ children, size = 19, color }: { children: React.ReactNode; size?: number; color?: string }) {
  const { c } = useTheme();
  return (
    <Text style={{ fontFamily: Fonts.serif, fontSize: size, color: color ?? c.ink, letterSpacing: 0.4 }}>
      {children}
    </Text>
  );
}

/** Serif-initial medallion (avatars, categories, channels). */
export function Medallion({ initial, size = 50, color, bg, border }: {
  initial: string; size?: number; color?: string; bg?: string; border?: string;
}) {
  const { c, elev } = useTheme();
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: bg ?? c.goldSoft, borderWidth: 1, borderColor: border ?? c.hairline,
        alignItems: 'center', justifyContent: 'center',
        ...elev.chip,
      }}
    >
      <Text style={{ fontFamily: Fonts.serif, fontSize: size * 0.38, color: color ?? c.gold }}>{initial}</Text>
    </View>
  );
}

/** Elegant search field. */
export function SearchBar({ value, onChangeText, placeholder = 'Search videos, users, topics…' }: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
}) {
  const { c, elev } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 11,
        backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairlineSoft,
        borderRadius: Radii.pill, paddingHorizontal: 20, height: 52,
        ...elev.card,
      }}
    >
      <Icon name="search" size={16} color={c.gold} strokeWidth={1.6} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.ink3}
        style={{ flex: 1, color: c.ink, fontSize: 14, fontFamily: Fonts.sansLight, letterSpacing: 0.2, padding: 0 }}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
      />
    </View>
  );
}
