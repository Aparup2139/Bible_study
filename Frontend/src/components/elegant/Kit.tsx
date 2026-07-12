import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme/ThemeContext';
import { Fonts, Radii } from '../../theme/elegant';
import { Icon, type IconName } from './Icons';

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
  const v = useRef(new Animated.Value(1)).current;
  const springTo = (val: number, fast = false) =>
    Animated.spring(v, { toValue: val, useNativeDriver: true, speed: fast ? 46 : 26, bounciness: fast ? 2 : 7 }).start();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => springTo(to, true)}
      onPressOut={() => springTo(1)}
      hitSlop={6}
    >
      <Animated.View style={[style, { transform: [{ scale: v }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Slow opacity pulse (live dots). */
export function PulseDot({ color, size = 6 }: { color: string; size?: number }) {
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 0.35, duration: 800, useNativeDriver: true }),
        Animated.timing(o, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [o]);
  return (
    <Animated.View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: o }}
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
  const { c } = useTheme();
  const resolvedBg = bg ?? (onDeep ? 'rgba(14,11,7,0.55)' : c.surface2);
  const resolvedBorder = borderColor ?? (onDeep ? 'rgba(232,203,143,0.32)' : c.hairlineSoft);
  const resolvedColor = color ?? (onDeep ? '#E8CB8F' : c.ink2);
  return (
    <PressScale onPress={onPress} to={0.88}>
      <View
        style={{
          width: size, height: size, borderRadius: size / 2,
          backgroundColor: resolvedBg, borderWidth: 1, borderColor: resolvedBorder,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={iconSize} color={resolvedColor} strokeWidth={1.7} />
      </View>
    </PressScale>
  );
}

/** Gold gradient pill button. */
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
  const { c } = useTheme();
  return (
    <PressScale onPress={onPress} disabled={disabled}>
      <LinearGradient
        colors={[c.goldBright, c.gold]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingHorizontal: paddingH, paddingVertical: paddingV,
          borderRadius: Radii.pill, opacity: disabled ? 0.5 : 1,
        }}
      >
        {icon ? <Icon name={icon} size={iconSize} color={c.onGold} strokeWidth={2} /> : null}
        <Text style={{ color: c.onGold, fontSize, fontFamily: Fonts.sansSemi, letterSpacing: 0.8 }}>
          {label}
        </Text>
      </LinearGradient>
    </PressScale>
  );
}

/** LIVE badge — red pulse dot + tracked-out label. */
export function LiveBadge({ onDeep = false, small = false }: { onDeep?: boolean; small?: boolean }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: small ? 5 : 7,
        backgroundColor: onDeep ? 'rgba(14,11,7,0.55)' : c.goldSoft,
        borderWidth: 1, borderColor: onDeep ? 'rgba(232,203,143,0.32)' : c.hairline,
        paddingHorizontal: small ? 9 : 11, paddingVertical: small ? 4 : 5,
        borderRadius: Radii.pill, alignSelf: 'flex-start',
      }}
    >
      <PulseDot color={onDeep ? '#E06A50' : c.live} size={small ? 5 : 6} />
      <Text
        style={{
          color: onDeep ? '#EEDFBE' : c.gold,
          fontSize: small ? 8 : 9.5, fontFamily: Fonts.sansSemi, letterSpacing: 2.2,
        }}
      >
        LIVE
      </Text>
    </View>
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
  const { c } = useTheme();
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: bg ?? c.goldSoft, borderWidth: 1, borderColor: border ?? c.hairline,
        alignItems: 'center', justifyContent: 'center',
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
  const { c } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 11,
        backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairlineSoft,
        borderRadius: Radii.pill, paddingHorizontal: 20, height: 52,
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
