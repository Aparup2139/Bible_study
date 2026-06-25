# Cloudflare Stream — live + on-demand video (implementation plan)

*Replaces **Mux** as the Phase 4 video backend in `BACKEND_PLAN.md`. Build-ready, in the style of
`Chatroom.md` / `BibleAgent.md`. Every API fact is cited to `developers.cloudflare.com` (verified
June 2026).*

Cloudflare Stream gives BibleWay one product for **live (RTMPS/SRT/WebRTC ingest → automatic HLS/DASH)
and on-demand**, with **signed/tokenized playback**, **automatic recording of live → VOD**, a global
CDN, and **flat, simple pricing** — and its HLS output plays **natively in `expo-video`** (no WebView,
unlike YouTube). This swaps cleanly into the existing `LiveStream` type, `useLiveStreams` hook,
`LiveStreamScreen`, and `VideoPlayer`.

---

## 0. TL;DR

- **One backend for live + VOD.** Create a *live input* (persistent channel) → broadcaster pushes
  RTMPS → Stream emits HLS/DASH automatically → with `recording.mode:'automatic'` the finished
  broadcast becomes an on-demand video ~60s later. ([start live](https://developers.cloudflare.com/stream/stream-live/start-stream-live/))
- **Playback = HLS manifest + `expo-video`.** `https://customer-<CODE>.cloudflarestream.com/<UID>/manifest/video.m3u8`
  plays directly in `expo-video` (AVPlayer/ExoPlayer). Basic playback works in **Expo Go (SDK 54)**;
  background audio + PiP need a dev build. ([use own player](https://developers.cloudflare.com/stream/viewing-videos/using-own-player/), [expo-video](https://docs.expo.dev/versions/v54.0.0/sdk/video/))
- **Private content via signed tokens.** Set `requireSignedURLs`, mint short-lived JWTs server-side
  with optional IP/country rules. ([securing](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/))
- **Pricing is flat:** **$5 / 1,000 min stored/mo + $1 / 1,000 min delivered/mo**, with **no charge
  for ingest, encoding, or egress** — far simpler to reason about than Mux's encode+deliver+storage
  per-minute matrix. ([pricing](https://developers.cloudflare.com/stream/pricing/))
- **Two hard parts to plan for:** in-app *broadcasting* needs a native RTMP/WHIP library (dev build),
  and a few features are **beta** (LL-HLS, WebRTC). Watching is trivial; going live from the phone is
  the work.

---

## 1. Why Cloudflare Stream over Mux (for BibleWay)

| | Cloudflare Stream | Mux (the old Phase 4 plan) |
|---|---|---|
| Pricing | **Flat**: $5/1k min stored + $1/1k min delivered; **no encode/ingest/egress fees** | per-minute encode **+** delivery **+** storage (resolution-tiered) |
| Live | RTMPS/SRT/**WebRTC(beta)** in → auto HLS/DASH; LL-HLS (beta) | RTMP in → HLS; low-latency modes |
| Recording → VOD | **Automatic** (`recording.mode:'automatic'`) | Automatic asset from live |
| Signed playback | JWT tokens, IP/geo `accessRules` | Signed playback IDs (JWT) |
| Live viewers | `/<INPUT>/views` → `{liveViewers}` (poll) | Mux Data real-time CCV (richer) |
| RN playback | HLS manifest + **`expo-video`** (native) | HLS + `expo-video` (native) |
| Analytics depth | Basic (views, GraphQL bulk) | **Deeper** (Mux Data QoE) |

**Takeaway:** Cloudflare wins on pricing simplicity and a single live+VOD+CDN product; Mux wins on
analytics depth. For a faith app, Stream's model is the better fit. (Pricing/features change —
re-check [pricing](https://developers.cloudflare.com/stream/pricing/) before committing.)

---

## 2. Architecture

```
  Broadcaster (OBS, or in-app RTMP/WHIP lib)
        │  RTMPS: rtmps://live.cloudflare.com:443/live/  + streamKey
        ▼
  ┌─────────────────────────────┐     auto HLS/DASH + auto-record
  │     Cloudflare Stream         │ ───────────────────────────────► global CDN
  │  live input (uid)             │
  └──────────────┬───────────────┘
   webhooks/events│   REST API (Bearer token, server-side only)
                  ▼
  ┌─────────────────────────────────────────────┐
  │  NestJS StreamModule                          │   ┌──────────────┐
  │  - create live input (go-live)                │──▶│ Supabase     │ live_streams,
  │  - mint SIGNED playback token (per viewer)    │   │ (Postgres)   │ vod recordings
  │  - list recordings (live → VOD)               │   └──────────────┘
  │  - webhook receiver (video.ready, live status)│   ┌──────────────┐
  │  - poll /views → denormalized viewer_count    │──▶│ Redis        │ feed cache,
  └───────────────────────────┬───────────────────┘   └──────────────┘ viewer counts
                              │  REST (api.ts) — never exposes the CF token
                              ▼
  ┌─────────────────────────────────────────────┐
  │ React Native app                              │
  │  LiveStreamScreen + VideoPlayer → expo-video  │
  │  source: { uri: HLS .m3u8, contentType:'hls' }│
  └─────────────────────────────────────────────┘
```

**Division of labor:** Cloudflare owns ingest/transcode/CDN/recording. Our NestJS layer owns the
go-live lifecycle, **signed-token minting** (the CF token never touches the client), the live-rooms
feed (cached), recording/VOD listing, and webhook-driven status + denormalized counts.

---

## 3. Env & auth

Add to `backend/api/src/config/env.ts` (zod, all `.optional()` → API still boots without them, like
the Supabase/Redis/NVIDIA config). Token = a Stream-scoped API token (**Stream Read + Stream Edit**).
([auth](https://developers.cloudflare.com/stream/get-started/), [permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/))

```ts
  // Cloudflare Stream (Phase 4 — live + VOD)
  CLOUDFLARE_ACCOUNT_ID:        z.string().min(1).optional(),
  CLOUDFLARE_STREAM_API_TOKEN:  z.string().min(1).optional(),  // server-side only; Stream Read+Edit
  CLOUDFLARE_STREAM_CUSTOMER_CODE: z.string().min(1).optional(), // the "customer-<CODE>" playback subdomain
  CLOUDFLARE_STREAM_KEY_ID:     z.string().min(1).optional(),   // signing key id (for signed playback)
  CLOUDFLARE_STREAM_KEY_PEM:    z.string().min(1).optional(),   // base64 PEM/JWK from POST /stream/keys
  CLOUDFLARE_STREAM_WEBHOOK_SECRET: z.string().min(1).optional(),// from PUT /stream/webhook response
```

- API base: `https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/stream`, header
  `Authorization: Bearer <CLOUDFLARE_STREAM_API_TOKEN>`.
- Playback host: `https://customer-<CLOUDFLARE_STREAM_CUSTOMER_CODE>.cloudflarestream.com/...`.

## 4. Data model

Update the `live_streams` table (the Phase 4 table in `BACKEND_PLAN.md`) to be Cloudflare-backed
instead of Mux-backed. New migration (`0006_streams.sql`, renumber as needed), same conventions as
`0004_podcasts.sql` (RLS, denormalized counts, cursor indexes):

```sql
create table if not exists public.live_streams (
  id                 uuid primary key default gen_random_uuid(),
  host_id            uuid not null references auth.users (id) on delete cascade,
  title              text not null,
  subtitle           text not null default '',
  denomination_id    text references public.denominations (id) on delete set null,
  -- Cloudflare Stream handles:
  cf_live_input_id   text unique,          -- persistent channel/live input uid
  cf_video_uid       text,                 -- current/last broadcast or VOD video uid
  customer_code      text not null default '', -- customer-<CODE> playback subdomain
  require_signed     boolean not null default false,
  -- lifecycle + discovery:
  status             text not null default 'idle'
                       check (status in ('idle','live','ended')),
  viewer_count       integer not null default 0 check (viewer_count >= 0), -- denormalized from /views
  is_public          boolean not null default true,
  started_at         timestamptz,
  ended_at           timestamptz,
  recording_uid      text,                 -- VOD uid once the live recording is ready
  recording_ready    boolean not null default false,
  created_at         timestamptz not null default now()
);
create index if not exists live_streams_status_idx on public.live_streams (status, started_at desc, id);
create index if not exists live_streams_host_idx on public.live_streams (host_id);
```

The shared `LiveStream` type (in `Frontend/src/types` and `backend/packages/shared-types`) changes
from Mux fields to:

```ts
export interface LiveStream {
  id: string; title: string; subtitle: string;
  hostId: string; hostName: string;
  status: 'idle' | 'live' | 'ended';
  viewerCount: number;
  isPublic: boolean;
  denomination: string | null;
  startedAt: string | null;
  // playback (resolved server-side; tokenized when require_signed):
  playbackUrl: string | null;   // HLS .m3u8 (may embed a signed token)
  cfVideoUid: string | null;
}
```

---

## 5. Backend — `StreamModule`

Create `backend/api/src/streams/` (flat, like `podcasts/`, `agent/`). Register in `app.module.ts`.
Uses `SupabaseService.admin` for DB, `RedisService` for caching the live feed + viewer counts, and a
thin `cloudflare-stream.service.ts` wrapping the REST API with `fetch` (no SDK needed). All Cloudflare
calls are server-side; the token never reaches the client.

### 5.1 `cloudflare-stream.service.ts` — REST wrapper

```ts
const BASE = (acct: string) => `https://api.cloudflare.com/client/v4/accounts/${acct}/stream`;

// Go live: create a persistent live input that auto-records to VOD.
async createLiveInput(name: string, requireSigned: boolean) {
  // POST {BASE}/live_inputs
  // body: { meta: { name }, recording: { mode: 'automatic', requireSignedURLs: requireSigned, timeoutSeconds: 0 } }
  // → result: { uid, rtmps:{url,streamKey}, srt:{...}, webRTC:{url}, status }
}
async getLiveStatus(inputId: string) {
  // GET https://customer-<CODE>.cloudflarestream.com/<inputId>/lifecycle  → { live: bool, videoUID }
}
async getLiveViewers(inputId: string) {
  // GET https://customer-<CODE>.cloudflarestream.com/<inputId>/views      → { liveViewers: number }
}
async listRecordings(inputId: string) {
  // GET {BASE}/live_inputs/<inputId>/videos  → videos[] with status.state ('live-inprogress' | 'ready')
}
async createDirectUpload(maxDurationSeconds: number, requireSigned: boolean) {
  // POST {BASE}/direct_upload  → { uploadURL, uid }   (client uploads file to uploadURL WITHOUT the token; 200MB cap)
}
async setRequireSignedURLs(videoUid: string, on: boolean) { /* update {BASE}/{videoUid} { requireSignedURLs: on } */ }
verifyWebhook(rawBody: string, header: string): boolean { /* see 5.4 */ }
signPlaybackToken(uid: string, opts): string { /* see 6 */ }
```

Key facts the wrapper relies on (all cited):
- Create live input `POST .../live_inputs`; `recording.mode:'automatic'` both makes it watchable via
  HLS/DASH and auto-records; response carries `rtmps.url` (`rtmps://live.cloudflare.com:443/live/`) +
  `rtmps.streamKey`. ([create](https://developers.cloudflare.com/api/resources/stream/subresources/live_inputs/methods/create/), [start live](https://developers.cloudflare.com/stream/stream-live/start-stream-live/))
- Recording becomes a VOD ~60s after the broadcast ends; list via `GET .../live_inputs/{uid}/videos`,
  filter `status.state === 'ready'`. ([replay](https://developers.cloudflare.com/stream/stream-live/replay-recordings/))
- Live status without a token: `GET https://customer-<CODE>.cloudflarestream.com/<inputId>/lifecycle`.
  Live viewer count: `GET .../<inputId>/views` → `{ liveViewers }` (suppress with
  `recording.hideLiveViewerCount`). ([live viewer count](https://developers.cloudflare.com/stream/getting-analytics/live-viewer-count/))

### 5.2 `streams.service.ts` — lifecycle, feed, recordings

- **`goLive(hostId, input)`** → `createLiveInput`, insert a `live_streams` row (`status:'idle'`,
  `cf_live_input_id`), return the **RTMPS url + stream key to the host only** (never in the public
  feed).
- **`listLive(cursor)`** → `GET /streams?status=live`, cursor-paginated, **Redis-cached** (short TTL
  ~10s; everyone hits the feed — rule #6). Each item resolves a `playbackUrl` (signed if
  `require_signed`). Invalidate on `live`/`ended` webhook events.
- **`getPlayback(streamId, user)`** → resolves the HLS URL, minting a signed token (§6) when
  `require_signed`. Public streams return the plain manifest URL.
- **`listRecordings(streamId, cursor)`** → VOD list from `listRecordings`, mapped to `LiveStream`/VOD
  items; persist `recording_uid` when ready.
- **Viewer counts:** a scheduled job (`@Interval`, like the podcasts progress flush) polls `/views`
  for currently-live inputs, writes the denormalized `viewer_count` — **never `COUNT(*)`** (rule #3).

### 5.3 `streams.controller.ts` — endpoints

| Method & path | Guard | Purpose |
|---|---|---|
| `POST /streams` | `SupabaseAuthGuard` | Go live: create a live input; returns RTMPS url+key to the host. |
| `GET /streams` | `OptionalAuthGuard` | Live feed (`?status=live`, cursor, cached). |
| `GET /streams/:id` | `OptionalAuthGuard` | Detail + resolved (signed) `playbackUrl`. |
| `POST /streams/:id/end` | `SupabaseAuthGuard` | Host ends the broadcast. |
| `GET /streams/:id/recordings` | `OptionalAuthGuard` | VOD recordings for the input (cursor). |
| `POST /streams/uploads` | `SupabaseAuthGuard` | Mint a direct-creator upload URL (client uploads VOD without the token). |
| `POST /webhooks/cloudflare-stream` | none (signature-verified) | `video.ready` etc. |

Use `class-validator` DTOs like `podcasts.dto.ts`; cursor pagination + `Paginated<T>` as elsewhere.

### 5.4 Webhooks

Two separate systems (cited):
- **Video-readiness** (the API one): subscribe `PUT {BASE}/webhook { notificationUrl }` → returns a
  **`secret`**. Cloudflare POSTs when a video finishes processing (`status.state:'ready'`). Verify the
  `Webhook-Signature: time=...,sig1=...` header: build `time + "." + rawBody`, compute
  **HMAC-SHA256(secret, …)** hex, constant-time compare; reject stale timestamps. One webhook per
  account. ([webhooks](https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/))
- **Live-input events** (configured in the dashboard Notifications UI, not the API):
  `live_input.connected` / `live_input.disconnected` / `live_input.errored` → drive `status` and start/
  stop viewer polling. ([live webhooks](https://developers.cloudflare.com/stream/stream-live/webhooks/))

## 6. Signed (private) playback

For non-public content (e.g. members-only studies), set `require_signed = true` and mint a short-lived
token server-side so the CF signing key never ships to the client:

1. One-time: create a signing key `POST {BASE}/keys` → `{ id, pem, jwk }` (base64; **decode**; shown
   once). Store `id` + `pem` in env. ([securing](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/))
2. Per request: sign a JWT — header `{ alg:'RS256', kid: KEY_ID }`, payload
   `{ sub: <videoUid>, kid, exp (≤24h), nbf?, accessRules? }`. `accessRules` (≤5, first match wins)
   support `ip.src` / `ip.geoip.country` allow|block.
3. Build the URL with the **token in place of the uid**:
   `https://customer-<CODE>.cloudflarestream.com/<TOKEN>/manifest/video.m3u8`.

Public streams skip all of this and use the plain `.../<uid>/manifest/video.m3u8`.

## 7. Frontend — `expo-video` HLS player

- **Install:** `npx expo install expo-video` (bundled in **Expo Go SDK 54**, `~3.0.16` — basic
  playback needs no dev build). ([expo-video](https://docs.expo.dev/versions/v54.0.0/sdk/video/))
- **Player:** in `VideoPlayer` / `LiveStreamScreen`, feed the resolved manifest URL:

```tsx
import { useVideoPlayer, VideoView } from 'expo-video';
// stream.playbackUrl is the HLS .m3u8 from GET /streams/:id (signed if private)
const player = useVideoPlayer({ uri: stream.playbackUrl, contentType: 'hls' }, (p) => { p.play(); });
return <VideoView player={player} style={...} allowsFullscreen nativeControls />;
```

  Set `contentType:'hls'` explicitly — on iOS, HLS tracks may not load unless the uri ends in `.m3u8`
  or the type is set. `expo-video` exposes `isLive` and `currentOffsetFromLive` for a live badge / "go
  to live edge". Don't enable `useCaching` for HLS on iOS. ([expo-video](https://docs.expo.dev/versions/v54.0.0/sdk/video/))
- **Hooks:** update `useLiveStreams` (React Query, like `usePodcasts`) to call `GET /streams?status=live`
  (real data, replacing `MOCK_LIVE_STREAMS`); add `useRecordings(streamId)` for VOD. Users hit our API,
  never Cloudflare directly.
- **Go-live (the hard part):** broadcasting *from the phone* needs a native RTMP/WHIP library (e.g.
  `react-native-nodemediaclient` or a WHIP/WebRTC client) → **requires a dev build**. Easiest v1:
  hosts broadcast with **OBS** using the RTMPS url+key from `POST /streams`; add in-app mobile
  broadcasting later. (This mirrors the original Mux plan's "push RTMP via a broadcaster SDK" note.)
- **Background audio / PiP** (sermon audio with screen off) needs the `expo-video` config plugin
  (`supportsBackgroundPlayback`, `supportsPictureInPicture`) → **dev build**. Basic watching works in
  Expo Go.

---

## 8. Cost math

Flat and predictable: **$5 per 1,000 minutes stored/month** + **$1 per 1,000 minutes delivered/month**;
**no charge for ingest, encoding, or egress**. Cloudflare Pro/Business plans include **100 free
storage min + 10,000 free delivery min/month**. LL-HLS is billed the same as standard.
([pricing](https://developers.cloudflare.com/stream/pricing/))

Worked example — a church doing **4 live services/week, 90 min each**, kept as VOD, with ~**300
concurrent viewers** averaging 45 min watched:

- **Delivery:** 4 × 300 viewers × 45 min = 54,000 min/week ≈ **234,000 min/mo → ~$234/mo** ($1/1,000).
- **Storage:** 4 × 90 × ~4.3 weeks ≈ 1,550 min/mo of new VOD; a year's archive ≈ 18,600 min →
  **~$93/mo** ($5/1,000), growing with the library.
- **Ingest/encode:** **$0.**

So roughly **delivery scales with watch-minutes, storage with library size**, and you can model the
bill from two numbers. Cache the live feed + viewer counts in Redis so API/DB load doesn't scale with
viewers (Cloudflare's CDN handles the video itself).

## 9. Build order & checklist

| # | Step | Effort | Notes |
|---|------|--------|-------|
| A | Cloudflare account + Stream-scoped API token + signing key; set env | S | Unblock everything. |
| B | `0006_streams.sql` migration (Cloudflare-backed `live_streams`) | S | RLS + indexes. |
| C | `cloudflare-stream.service.ts` (REST wrapper) + `StreamModule` | M | `fetch`, no SDK. |
| D | `POST /streams` (go live) + `GET /streams` feed (cached) + `GET /streams/:id` (signed playback) | M | Core lifecycle. |
| E | Frontend: `expo-video` player in `VideoPlayer`/`LiveStreamScreen` + real `useLiveStreams` | M | **Watching works (Expo Go).** |
| F | Webhook receiver (`video.ready`, signature verify) + live-event notifications + viewer polling | M | Status + counts. |
| G | Recordings/VOD list (`GET /streams/:id/recordings`) + direct-creator uploads | M | Live→VOD + user uploads. |
| H | Signed-token playback for private streams | S | JWT minting (§6). |
| I | In-app mobile broadcasting (RTMP/WHIP lib) + background-audio/PiP | L | **Dev build**; do after OBS-based v1. |

**Checklist**
- [ ] Create Stream API token (Stream Read+Edit), signing key (`POST /stream/keys`), set all `CLOUDFLARE_*` env.
- [ ] Apply `0006_streams.sql`; update `LiveStream` shared type (drop Mux fields, add CF fields).
- [ ] `StreamModule`: REST wrapper + `streams.service` + controller + DTOs; register in `app.module.ts`.
- [ ] Go-live → returns RTMPS url+key to host; verify a test OBS stream appears and plays.
- [ ] `expo-video` player with `contentType:'hls'`; swap `useLiveStreams` to real `/streams`.
- [ ] `PUT /stream/webhook` once; store secret; verify `Webhook-Signature`; handle `video.ready`.
- [ ] Dashboard live notifications → `connected`/`disconnected`; poll `/views` → denormalized `viewer_count`.
- [ ] Recordings list + direct-creator upload endpoint; signed tokens for private content.
- [ ] Later: native broadcaster lib + `expo-video` config plugin (background audio/PiP) → dev build.

## 10. Gotchas & flags (verified)

- **Don't cache/proxy/store the manifests** — Cloudflare says read manifests directly from Stream;
  and (like all such services) don't try to grab raw segments. ([own player](https://developers.cloudflare.com/stream/viewing-videos/using-own-player/))
- **LL-HLS is beta** (`preferLowLatency:true`, requires `recording.mode:'automatic'`; custom players
  use `?protocol=llhls`). Cloudflare's blog markets "as little as ~3s," but the docs give no exact
  number — treat the figure as approximate. ([LL-HLS blog](https://blog.cloudflare.com/low-latency-hls-support-for-cloudflare-stream/))
- **WebRTC/WHIP/WHEP is beta** — sub-second, but **no recording, no live viewer count, no analytics**,
  and WHIP+WHEP must be paired. Don't depend on it for the recorded-service use case. ([webrtc beta](https://developers.cloudflare.com/stream/webrtc-beta/))
- **Live recordings are truncated to the first 7 days**; signed tokens expire in **≤24h**; direct
  one-time uploads cap at **200MB** (use tus above that). ([start live](https://developers.cloudflare.com/stream/stream-live/start-stream-live/), [securing](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/), [direct uploads](https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/))
- **In-app broadcasting + background audio/PiP need a dev build** (native modules) — only *watching*
  works in Expo Go. ([expo-video](https://docs.expo.dev/versions/v54.0.0/sdk/video/))
- **Analytics are lighter than Mux** — a single `liveViewers` integer you poll, plus a GraphQL bulk
  API; no QoE/rebuffering metrics. Fine for a viewer badge; not a full QoE dashboard.

## 11. Changes to `BACKEND_PLAN.md`

Phase 4 currently reads "Live Video Streaming — Mux (RTMP ingest → HLS)". Replace the Mux specifics
with Cloudflare Stream: the `live_streams` table swaps `mux_stream_id`/`mux_playback_id` for
`cf_live_input_id`/`cf_video_uid`/`customer_code`; "go live" creates a **live input** (not a Mux live
stream); playback uses the **Cloudflare HLS manifest** (signed when private) instead of a Mux playback
id; recordings come from **automatic live recording**; and the stack table's "Live video: Mux" row
becomes "Live video: **Cloudflare Stream**". The golden rules (cached feed, denormalized counts, async
webhooks) are unchanged — only the provider changes.

---

## Sources

**Cloudflare Stream**
- Pricing — https://developers.cloudflare.com/stream/pricing/
- Start a live stream — https://developers.cloudflare.com/stream/stream-live/start-stream-live/
- Watch a live stream — https://developers.cloudflare.com/stream/stream-live/watch-live-stream/
- Record & replay live — https://developers.cloudflare.com/stream/stream-live/replay-recordings/
- Live viewer count — https://developers.cloudflare.com/stream/getting-analytics/live-viewer-count/
- Live webhooks — https://developers.cloudflare.com/stream/stream-live/webhooks/
- Video-ready webhooks + signature verification — https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/
- Create live input (API reference, exact fields) — https://developers.cloudflare.com/api/resources/stream/subresources/live_inputs/methods/create/
- Direct creator uploads — https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/
- Resumable (tus) uploads — https://developers.cloudflare.com/stream/uploading-videos/resumable-uploads/
- Upload via link — https://developers.cloudflare.com/stream/uploading-videos/upload-via-link/
- Securing your Stream (signed URLs / keys / accessRules) — https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/
- Use your own player (HLS/DASH, AVPlayer/ExoPlayer) — https://developers.cloudflare.com/stream/viewing-videos/using-own-player/
- WebRTC (WHIP/WHEP) beta — https://developers.cloudflare.com/stream/webrtc-beta/
- LL-HLS announcement — https://blog.cloudflare.com/low-latency-hls-support-for-cloudflare-stream/
- API token permissions — https://developers.cloudflare.com/fundamentals/api/reference/permissions/

**React Native / Expo**
- expo-video (HLS, isLive, background/PiP config plugin, Expo Go bundling) — https://docs.expo.dev/versions/v54.0.0/sdk/video/
- Expo Go pinned to SDK 54 (May 2026) — https://expo.dev/changelog/expo-go-and-app-store-may-2026
- @cloudflare/stream-react is web-only — https://github.com/cloudflare/stream-react

*Pricing and beta features change — re-verify the cited pages before committing. Figures verified
June 2026.*


