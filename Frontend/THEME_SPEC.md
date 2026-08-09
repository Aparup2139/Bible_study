# BibleWay Rose-Dawn Theme — Implementation Spec (SINGLE SOURCE OF TRUTH)

Every sub-agent MUST follow this spec exactly. Uniformity is the top priority: same token → same hex everywhere. Never invent a color. If a color you encounter isn't in the mapping, choose the nearest spec token and note it in your final report.

## Design concept
Black/silver/white structure + "rose light of hope" accent family. Silver = structure (frames, chrome, secondary text). Rose = life (LIVE indicators, CTAs, glows, speaker names, primary action fills). Muted red-rose for live/errors. Glass surfaces with 3-D elevation.

## 1. Palette — src/theme/elegant.ts (EXACT values)

```ts
export interface Palette {
  canvas: string; bg: string; sheet: string;
  surface: string; surface2: string;
  hairline: string; hairlineSoft: string;
  gold: string; goldBright: string; goldDeep: string; goldSoft: string; onGold: string;   // KEEP KEY NAMES (silver values now) — 40+ call sites depend on them
  hope: string; hopeBright: string; hopeSoft: string; hopeBorder: string; hopeBorderSoft: string; onHope: string;  // NEW rose family
  ink: string; ink2: string; ink3: string;
  live: string; input: string; grabber: string;
}

dark: {
  canvas: '#080707', bg: '#100E0D', sheet: 'rgba(19,17,16,0.92)',
  surface: 'rgba(255,255,255,0.07)', surface2: 'rgba(255,255,255,0.12)',
  hairline: 'rgba(206,207,212,0.30)', hairlineSoft: 'rgba(206,207,212,0.16)',
  gold: '#D3D5DA', goldBright: '#F3F4F7', goldDeep: '#999BA1', goldSoft: 'rgba(211,213,218,0.13)', onGold: '#121011',
  hope: '#EDB4AA', hopeBright: '#F8DDD6', hopeSoft: 'rgba(235,178,168,0.18)',
  hopeBorder: 'rgba(242,199,190,0.42)', hopeBorderSoft: 'rgba(242,199,190,0.26)', onHope: '#2A1512',
  ink: '#F7F6F6', ink2: '#C9CACE', ink3: '#93949A',
  live: '#E67260', input: 'rgba(255,255,255,0.09)', grabber: 'rgba(255,255,255,0.22)',
},
light: {
  canvas: '#F5F1EC', bg: '#FDFAF7', sheet: 'rgba(254,252,250,0.94)',
  surface: 'rgba(255,255,255,0.5)', surface2: 'rgba(255,255,255,0.8)',
  hairline: 'rgba(110,102,100,0.24)', hairlineSoft: 'rgba(110,102,100,0.12)',
  gold: '#6F6F75', goldBright: '#9A9AA0', goldDeep: '#4A4A50', goldSoft: 'rgba(111,111,117,0.12)', onGold: '#FDFAF7',
  hope: '#A6635A', hopeBright: '#C78D82', hopeSoft: 'rgba(166,99,90,0.14)',
  hopeBorder: 'rgba(166,99,90,0.36)', hopeBorderSoft: 'rgba(166,99,90,0.22)', onHope: '#FDF6F3',
  ink: '#211F1F', ink2: '#5E5B5B', ink3: '#969092',
  live: '#B44A3C', input: 'rgba(255,255,255,0.78)', grabber: 'rgba(48,45,44,0.2)',
}
```

## 2. Deep (video/hero constant tones) — same file

