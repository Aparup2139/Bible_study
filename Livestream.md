# Replace live video streaming with Agora Interactive Live Streaming

## Context

Live streaming is broken because two disconnected pipelines coexist: the "GO LIVE" button uses LAN-only P2P WebRTC (react-native-webrtc + a manually-run `signaling/` server pinned to `192.168.0.166`, no TURN), while the Home "Streaming Now" feed reads a Cloudflare Stream backend that no screen ever invokes — so app-started streams never appear anywhere, and there is no in-app viewer at all. This plan replaces **both** live pipelines with Agora (SDK `react-native-agora` 4.x + backend-minted RTC tokens), keeping the existing `live_streams` table, feed endpoints, auth, and the Cloudflare **VOD upload** path untouched.

**Prerequisite (user action):** create an Agora project in the [Agora Console](https://console.agora.io) with **App Certificate enabled**, and provide the App ID + Primary Certificate for `backend/.env`.

## Architecture decisions

1. **Channel name = `live_streams.id`** (uuid, valid & under Agora's 64-byte limit) → **no new DB columns**. Agora rows are simply rows with `cf_live_input_id = NULL`; existing guards in `streams.service.ts` (`if (row.cf_live_input_id)`) already skip all Cloudflare-live code for such rows.
2. **One token endpoint, role decided server-side:** `POST /streams/:id/token` returns a PUBLISHER token (uid 1) if the caller is `host_id`, else SUBSCRIBER (uid 0 = wildcard; Agora auto-assigns each viewer a uid). Serves both viewer join and host/viewer token renewal.
3. **Agora App ID is returned by the backend** in go-live/token responses — no `EXPO_PUBLIC_AGORA_APP_ID`, no frontend env drift (App ID isn't secret; the certificate never leaves the backend).
4. **Viewer count via DB counter**, not Agora events (in live-broadcast profile, `onUserJoined`/`onUserOffline` fire only for broadcasters — the host would always see 0). Viewer screen calls join/leave endpoints; an atomic SQL RPC bumps `viewer_count`; existing polling (`useStreamDetail` 4s, `useLiveStreams` 15s) displays it.
5. **Lifecycle:** `POST /streams` inserts the row already `status='live'` + `started_at=now()` (backend can no longer observe ingest); `POST /streams/:id/end` marks `ended`. A cron sweep auto-ends stale rows (host crash safety net).
6. **Cloudflare stays for VOD:** `POST /streams/uploads`, `CloudflareStreamService`, webhook route, `useUploadVideo.ts`, `UploadVideoScreen.tsx` unchanged.

## Phase 0 — Pre-build validation (before any EAS build)

**Constraint (unavoidable):** `react-native-agora` is a native module and cannot run in Expo Go — same limitation as the current `react-native-webrtc` code, which is why the live screens already show a "needs the dev build" fallback. The phone-camera flow can only be exercised in a dev build. To de-risk everything else first:

1. **Backend-only validation:** implement and run all backend changes, then verify with curl/PowerShell against the local API (Supabase JWT from a test sign-in): `POST /streams` → 201 with token; `POST /streams/:id/token` as host vs non-host → publisher/subscriber roles; `viewers/join`/`leave` → counter moves; `POST /streams/:id/end` → row ended. No app involved.
2. **Browser test harness (validates Agora credentials + tokens end-to-end):** a throwaway `agora-web-test.html` in the scratchpad using Agora's Web SDK (`agora-rtc-sdk-ng` via CDN — no build step). Tab 1 joins as host (webcam publish), Tab 2 as audience, both with real tokens fetched from the local backend. Proves App ID, App Certificate, token generation, channel join, publish/subscribe all work before any native build. Not committed to the repo.
3. **Expo Go behavior preserved:** both live screens keep the guarded fallback card; the rest of the app remains fully testable in Expo Go.
4. Only after 1–2 pass: dev build via `eas build --profile development --platform android` (or faster local `npx expo run:android` with Android Studio) to test the real phone camera flow.

## Cloudflare VOD — no-touch guarantee

Uploaded-video streaming stays on Cloudflare, byte-for-byte untouched:

- `backend/api/src/streams/cloudflare-stream.service.ts` — **file not modified at all**.
- `POST /streams/uploads` route + `StreamsService.createUpload()` — unchanged.
- `POST /streams/webhook` + `handleVideoWebhook` (video-ready events) — unchanged.
- `Frontend/src/hooks/useUploadVideo.ts` + `Frontend/src/screens/UploadVideoScreen.tsx` — unchanged.
- `DirectUploadResult` shared type and all `CLOUDFLARE_*` env vars — unchanged.
- Existing Cloudflare rows keep working: every CF code path is guarded by `if (row.cf_live_input_id)`; Agora rows have it null.
- Acceptance gate in verification: perform a real VOD upload + playback **after** the migration and confirm identical behavior.

## Backend changes

1. **Env** — `backend/api/src/config/env.ts`: add `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE` as `z.string().min(1).optional()` (same pattern as the Cloudflare vars). Add both to `backend/.env` / `.env.example`.
2. **Dependency** — `backend/api/package.json`: add `agora-token` (^2.0.5).
3. **New `backend/api/src/streams/agora.service.ts`** (`AgoraService`), modeled on `CloudflareStreamService`'s graceful degradation (503 only when used unconfigured):
   - `appId` getter (throws `ServiceUnavailableException` when unset)
   - `buildRtcToken(channel, uid, role: 'publisher'|'subscriber', ttl=3600)` → `{ token, expiresAt }` via `RtcTokenBuilder.buildTokenWithUid(appId, cert, channel, uid, RtcRole.PUBLISHER|SUBSCRIBER, ttl, ttl)`
   - Register in `streams.module.ts` providers.
4. **`streams.service.ts`**:
   - `goLive`: check Agora configured **before** insert (no orphan rows); drop `cf.createLiveInput`; insert with `cf_live_input_id: null`, `customer_code: ''`, `status: 'live'`, `started_at: now`; return new `GoLiveResult { streamId, channel, uid: 1, token, appId, expiresAt }`.
   - New `getRtcToken(id, userId)`: 404/400 if not found or `ended`; role by `host_id` match; returns `RtcTokenResult`.
   - New `joinViewer(id)` / `leaveViewer(id)`: call `bump_viewer_count` RPC (delta ±1), return `{ viewerCount }`.
   - `endStream`: also reset `viewer_count: 0`. Existing `cf_live_input_id` guard already skips CF calls.
   - New `@Cron` sweep (`@nestjs/schedule` already installed): mark rows `live` with `started_at < now() - interval '6 hours'` as `ended`.
5. **`streams.controller.ts`** — add (all `SupabaseAuthGuard`): `POST :id/token`, `POST :id/viewers/join`, `POST :id/viewers/leave`. All existing routes unchanged.
6. **Shared types** — `backend/packages/shared-types/src/video-stream.ts`: new `GoLiveResult` shape (drop `liveInputId/rtmpsUrl/rtmpsKey/srtUrl`); add `RtcTokenResult { channel, uid, token, appId, expiresAt, role }`. Cleanup: remove duplicate `CreateStreamInput` from legacy `live-stream.ts` and the papering re-export in `index.ts:14-17` (grep-verify no consumers).
7. **Migration** — new `backend/supabase/migrations/0007_streams_agora.sql`: `bump_viewer_count(stream_id uuid, delta int)` security-definer function clamped at 0 and gated to `status='live'`; revoke from public/anon/authenticated (service-role only). No column changes.

## Frontend changes

8. **Deps/config**: add `react-native-agora` ^4.6; **remove** `react-native-webrtc` + `@config-plugins/react-native-webrtc` (package.json + `app.json` plugins — Agora needs no config plugin; existing camera/mic permissions suffice). Delete `Frontend/src/services/webrtcBroadcast.ts`, delete the entire `signaling/` folder, remove `EXPO_PUBLIC_SIGNALING_URL` from `Frontend/.env`.
9. **New `Frontend/src/services/agoraEngine.ts`** — guarded lazy `require('react-native-agora')` using the same Expo Go pattern as current `LiveStreamScreen.tsx:17-36` (`Constants.executionEnvironment === 'storeClient'`): `isAgoraAvailable()`, `getEngine(appId)` (create+initialize singleton, `ChannelProfileLiveBroadcasting`), `destroyEngine()`, guarded re-exports (`RtcSurfaceView`, enums).
10. **`Frontend/src/hooks/useLiveStreams.ts`**: update `GoLiveResult` to new shape; add `useRtcToken()` (`POST /streams/:id/token`); add fire-and-forget `joinViewer`/`leaveViewer` helpers; `useLiveStreams`/`useStreamDetail`/`useEndStream` unchanged — `useGoLive`/`useEndStream` finally get wired into the UI.
11. **Rewrite `LiveStreamScreen.tsx` (host)** — keep the existing UI shell (header, LIVE badge, GO LIVE/END buttons, center states, Expo Go fallback card):
    - GO LIVE → `useGoLive().mutateAsync({ title })` (default title `"{displayName}'s live"` from `useAppStore` profile) → `getEngine(appId)` → `registerEventHandler({ onJoinChannelSuccess, onError, onTokenPrivilegeWillExpire, onRequestToken })` → `enableVideo()` → `startPreview()` → `joinChannel(token, channel, 1, { clientRoleType: ClientRoleBroadcaster })`; `setVideoEncoderConfiguration` 720×1280@24.
    - Local preview: `<RtcSurfaceView canvas={{ uid: 0 }} style={StyleSheet.absoluteFill} />` (replaces `RTCView`).
    - Replace share-link card with viewer count from `useStreamDetail(streamId)` (viewers now watch in-app; drop `Share`).
    - END + unmount cleanup: `useEndStream().mutate(streamId)`, `stopPreview()`, `leaveChannel()`, `destroyEngine()`; also end in `useEffect` cleanup so dismissing the modal doesn't strand a live row.
    - Token renewal: `onTokenPrivilegeWillExpire`/`onRequestToken` → fetch `POST /streams/:id/token` → `engine.renewToken`.
12. **New `Frontend/src/screens/LiveViewerScreen.tsx` (audience)** — props `{ streamId, onClose }`; same Expo Go fallback. On mount: `useRtcToken(streamId)` → engine → `joinChannel(token, channel, 0, { clientRoleType: ClientRoleAudience })` (low-latency audience level) → `joinViewer(streamId)`. `onUserJoined` → set `hostUid`, render `<RtcSurfaceView canvas={{ uid: hostUid }} />`; `onUserOffline(hostUid)` or detail status `ended` → "Stream ended" state. Overlay title/host/count from `useStreamDetail`. Unmount: `leaveViewer` (best-effort), `leaveChannel`, `destroyEngine`. Same renewal flow.
13. **Navigation** — `useAppStore.ts`: add `'liveviewer'` to `activeScreen` union + `watchStreamId` state; `Frontend/app/index.tsx`: new modal for it; `HomeScreen.tsx:58-60`: replace `Alert.alert` with `setWatchStreamId(stream.id); setActiveScreen('liveviewer')`.

## Rollout

14. `npm install` both workspaces; **new EAS dev build required** (native dep changed): `eas build --profile development --platform android` (profile exists in `eas.json`). The old dev client cannot load Agora.
15. Apply migration 0007 to Supabase; set `AGORA_APP_ID`/`AGORA_APP_CERTIFICATE` in `backend/.env`.

## Edge cases handled

- Token expiry (~1h): renewal via `onTokenPrivilegeWillExpire`/`onRequestToken` on both screens.
- Host crash: viewers see "Stream ended" via `onUserOffline`; cron sweep ends stale DB rows.
- Expo Go: both live screens show the fallback card (no top-level Agora imports outside `agoraEngine.ts`); rest of app unaffected.
- Unconfigured Agora: API boots; live endpoints 503 (matches Cloudflare pattern).
- Viewer-count drift on app kill: RPC clamps at 0; end-stream resets to 0 — acceptable for a badge.

## Known trade-offs

- **No recordings** for Agora lives (Agora Cloud Recording is a separate paid API; CF recording was already 'off' due to the zero storage quota). `GET /:id/recordings` returns `[]` — already the behavior for null `cf_live_input_id`.
- The browser viewer (`signaling/public/viewer.html`) goes away; web viewing would need the Agora Web SDK later.
- `GoLiveResult` API shape change is breaking, but its only consumer (`useGoLive`) was dead code.
- iOS dev build untested here (only Android profile exercised so far).

## Verification

0. Phase 0 gates: backend curl checks pass; browser harness shows host video in the audience tab using backend-minted tokens — **before** any EAS build.
1. Backend typecheck + boot without `AGORA_*` → starts; `POST /streams` 503. With vars set: `POST /api/v1/streams` → 201 `{ streamId, channel==streamId, uid:1, token, appId }`; DB row `status='live'`, `cf_live_input_id` null.
2. `POST /streams/:id/token` as non-host → `role:'subscriber'` uid 0; as host → `'publisher'` uid 1. `viewers/join` ×2 + `leave` ×1 → `GET /streams/:id` shows `viewerCount: 1`.
3. VOD acceptance gate: `POST /streams/uploads` still returns a Cloudflare direct-upload URL, and a real upload from UploadVideoScreen plays back exactly as before.
4. Frontend typecheck/lint pass; grep confirms zero `webrtc`/`SIGNALING` references; Expo Go shows fallback cards without crashing.
5. Two-device test on the new dev build: host goes live → feed on device B shows it ≤15s → tap card → viewer sees/hears host → host sees count 1 ≤4s → END → viewer gets "Stream ended", feed drops it, row `ended`/count 0.
6. Token renewal: temporarily set TTL ~90s and confirm `renewToken` keeps both sides connected.
