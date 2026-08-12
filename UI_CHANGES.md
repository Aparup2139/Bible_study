# BibleWay — UI Changes Summary

*August 2026 · "Rose-Dawn" re-theme, motion, glass, and keyboard overhaul*

## 1. What changed, at a glance

The app moved from a black + orange/gold look to a **black / silver / white** scheme with a **soft rose "light of hope"** accent, plus a matching set of interaction upgrades: uniform spring touch feedback, frosted-glass surfaces with 3-D elevation, an animated theme toggle, and a single keyboard-handling system so the text box is always visible while typing. 28 files changed, 2 new files (`Glass.tsx`, `Keyboard.tsx`), 1 new dependency (`expo-blur`).

## 2. Color system

Two color families with clear roles, defined once in `src/theme/elegant.ts` and documented in `Frontend/THEME_SPEC.md` (the source of truth for every value):

**Silver = structure.** Frames, chrome, secondary text, default icons, neutral borders. Dark mode: `#D3D5DA` accent on warm-black `#100E0D`. Light mode: graphite `#6F6F75` on blush-ivory `#FDFAF7`.

**Rose = life ("hope").** LIVE badges and pulse dots, primary CTAs (Join, Go Live, Send, Save, Post), icons/text over video, avatar rings and glows, speaker names in chat, active tabs/selections. Dark: `#EDB4AA` / bright `#F8DDD6`. Light: `#A6635A`. A muted red-rose `#E67260` (light: `#B44A3C`) is reserved for LIVE urgency and errors.

Video surfaces (hero, chat headers, thumbnails) use constant "night-into-dawn" graphite gradients ending on a warm horizon (`#0D0C0C → #432C26`), with a rose dawn-glow halo. The legacy purple `Colors` palette (`colors.ts`) was remapped to the same system. Palette keys kept their original names (`gold*`) so no call sites broke; new `hope*` tokens were added alongside.

## 3. Depth & glass

Every card, tile, pill, and panel now pairs a translucent fill + 1px hairline border + layered shadow, via shared `Elev` constants (`elev.card` / `elev.hero` / `elev.chip` from `useTheme()`), with warm-toned softer shadows in light mode. On top of that, a new `Glass` component (`expo-blur`) adds **real backdrop blur** — applied only where blur is visible: chips and badges over video thumbnails, the hero's avatar and watching pill, live-chat bubbles and input, LIVE pills, stream-info panels, the END button over the camera preview, Study Chat header pills, and the podcast upload sheet over its scrim. Flat-background cards intentionally skip blur (invisible there; costs performance).

## 4. Motion

`PressScale` — a Reanimated spring scale-down — is now the app's **universal touch response**; all ~30 `TouchableOpacity`s were replaced with it, so every tap feels identical. `PulseDot` (LIVE indicator) also runs on Reanimated, meaning both animate on the UI thread at 60fps even when JavaScript is busy. Toggling dark/light mode now crossfades over 220ms instead of hard-cutting (overlay fade in `app/_layout.tsx`).

## 5. Keyboard & typing

One uniform system replaces seven inconsistent per-screen `KeyboardAvoidingView`s (which used differing magic offsets, and two screens had none):

- `KEYBOARD_GAP = 12` — the single spacing constant, everywhere.
- `StickyInputBar` — bottom composers (Ask, Study Chat, live chat, podcast sheet) ride up with the keyboard, input always exactly 12px above it.
- `KeyboardAwareForm` — scrollable forms (Auth, Edit Profile) keep the focused field clear of the keyboard with the same gap.
- `app.json`: Android `softwareKeyboardLayoutMode: "resize"` so the viewport resizes instead of panning.

Both components track the keyboard frame-by-frame via Reanimated's `useAnimatedKeyboard`, so the motion is fluid, and **what you type is always visible**.

## 6. Files touched

| Area | Files |
|---|---|
| Theme core | `theme/elegant.ts`, `theme/colors.ts`, `theme/ThemeContext.tsx` |
| New components | `components/elegant/Glass.tsx`, `components/elegant/Keyboard.tsx` |
| Shared kit | `Kit.tsx`, `Icons.tsx`, `ActionGrid.tsx`, `LiveChat.tsx`, `VideoCard.tsx`, `VideoHero.tsx` |
| Screens | Ask, Auth, Denomination, EditProfile, LiveStream, LiveViewer, Podcast, StudyChat, UploadVideo |
| Legacy/shell | `ui/*`, `VideoPlayer.tsx`, `ProfileSection.tsx`, `app/_layout.tsx`, `app.json`, `package.json` |

## 7. Verification

Zero leftover old-theme colors (21-pattern grep), zero remaining `TouchableOpacity`/`KeyboardAvoidingView`, full strict `tsc --noEmit` passes, light-mode accent contrast ≥ AA (4.5:1). Reference docs: `FRONTEND_THEME_PLAN.md` (plan) and `Frontend/THEME_SPEC.md` (exact values).

**Note:** run `npm install` in `Frontend/` before the next build — it pulls the new `expo-blur` dependency. Existing dev-client builds predate the native module and need a rebuild.