```ts
export const Deep = {
  heroStops: ['#0D0C0C', '#171415', '#281C1A', '#432C26'] as const,
  heroLocations: [0, 0.44, 0.74, 1] as const,
  chatHeaderStops: ['#100E0D', '#1A1615', '#2E201C'] as const,
  bannerStops: ['#100E0D', '#1A1615', '#3A2620'] as const,
  onDeep: '#F6F4F3',
  onDeepSoft: 'rgba(243,241,240,0.72)',
  onDeepFaint: 'rgba(243,241,240,0.68)',
  goldOnDeep: '#F8DDD6',                       // rose light on deep surfaces (keep export name)
  chipOnDeep: 'rgba(17,14,14,0.32)',
  chipBorderOnDeep: 'rgba(242,199,190,0.30)',
  liveOnDeep: '#E67260',
  glow: 'rgba(244,196,186,0.32)',              // NEW: dawn glow (VideoHero halo)
};

export const ThumbGradients: Record<string, readonly [string, string, string]> = {
  '🎵': ['#151313', '#211A1A', '#3F2822'],
  '⛪': ['#100F0F', '#1F1817', '#452C25'],
  '📖': ['#131211', '#221B1A', '#3A251D'],
  '🙌': ['#111010', '#1D1716', '#4A2F23'],
};
```

## 3. Glass / 3-D elevation — add to elegant.ts, use EVERYWHERE a card/tile/panel exists

```ts
/** 3-D glass elevation. Spread into style objects; do not re-declare per screen. */
export const Elev = {
  // Cards, tiles, chat panels, search bars (on-palette surfaces)
  card: {
    shadowColor: '#000000', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  // Hero / large panels
  hero: {
    shadowColor: '#000000', shadowOpacity: 0.55, shadowRadius: 22, shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  // Small floating chips/buttons (send, glass circles)
  chip: {
    shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  // Light-mode variants: same geometry, softer warm shadow
  cardLight: {
    shadowColor: '#604038', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  heroLight: {
    shadowColor: '#604038', shadowOpacity: 0.2, shadowRadius: 22, shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  chipLight: {
    shadowColor: '#604038', shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
} as const;
```

Helper on theme (`useTheme()` returns `{ c, isDark, toggle, elev }` where `elev = isDark ? {card:Elev.card,hero:Elev.hero,chip:Elev.chip} : {card:Elev.cardLight,...}`) — Agent A implements in ThemeContext; all agents then use `elev.card` etc. Surfaces that get elevation MUST also have `borderWidth: 1, borderColor: c.hairlineSoft` (or hopeBorderSoft for rose elements) and `backgroundColor: c.surface`/`surface2` — translucent fill + hairline + shadow = the glass look. Do NOT add expo-blur (no new deps).

## 4. Hardcoded color mapping (old → new). Apply case-insensitively, preserve alpha unless listed.

| Old | New |
|---|---|
| `#C9A257` | `#D3D5DA` |
| `#E8CB8F` | `#F8DDD6` |
| `#EEDFBE` | `#F8DDD6` |
| `#F5EFDF`, `#F2EADA` | `#F6F4F3` |
| `rgba(232,203,143,X)` | `rgba(242,199,190,X)` |
| `rgba(201,162,87,X)` | `rgba(235,178,168,X)` |
| `rgba(244,232,205,X)` | `rgba(255,255,255,X)` |
| `rgba(242,234,218,X)` | `rgba(243,241,240,X)` |
| `rgba(12,9,6,0.55)`, `rgba(14,11,7,0.55)` | `rgba(17,14,14,0.32)` |
| `rgba(12,9,6,0.58)`, `rgba(14,11,7,0.58)` | `rgba(17,14,14,0.34)` |
| `rgba(12,9,6,0.62)`, `rgba(14,11,7,0.6)`, `rgba(14,11,7,0.62)` | `rgba(17,14,14,0.36)` |
| `#0A0806` | `#100E0D` |
| `rgba(5,4,2,0.5)` | `rgba(6,5,5,0.5)` |
| `#E06A50` | `#E67260` |
| `rgba(224,106,80,X)` | `rgba(230,114,96,X)` |
| legacy `#9500ff` | `#D3D5DA` |
| legacy `#4400cc` | `#999BA1` |
| legacy `#a844ff` | `#F3F4F7` |
| legacy `#cc0000` (gradientRedEnd) | `#3A2620` |
| legacy `#ff0000` (actionActive) | `#E67260` |

