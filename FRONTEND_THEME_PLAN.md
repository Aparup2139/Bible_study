# Frontend Re-theme Plan — Black / Dawn-Silver / White

**Goal:** Replace the current black + orange/gold ("elegant gold") look with a **black → silver → white** scheme, tuned toward **"dawn light"** so it reads hopeful rather than gothic: silver leans warm pearl/champagne, whites are soft ivory, and dark surfaces are warm blacks lit by a faint dawn glow. Light mode carries the soft ivory tinge on backgrounds. LIVE/error accents keep a muted red. Deep video surfaces become night-into-dawn graphite gradients.

---

## 1. Where color lives today

| Location | Role | Status |
|---|---|---|
| `src/theme/elegant.ts` | **The active theme.** `Palettes.dark/light` (gold system), `Deep` (warm hero/chat gradients), `ThumbGradients`, `Fonts`, `Radii` | Primary target |
| `src/theme/ThemeContext.tsx` | Provides `c` (palette) + `isDark` toggle | No change needed |
| ~17 screen/component files | ~90 **hardcoded** warm hex/rgba values (gold borders, cream text, warm-black chips) | Sweep + replace |
| `src/theme/colors.ts` | Legacy `Colors` (purple/red), still used by `app/index.tsx`, `components/ui/*`, `VideoPlayer`, `ProfileSection` | Update values |
| `app.json` | Splash/background `#000000` | Already black — keep |

---

## 2. New palette — `src/theme/elegant.ts`

Keep the `Palette` interface keys as-is for now (`gold`, `goldBright`, …) so no call-site renames are needed; only values change. (Optional rename `gold* → accent*` in Phase 5.)

### Dark mode (default) — warm black + dawn-pearl silver

```ts
dark: {
  canvas: '#060504', bg: '#0C0B09', sheet: 'rgba(15,14,12,0.96)',
  surface: 'rgba(255,250,240,0.05)', surface2: 'rgba(255,250,240,0.09)',
  hairline: 'rgba(210,204,190,0.26)', hairlineSoft: 'rgba(210,204,190,0.13)',
  gold: '#CFC9BB',            // dawn-silver / warm pearl (was #C9A257)
  goldBright: '#F0EBDD',      // first-light ivory (was #E8CB8F)
  goldDeep: '#97917D',        // deep pearl (was #93702F)
  goldSoft: 'rgba(207,201,187,0.13)',
  onGold: '#0E0D0A',
  ink: '#F6F3EC', ink2: '#C2BEB2', ink3: '#8B887C',
  live: '#CF5D4E',            // muted red, kept for urgency
  input: 'rgba(255,250,240,0.06)', grabber: 'rgba(255,250,240,0.22)',
}
```

### Light mode — soft ivory dawn

```ts
light: {
  canvas: '#F0EDE2', bg: '#FBF9F0', sheet: 'rgba(253,251,244,0.98)',   // soft ivory glow
  surface: 'rgba(255,255,255,0.6)', surface2: 'rgba(255,255,255,0.92)',
  hairline: 'rgba(105,100,88,0.30)', hairlineSoft: 'rgba(105,100,88,0.15)',
  gold: '#6B675C',            // warm graphite accent (contrast-safe on light bg)
  goldBright: '#948F81',
  goldDeep: '#47443A',
  goldSoft: 'rgba(107,103,92,0.12)',
  onGold: '#FCFAF2',
  ink: '#201E18', ink2: '#5C5A4F', ink3: '#95917F',
  live: '#B44A3C',
  input: 'rgba(255,255,255,0.78)', grabber: 'rgba(48,45,38,0.2)',
}
```

The tint is a whisper, not a wash: hue stays around warm neutral (~40–45° hue, very low saturation) so the UI still reads black/silver/white — but lit by dawn instead of moonlight. Saturation never exceeds ~10% on any structural token; only glows/halos may go slightly warmer.

### `Deep` (video hero / chat header / banner) — night-into-dawn graphite

```ts
heroStops: ['#0A0908', '#13110E', '#1E1B15', '#2F2A1F'],   // ends on a faint warm horizon
chatHeaderStops: ['#0C0B09', '#161411', '#242017'],
bannerStops: ['#0C0B09', '#161411', '#2A251A'],
onDeep: '#F4F1E9', onDeepSoft/Faint: 'rgba(244,241,233,0.72 / 0.68)',
goldOnDeep: '#EDE7D8',
chipOnDeep: 'rgba(11,10,8,0.55)', chipBorderOnDeep: 'rgba(226,219,203,0.32)',
liveOnDeep: '#CF5D4E',
// hero halo/glow: rgba(240,226,196,0.18) — the "dawn light" radial
```

### `ThumbGradients` — warm graphite, dawn horizon on the last stop

