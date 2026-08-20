# BibleWay — Build & Release Cheat Sheet

How to build the Android dev client, deploy the backend, and smoke-test —
written for this machine (no local Android SDK / Java; all native builds go
through EAS cloud).

---

## 0. Test on the laptop with Expo Go (before any EAS build)

The cheapest loop: no cloud build, no APK install, ~30 s from edit to phone.

**What Expo Go CANNOT run** — these need native modules that aren't in the
Expo Go binary. The app already detects this and shows a "needs the dev build"
card instead of crashing, so they're *skippable*, not blockers:

| Feature | In Expo Go |
|---|---|
| Go Live / Watch live / Study Chat audio (Agora) | "needs the dev build" card |
| Google sign-in, Apple sign-in | friendly error on tap |
| Everything else — home feed, featured videos, podcasts, Ask the Bible, profile + avatar upload, denominations, email/password auth, live chat | works |

So: use Expo Go for all JS/UI/API work, and reach for the dev build only when
you're touching live streaming or OAuth.

### Two terminals

**Terminal 1 — backend** (the phone talks to *this* machine):

```powershell
cd C:\Users\Aparup Ghosh\Bible_Read\backend
npm run dev
```

Confirm it answers: <http://localhost:3000/health>

**Terminal 2 — app:**

```powershell
cd C:\Users\Aparup Ghosh\Bible_Read\Frontend
npm run go
```

That runs the preflight gate first, then `expo start --go --clear`. Scan the
QR with Expo Go (Android) / Camera (iOS). Phone and PC must be on the same
Wi-Fi; if the office network blocks device-to-device traffic, use
`npx expo start --go --tunnel`.

### How the app finds the backend

`Frontend/.env` deliberately leaves `EXPO_PUBLIC_API_URL` **unset**.
`src/services/api.ts` then reads Metro's own connection host and calls
`http://<this-PC's-current-LAN-IP>:3000/api/v1`. Nothing to update when the
router hands out a new IP.

To test against the deployed backend instead, set it explicitly:

```
EXPO_PUBLIC_API_URL=https://bibleway-api.onrender.com/api/v1
```

(Restart Metro after editing `.env` — env vars are inlined at bundle time.)

## 0b. The preflight gate

```powershell
npm run preflight     # tsc --noEmit → eslint → expo-doctor
```

Green preflight = the three things that actually break an EAS build or a
production APK are ruled out: type errors, lint errors, and Expo SDK /
native-package version drift. Run it before every build; `go`, `dev`, and
`build:apk` all run it for you.

| Script | What it does |
|---|---|
| `npm run preflight` | the gate above, on its own |
| `npm run go` | preflight → Metro in **Expo Go** mode |
| `npm run dev` | preflight → Metro in **dev-client** mode (for the installed dev build) |
| `npm run build:apk` | preflight → `eas build --profile preview --platform android` |

### Manual pass before you spend an EAS build

Expo Go covers these — walk them once:

1. Sign up with email/password, sign out, sign back in with the username.
2. Home feed loads; Featured Videos render; tap one and it plays inline.
3. Ask the Bible returns an answer that quotes a verse.
4. Edit Profile: change display name + handle, upload an avatar, save, reopen.
5. Podcasts: open a channel, play an episode, scrub, background the app.
6. Open Go Live → expect the "needs the dev build" card, **not** a crash.
7. Keyboard: every composer/form field stays above the keyboard (this was
   reworked for SDK 54's enforced edge-to-edge — worth re-checking on Android).

Then, and only then:

```powershell
npm run build:apk
```

---

## 1. When do I need a native rebuild?

Only when a **native module** changes — a new native dependency (e.g.
`react-native-webview`, Agora), an Expo SDK upgrade, or changes to
`app.json` plugins.

Pure JS/TS changes (screens, hooks, styles, API calls) **never** need a
rebuild — the dev client loads them from Metro.

## 2. Build the Android dev client (EAS cloud)

```powershell
cd C:\Users\Aparup Ghosh\Bible_Read\Frontend
npx eas build --profile development --platform android
```

- Log in first if asked: `npx eas login`
- Takes ~10–20 min on Expo's servers; the terminal prints a build-page URL.
- **Do NOT use `npx expo run:android`** on this machine — there is no local
  Android SDK, it will fail and generate a stray `Frontend/android/` folder.
  If that folder ever appears, delete it (it's generated, untracked, and a
  stale copy overrides `app.json` in future builds).

### Install on the phone

When the build finishes, open the printed APK link (or scan the QR) on the
phone → download → install (allow "unknown sources" if asked). It replaces
the old dev build.

## 3. Run the app for development

```powershell
cd C:\Users\Aparup Ghosh\Bible_Read\Frontend
npx expo start
```

Open the installed dev build on the phone (same Wi-Fi as the PC) — it
connects to Metro and hot-loads the JS.

## 4. Deploy the backend

```powershell
git push origin main
```

Render auto-deploys `https://bibleway-api.onrender.com` from main.
Free tier: it sleeps after 15 min idle; first request takes ~30–60 s.

Verify a deploy landed (example — featured videos endpoint):

    https://bibleway-api.onrender.com/api/v1/featured-videos

DB migrations are NOT part of the deploy — push them separately:

```powershell
cd backend
npx supabase db push
```

(Gotchas: the DB password inside `SUPABASE_DB_URL` in `backend/.env` is
URL-encoded; NXDOMAIN + error 540 means the Supabase project is paused —
resume it in the dashboard.)

## 5. Featured-videos smoke test (on device)

1. Home screen → "Featured Videos" under Streaming Now shows four dashed
   "Coming Soon" windows (empty-slot state).
2. Supabase dashboard → SQL editor:

   ```sql
   update public.featured_videos
   set youtube_video_id = 'dQw4w9WgXcQ', title = 'Test video'
   where slot = 1;
   ```

3. Force-close and reopen the app → slot 1 shows the real thumbnail;
   tap → plays inline.
4. Reset:

   ```sql
   update public.featured_videos
   set youtube_video_id = null, title = ''
   where slot = 1;
   ```

Full slot-filling guide (iframe → video id, etc.): `docs/featured-videos.md`.
Note: videos whose channel disabled embedding show "Watch on YouTube"
instead of playing inline — pick another video.

## 6. Preview / shareable APK (no Metro needed)

```powershell
npx eas build --profile preview --platform android
```

The `preview` profile bakes in the production env vars (Render API URL,
Supabase) from `Frontend/eas.json`, so the APK runs standalone.