PREFER palette tokens over literals: if the component has `useTheme()` in scope, use `c.hope`, `c.hopeBorder`, `Deep.goldOnDeep`, etc. instead of pasting hex. Hex literals are acceptable only in `elegant.ts`/`colors.ts` and where Deep/on-video constants are intentionally theme-independent.

## 5. Where ROSE (hope) goes vs SILVER — uniform rules

ROSE (`hope*` tokens / Deep.goldOnDeep / chipBorderOnDeep): LIVE badges & pills, PulseDot color, viewer-count chips on video, primary CTA fills+borders (Join/Go Live/Send/Save), icon+text on deep video surfaces, avatar ring + its glow, speaker/usernames in chat, active states.
SILVER (`gold*` tokens): default Icon color, spinners/ActivityIndicator, secondary buttons, borders of neutral panels, section accents, theme-toggle, inactive states.
STRUCTURE: backgrounds/sheets/surfaces/hairlines/ink per palette. LIVE/error semantics: `live` token; error borders `rgba(230,114,96,X)`.

## 6. Motion (uniformity rules)

- `PressScale` (Kit.tsx) becomes THE universal touchable: port to Reanimated (`useSharedValue` + `withSpring`, damping 15 stiffness 250 for press-in to 0.93–0.96, press-out spring damping 12 stiffness 180). Replace EVERY `TouchableOpacity` in owned files with `PressScale` (keep onPress/disabled/style semantics; if a TouchableOpacity has activeOpacity/complex props, preserve behavior). Do not import reanimated in screens for this — it lives inside PressScale.
- `PulseDot`: port to Reanimated `withRepeat(withTiming)` 800ms each way, opacity 1↔0.35. Color: `c.live` (or Deep.liveOnDeep on video).
- Entrance animations are OUT OF SCOPE for this pass (do not add) — keep the diff focused.

## 7. Keyboard system (uniformity CRITICAL)

New file `src/components/elegant/Keyboard.tsx` (Agent A creates; others consume):

```ts
export const KEYBOARD_GAP = 12;
```

- `<StickyInputBar style?>{children}</StickyInputBar>` — wraps bottom input rows. Uses `useAnimatedKeyboard()` from react-native-reanimated + `useSafeAreaInsets()`. Animated style: `paddingBottom = Math.max(insets.bottom, keyboard.height.value + KEYBOARD_GAP)`. Children render inside an `Animated.View`.
- `<KeyboardAwareForm contentContainerStyle? style?>{children}</KeyboardAwareForm>` — Reanimated-animated ScrollView wrapper: `keyboardShouldPersistTaps="handled"`, animated `paddingBottom = keyboard.height.value + KEYBOARD_GAP + 24`, and `automaticallyAdjustKeyboardInsets={false}`. This guarantees the focused field can always be scrolled clear of the keyboard with uniform breathing room.
- Screens: DELETE every `KeyboardAvoidingView` + `keyboardVerticalOffset` and replace:
  - Bottom composers (Ask composer bar, StudyChat input, LiveChat input row, Podcast comment bar) → wrap the input row in `StickyInputBar`.
  - Scrollable forms (Auth, EditProfile, LiveStream title setup, UploadVideo title) → outer scroll becomes `KeyboardAwareForm`.
- `app.json`: add `"softwareKeyboardLayoutMode": "resize"` under `android`.

## 8. General rules

- MINIMAL DIFFS: only touch colors, touchables, keyboard handling, elevation. No refactors, no renames (Palette keys keep `gold*` names), no formatting churn, keep comments unless they lie about color (update "black & gold" style comments to "black & rose-dawn silver").
- Custom fonts: NEVER combine fontFamily (Cormorant/Outfit) with fontWeight (breaks Android) — existing rule, preserve it.
- All files live under /tmp/bw. Edit in place.
- Report at the end: files changed, anything ambiguous you decided, anything you could NOT map.