```ts
'🎵': ['#12110F', '#1C1A16', '#312D25'],
'⛪': ['#0D0C0A', '#1A1814', '#37322A'],
'📖': ['#0F0F0C', '#1D1B16', '#2C2921'],
'🙌': ['#0E0D0B', '#191712', '#3B362B'],
```

---

## 3. Hardcoded-color sweep (~90 hits, 17 files)

Global find/replace mapping (exact-string, case-insensitive on hex):

| Old (gold) | New (dawn-silver) | Meaning |
|---|---|---|
| `#C9A257` | `#CFC9BB` | accent (icons default, spinners, svg glow) |
| `#E8CB8F` | `#F0EBDD` | bright accent (icons on deep, LIVE chip text) |
| `#EEDFBE` | `#EDE8DB` | chip/badge text on deep |
| `#F5EFDF`, `#F2EADA` | `#F6F3EC` (on deep: `#F4F1E9`) | titles on deep |
| `rgba(232,203,143,x)` | `rgba(226,219,203,x)` | gold borders on deep |
| `rgba(201,162,87,x)` | `rgba(207,201,187,x)` | gold fills (send btn, halo) |
| `rgba(244,232,205,x)` | `rgba(255,250,240,x)` | cream surfaces |
| `rgba(242,234,218,x)` | `rgba(244,241,233,x)` | cream text on deep |
| `rgba(12,9,6,x)`, `rgba(14,11,7,x)` | `rgba(11,10,8,x)` | warm-black chips |
| `#0A0806` | `#0B0A08` | warm-black backgrounds |
| `rgba(5,4,2,0.5)` | `rgba(5,4,3,0.5)` | modal scrim |
| `rgba(224,106,80,x)` (error/mute) | `rgba(207,93,78,x)` | muted red, kept |
| `#E06A50` | `#CF5D4E` | LIVE dot, kept red |

Files: `Icons.tsx`, `Kit.tsx`, `LiveChat.tsx`, `VideoCard.tsx` (elegant + ui), `VideoHero.tsx`, `VideoPlayer.tsx`, `ProfileSection.tsx`, `LiveBadge.tsx`, `AskScreen`, `DenominationScreen`, `EditProfileScreen`, `LiveStreamScreen`, `LiveViewerScreen`, `PodcastScreen`, `StudyChatScreen`, `UploadVideoScreen`.

`#fff` / `#000` / pure-black overlays already fit the scheme — leave untouched.

## 4. Legacy `src/theme/colors.ts`

Still imported by `app/index.tsx` and the older `ui/` components. Update: `primary #9500ff → #CFC9BB`, `primaryDark → #97917D`, `primaryLight → #F0EBDD`, `gradientRedStart/End → '#0C0B09' / '#3B362B'`, `actionActive #ff0000 → #CF5D4E`. Backgrounds/text there are already black/white — keep.

## 5. Smoothness & fluidity

The stack is already motion-ready: `react-native-reanimated ~4.1` + `react-native-worklets` are installed (but almost everything still uses the core `Animated` API), `Kit.tsx` has a springy `PressScale`, and all secondary screens open as full-screen `Modal`s over an always-mounted Home. Targeted upgrades, cheapest-first:

**5a. Consistent touch feedback (biggest perceived win).**
~45 `TouchableOpacity` usages across 11 files give an abrupt opacity blink. Replace them with the existing `PressScale` (spring scale-down to 0.96–0.93) so every tap in the app responds identically. Zero new dependencies.

**5b. Animated theme toggle.**
`ThemeContext` currently swaps palettes instantly (hard cut). Add a ~220 ms crossfade: render a full-screen overlay of the outgoing `bg` color and fade it out on toggle (one `Animated.Value` in `ThemeProvider`; no per-component changes). Silver-on-black ↔ ivory-white flips feel deliberate instead of jarring.

**5c. Migrate micro-animations to Reanimated worklets.**
Port `PressScale` and `PulseDot` from core `Animated` to Reanimated (`useSharedValue` + `withSpring`/`withRepeat`). They then run entirely on the UI thread and stay at 60 fps even when JS is busy (chat websocket bursts, query refetches).

**5d. Entrance & layout transitions.**
Use Reanimated's built-ins — `FadeInDown.duration(280).delay(i * 40)` on Home's stream cards (staggered), `Layout.springify()` on chat message lists (StudyChat, LiveChat) so new messages push in smoothly, and `FadeIn` on modal content behind the slide.

**5e. Modal/screen transitions.**
Keep the Modal architecture (it preserves Home scroll/video state — good). Standardize: `animationType="slide"` for tool screens, `"fade"` for LiveViewer (feels like entering a player), add `statusBarTranslucent` and `hardwareAccelerated` on Android. `app/_layout.tsx`'s Stack has `animation: 'none'` — fine since there's a single route; leave it.

**5f. Silver shimmer skeletons.**
Replace `ActivityIndicator` waits (LiveViewer joining, Home feed first load) with shimmer placeholder cards — a sweeping `rgba(240,235,221,0.10)` highlight over `surface` via Reanimated. On-theme (liquid dawn-light) and reads faster than a spinner.

**5g. List & render hygiene.**
`React.memo` on `VideoCard`; keep Home's nested non-scrolling FlatList (fine at current sizes) but memoize `renderItem` data; confirm all animations use the native driver / worklets (no JS-thread color or layout tweens except the one-off theme crossfade).

Optional polish: `expo-haptics` light impact on primary actions (Go Live, Send, theme toggle).

## 6. Keyboard & typing ergonomics — uniform across the app

**Requirement:** wherever the user types, the focused text box must stay visible above the keyboard with a consistent, comfortable gap. Today every screen improvises and the results differ:

| Screen | Current handling | Problem |
|---|---|---|
| AskScreen | KAV, offset `insets.top` | different offset than siblings |
| AuthScreen | KAV, offset `insets.top + 120` | magic number |
| EditProfileScreen | KAV, offset `insets.top + 100` | different magic number |
| LiveViewer / Podcast / StudyChat | KAV, **no offset** | input can sit flush against or under the keyboard |
| LiveStream (Go Live title), UploadVideo (title) | **no handling at all** | keyboard can cover the field |
| All of the above | `behavior="height"` on both platforms | wrong for iOS (should be `padding`) |

**Fix — one shared system, zero per-screen magic numbers:**

Define a single constant in the theme: `export const KEYBOARD_GAP = 12;` — the uniform breathing space between the top of the keyboard and the bottom of the focused input, everywhere.

Build two small shared components (in `components/elegant/Kit.tsx` or a new `Keyboard.tsx`), both driven by Reanimated's `useAnimatedKeyboard()` (already available — reanimated 4 is installed), which tracks the keyboard's height frame-by-frame on the UI thread. This makes inputs ride up *with* the keyboard animation instead of jumping after it, which also serves the fluidity goal:

1. **`<StickyInputBar>`** — wraps bottom-anchored input rows (Ask composer, StudyChat, LiveChat, Podcast comment): animated `paddingBottom = max(insets.bottom, keyboardHeight + KEYBOARD_GAP)`. The input is always exactly `KEYBOARD_GAP` above the keyboard, on both platforms, chat list auto-scrolls to the latest message when the keyboard opens.
2. **`<KeyboardAwareForm>`** — wraps scrollable forms (Auth, EditProfile, Go Live title, Upload Video title): on focus, scrolls the focused field into view so its bottom clears the keyboard by `KEYBOARD_GAP`; adds the same animated bottom padding so the last field is reachable.

Then delete every per-screen `KeyboardAvoidingView` + `keyboardVerticalOffset` (7 call sites) in favor of these two.

Also set in `app.json` → `android: { "softwareKeyboardLayoutMode": "resize" }` explicitly, so Android resizes the viewport rather than panning it (panning is what causes "typing blind" under the keyboard).

**Acceptance check (Phase 6 of verification):** on every screen with a text input — Auth (email/password), EditProfile (all fields incl. the last one), Ask composer, StudyChat, LiveChat overlay, Podcast comment, Go Live title, Upload Video title — the focused input sits exactly `KEYBOARD_GAP` above the keyboard while typing, the text being typed is fully visible, and the gap is visually identical across screens on both iOS and Android.

## 7. Optional cleanup (separate commit)

Rename palette keys `gold* → accent*` (mechanical rename across ~40 call sites), and rename `Deep.goldOnDeep → accentOnDeep`, so the code no longer lies about its colors.

---

## Execution order

1. **Phase 1 — `elegant.ts`**: swap `Palettes.dark`, `Palettes.light`, `Deep`, `ThumbGradients`. (~80% of visible change; app instantly re-themes since everything routed through `useTheme()` follows.)
2. **Phase 2 — hardcoded sweep**: apply the mapping table across the 17 files.
3. **Phase 3 — legacy `colors.ts`**: update values.
4. **Phase 4 — motion**: 5a → 5b → 5c → 5d → 5e (each independently shippable), then 5f/5g.
5. **Phase 5 — keyboard ergonomics**: build `StickyInputBar` + `KeyboardAwareForm`, migrate all 9 input surfaces, remove the 7 ad-hoc KAVs, set `softwareKeyboardLayoutMode`.
6. **Phase 6 — verify**: `grep` for leftover warm values (`C9A257|E8CB8F|EEDFBE|232,203|201,162|244,232|242,234`), run the app, toggle dark/light on Home, Podcast, Ask, StudyChat, LiveViewer, EditProfile; check contrast of accent on light bg (AA for text ≥ 4.5:1); confirm press/entrance animations hold 60 fps on a mid-range Android device; run the keyboard acceptance check from §6 on every input surface.
7. **Phase 7 (optional)** — key rename `gold* → accent*`.

No structural/layout changes; fonts (Cormorant Garamond + Outfit), radii, spacing all stay. Splash in `app.json` is already `#000000`.
