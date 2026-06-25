# BibleWay — Video & Live Streaming (Cloudflare Stream) — Build Context

> **Purpose of this file.** This is the authoritative, self-contained context for
> implementing **Phase 4 (Live Video)** and all uploaded/on-demand **video** using
> **Cloudflare Stream**. It is written so that an AI assistant or developer can pick
> this up cold — with no prior chat history — and build the feature correctly.
> Read this top to bottom before writing any Phase 4 code.
>
> **Status:** NOT yet built. Decided + specced only. Phases 0–3 (Foundations, Auth &
> Profiles, Denominations, Podcasts) are already implemented and live; an Auth
> screen + gate (frontend) is also built. This document is the plan for what comes next.
>
> **Scope split (important):**
> - **Cloudflare Stream** handles ALL *video*: live streaming **and** uploaded/on-demand video.
> - **Supabase Storage + CDN** continues to handle *audio* podcasts (Phase 3). Do NOT move audio to Stream — Stream is video-oriented.

---

## 0. Decisions already made (do not re-litigate without reason)

| Concern | Decision | Why |
|---|---|---|
| Live video provider | **Cloudflare Stream** | Managed (matches "managed-first" golden rule), unified live + VOD via one REST API, **free ingest/encoding/egress**, global CDN, cheap usage-based pricing. |
| On-demand video provider | **Cloudflare Stream** (same account) | One pipeline for all video; Direct Creator Upload keeps the API token off the client. |
| Audio podcasts | **Stay on Supabase Storage + CDN** | Stream is video-only; audio already works (Phase 3). |
| Rejected: Mux | More expensive than Cloudflare for same capability. |
| Rejected: self-hosted SRS / OvenMediaEngine | Free software but you pay for server + bandwidth + ops; violates "don't self-host media" rule. |
| Player on device | `expo-av` `Video` playing the **HLS manifest URL** | No Cloudflare client SDK needed in React Native. |
| Provider abstraction | `MediaProvider` interface + `CloudflareStreamProvider` | Keeps the vendor swappable; isolates all Cloudflare calls. |

### Pricing reality (so cost is never a surprise)
- **$5 per 1,000 minutes stored** (prepaid) + **$1 per 1,000 minutes delivered** (postpaid).
- **Ingest, encoding, and bandwidth/egress are FREE.**
- A live broadcast with **0 viewers** costs $0 delivery; its recording counts toward storage.
- No perpetual free tier — you pay a small amount (~$5/mo min) once you store anything.

---

## 1. Mental model (how Cloudflare Stream works)

Everything is a **video** with a UID. Two ways a video is created:
1. **Upload a file** → a VOD video.
2. **A Live Input receives a broadcast** → Stream auto-creates a video for that broadcast (recorded as VOD afterward if recording is on).

**All playback is HLS or DASH from your account's delivery subdomain:**
```
https://customer-<CODE>.cloudflarestream.com/<ID>/manifest/video.m3u8   # HLS
https://customer-<CODE>.cloudflarestream.com/<ID>/manifest/video.mpd    # DASH
https://customer-<CODE>.cloudflarestream.com/<ID>/iframe                # built-in player
```
- `<CODE>` = your account's fixed delivery/customer code (same for every video).
- `<ID>` can be a **Live Input ID** (always shows the current/most-recent broadcast — best for a channel page) OR a **Video ID** (one specific broadcast/recording — best for a single event/replay).

**Codec requirements for live ingest:** H.264 video + AAC audio, **closed GOPs**, keyframe interval 2–8s. OBS defaults satisfy this. (Stream Live inputs only.)

---

## 2. Environment variables (add to `backend/.env` and `backend/.env.example`)

```
# Cloudflare Stream (Phase 4 — video + live)
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_STREAM_API_TOKEN=        # Account > Stream > Edit token. SERVER-SIDE ONLY.
CLOUDFLARE_STREAM_CUSTOMER_CODE=    # the <CODE> in customer-<CODE>.cloudflarestream.com
CLOUDFLARE_WEBHOOK_SECRET=          # secret for verifying Stream Live webhook calls
```
- Add all four to the Zod schema in `backend/api/src/config/env.ts` as **`.optional()`** so the API still boots without them (same graceful pattern as `REDIS_URL`).
- The `CloudflareStreamProvider` should throw a clear "Cloudflare Stream not configured" error only when a stream operation is actually attempted while unconfigured.

---

## 3. Setup guide (manual, done in Cloudflare dashboard — human required)

1. **Enable Stream.** Dashboard (https://dash.cloudflare.com) → **Stream** → subscribe. No domain on Cloudflare is required to use Stream.
2. **Account ID** → from the dashboard URL `dash.cloudflare.com/<ACCOUNT_ID>/...` or the Stream sidebar. → `CLOUDFLARE_ACCOUNT_ID`.
3. **API token** → profile → **My Profile → API Tokens → Create Token → Custom token** → permission **Account → Stream → Edit**, scoped to the account. Copy once. → `CLOUDFLARE_STREAM_API_TOKEN`. Treat as a secret (never ship to client; never commit).
4. **Customer code `<CODE>`** → create one Live Input in the dashboard, look at its Embed / HLS Manifest URL; the subdomain is `customer-<CODE>.cloudflarestream.com`. → `CLOUDFLARE_STREAM_CUSTOMER_CODE`.
5. **Webhook** → **Notifications → Destinations → Webhooks → Create** → URL = `https://<public-host>/api/v1/webhooks/cloudflare`; save the secret it provides → `CLOUDFLARE_WEBHOOK_SECRET`. Then **Notifications → Add → Stream**, attach the webhook (optionally filter to specific Input IDs).
6. **Local webhook testing** needs a public tunnel so Cloudflare can reach localhost:
   ```
   cloudflared tunnel --url http://localhost:3000      # or: ngrok http 3000
   ```
   Point the webhook destination at the tunnel URL during dev.
7. **Smoke test before app code:** create a live input via API (see §8), put `rtmps.url` + `streamKey` into **OBS** (Settings → Stream → Custom), go live, and confirm playback at the input's HLS URL. Proves account + token + ingest end-to-end.

> **Webhook signature verification — CONFIRM AT WIRE-UP.** Cloudflare Notifications
> webhooks include a verification mechanism (a secret / signature header, commonly
> `cf-webhook-auth`). Confirm the exact header + algorithm against
> https://developers.cloudflare.com/stream/stream-live/webhooks/ when implementing
> the handler, and validate every incoming webhook against `CLOUDFLARE_WEBHOOK_SECRET`.

---

## 4. Database schema — migration `0006_live_streams.sql`

Maps to the frontend `LiveStream` type (`Frontend/src/types/index.ts`) and `CreateStreamInput`.

```sql
-- 0006_live_streams.sql  (Phase 4: live video metadata; media lives in Cloudflare Stream)
set search_path = public;

create table if not exists public.live_streams (
  id                    uuid primary key default gen_random_uuid(),
  host_id               uuid not null references public.profiles (id) on delete cascade,
  title                 text not null,
  -- Cloudflare Stream live input UID (the durable channel id used for playback).
  cloudflare_input_uid  text unique,
  -- Secret RTMPS stream key — returned ONLY to the host at create time. Never selected
  -- for any other caller. (Consider storing encrypted; at minimum never expose via API.)
  stream_key            text,
  rtmps_url             text,
  status                text not null default 'idle'
                          check (status in ('idle','countdown','live','ended')),
  viewer_count          integer not null default 0 check (viewer_count >= 0),  -- denormalized (rule #3)
  quality               text not null default '1080p' check (quality in ('480p','720p','1080p')),
  is_public             boolean not null default true,
  denomination          text,        -- free text or FK to denominations(id) later
  -- Per-broadcast recording (VOD). Cloudflare video UID of the recording + built HLS path.
  recording_uid         text,
  recording_path        text,
  started_at            timestamptz,
  ended_at              timestamptz,
  created_at            timestamptz not null default now()
);

create index if not exists live_streams_feed_idx on public.live_streams (status, started_at desc);
create index if not exists live_streams_host_idx on public.live_streams (host_id);

alter table public.live_streams enable row level security;

-- Public can read public streams (and any live stream); host can read own always.
drop policy if exists "public streams readable" on public.live_streams;
create policy "public streams readable" on public.live_streams
  for select using (is_public = true or (select auth.uid()) = host_id);

-- Host can insert their own stream.
drop policy if exists "host inserts own stream" on public.live_streams;
create policy "host inserts own stream" on public.live_streams
  for insert with check ((select auth.uid()) = host_id);

-- Host can update/delete their own stream.
drop policy if exists "host updates own stream" on public.live_streams;
create policy "host updates own stream" on public.live_streams
  for update using ((select auth.uid()) = host_id) with check ((select auth.uid()) = host_id);

drop policy if exists "host deletes own stream" on public.live_streams;
create policy "host deletes own stream" on public.live_streams
  for delete using ((select auth.uid()) = host_id);
```

**Security note:** because `stream_key` is on this row and the table is host-readable,
the API must **never** put `stream_key`/`rtmps_url` in the columns selected for the
public feed or for `GET /streams/:id`. Only return them in the `POST /streams`
response to the creating host. (Belt-and-suspenders: a Postgres column-privilege or a
separate `live_stream_secrets` table keyed by stream id with stricter RLS.)

---

## 5. Backend architecture (NestJS) — `StreamsModule`

Follow the exact conventions already used in Phases 1–3:
- Reuse `SupabaseService` (admin + `forUser`), `SupabaseAuthGuard`, `OptionalAuthGuard`, `@CurrentUser()`, `RedisService` (graceful no-op when `REDIS_URL` unset).
- Cursor pagination via the shared `Paginated<T>` type, keyset (no OFFSET).
- Aggressive `Cache-Control` only on truly public/cacheable reads; the live feed uses a SHORT TTL (5–10s) because it changes fast.

### 5.1 `MediaProvider` interface + `CloudflareStreamProvider`
`backend/api/src/streams/media/media.provider.ts` (interface) and `cloudflare-stream.provider.ts` (impl). Plain `fetch` (Node 22 has global fetch) — no SDK dependency.

```ts
export interface CreatedLiveInput {
  inputUid: string;
  rtmpsUrl: string;
  streamKey: string;
  playbackUrlHls: string;   // built from CUSTOMER_CODE + inputUid
}

export interface MediaProvider {
  createLiveInput(name: string, opts: { requireSignedURLs?: boolean }): Promise<CreatedLiveInput>;
  deleteLiveInput(inputUid: string): Promise<void>;
  getLiveInputStatus(inputUid: string): Promise<{ live: boolean; videoUID: string | null }>;
  listLiveInputVideos(inputUid: string): Promise<Array<{ uid: string; state: string; hls: string; dash: string }>>;
  // VOD (uploaded video):
  createDirectUpload(maxDurationSeconds: number): Promise<{ uploadURL: string; uid: string }>;
  hlsUrl(idOrUid: string): string;   // -> https://customer-<CODE>.cloudflarestream.com/<id>/manifest/video.m3u8
}
```

### 5.2 Endpoints (under global prefix `/api/v1`)
- `POST /streams` (auth) → create CF live input (recording `automatic`) + insert `live_streams` row (status `idle`). **Return to host only:** `{ id, title, ingest: { rtmpsUrl, streamKey }, playbackUrl }`.
- `GET /streams?status=live` (optional-auth) → cursor-paginated "live now" feed; **Redis-cached short TTL**; enrich `hostName` from `profiles`; invalidate cache on connected/disconnected webhooks. Never include `stream_key`.
- `GET /streams/:id` (optional-auth) → details + playback URL (+ recording HLS if ended). For private streams, mint a signed playback token (see §7).
- `DELETE /streams/:id` (auth, host) → set status `ended`, optionally `PUT enabled=false` or delete the CF input.
- `POST /webhooks/cloudflare` (NO auth guard; verify CF signature/secret instead) → handle `live_input.connected` / `live_input.disconnected` / `live_input.errored` (see §6).
- (Optional, VOD) `POST /streams/uploads` (auth) → `createDirectUpload` → return `{ uploadURL, uid }` for the client to upload to.

### 5.3 Viewer count
- Primary: **WebSocket presence** (see §9) — the live count = number of connected viewer sockets in the stream's room. Cheap, real-time, matches `BACKEND_PLAN` ("increment on player open, decrement on close").
- Store live count in Redis per stream (`viewers:<streamId>`), broadcast `viewer_count_update`, and periodically reconcile the denormalized `live_streams.viewer_count` column (rule #3, never live COUNT).
- Alternative/supplement: Cloudflare's **"Get live viewer counts"** analytics API (https://developers.cloudflare.com/stream/getting-analytics/live-viewer-count/) — server-side, can be polled; confirm exact endpoint path at wire-up. Prefer WS presence for the real-time number.

---

## 6. Webhook handling (Stream Live)

Cloudflare fires **live input** webhooks via the Notifications system. Verified payload shape:
```json
{
  "name": "Live Webhook Test",
  "text": "Notification type: Stream Live Input\nInput ID: eb22...\nEvent type: live_input.disconnected\n...",
  "data": {
    "notification_name": "Stream Live Input",
    "input_id": "eb222fcca08eeb1ae84c981ebe8aeeb6",
    "event_type": "live_input.connected",   // or live_input.disconnected | live_input.errored
    "updated_at": "2022-01-13T11:43:41.855717910Z"
  },
  "ts": 1642074233
}
```
Handler logic (look up the stream by `cloudflare_input_uid = data.input_id`):
- `live_input.connected` → `status='live'`, set `started_at`, broadcast WS `stream_started` to the room, invalidate the live-feed cache.
- `live_input.disconnected` → `status='ended'`, set `ended_at`, broadcast WS `stream_ended`, invalidate cache. Then (async, after ~60s) fetch the recording: call `listLiveInputVideos`, find the `ready` video, store `recording_uid` + `recording_path` (HLS).
- `live_input.errored` → log + optionally surface; `data.live_input_errored.error.code` is one of:
  - `ERR_GOP_OUT_OF_RANGE`, `ERR_UNSUPPORTED_VIDEO_CODEC`, `ERR_UNSUPPORTED_AUDIO_CODEC`, `ERR_STORAGE_QUOTA_EXHAUSTED`, `ERR_MISSING_SUBSCRIPTION`.

**Verify the secret on EVERY call** before trusting it. Reject if missing/invalid.

> Note: uploaded/on-demand (VOD) videos use a *different* webhook (Manage videos →
> "Use webhooks", https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/),
> which notifies when a video finishes processing (`status.state == "ready"`). Wire this
> if/when you add the upload flow, to know when an uploaded video is playable.

---

## 7. Security / private streams (optional, per-stream)

- Create live input with `recording.requireSignedURLs: true` (and/or `allowedOrigins`) to make playback private.
- To play a private video/stream you must mint a **signed URL token** (a JWT) using a Stream **signing key** created via `POST /accounts/{account_id}/stream/keys`. The backend signs short-lived tokens and the client uses them in the manifest URL.
- For BibleWay's mostly-public faith content, default to **public** streams (no signing). Reserve signed URLs for members-only content. Implement the signing-key path only when a private use-case appears.

---

## 8. Cloudflare Stream API reference (verified from docs, 2026)

Base: `https://api.cloudflare.com/client/v4/accounts/{account_id}/stream`. Auth header: `Authorization: Bearer <CLOUDFLARE_STREAM_API_TOKEN>`.

### 8.1 Create live input
```
POST /live_inputs
body: { "meta": { "name": "Sunday Service" }, "recording": { "mode": "automatic" } }
```
Response (key fields):
```json
{
  "uid": "f256e6ea9341d51eea64c9454659e576",
  "rtmps": { "url": "rtmps://live.cloudflare.com:443/live/", "streamKey": "MTQ0...576" },
  "recording": { "mode": "automatic", "requireSignedURLs": false, "hideLiveViewerCount": false },
  "enabled": true
}
```
Optional params: `enabled` (bool; set false to reject broadcasts / end), `preferLowLatency` (bool, LL-HLS beta; needs recording=automatic), `deleteRecordingAfterDays` (int 30–1096), `timeoutSeconds` (int; how long a feed can drop before a NEW video is created), `recording.requireSignedURLs` (bool), `recording.allowedOrigins` (list), `recording.hideLiveViewerCount` (bool). SRT and WebRTC ingest are also supported (RTMPS is the default/simplest).

### 8.2 Update / delete live input
```
PUT    /live_inputs/{input_id}    body: { "meta": {...}, "recording": { "mode": "automatic", "timeoutSeconds": 10 } }
DELETE /live_inputs/{input_id}
```

### 8.3 List a live input's videos (find the live/recorded videos)
```
GET /live_inputs/{input_id}/videos
```
Returns an array; an active broadcast has `status.state == "live-inprogress"`; recordings have `status.state == "ready"`. Each item has `playback.hls`, `playback.dash`, `preview`, `thumbnail`.

### 8.4 Live input status (lifecycle) — pull check
```
GET https://customer-<CODE>.cloudflarestream.com/<INPUT_ID>/lifecycle
-> { "isInput": true, "videoUID": "55b...", "live": true }   # or live:false, videoUID:null
```

### 8.5 Playback URL formats
```
HLS:    https://customer-<CODE>.cloudflarestream.com/<INPUT_ID|VIDEO_ID>/manifest/video.m3u8
DASH:   https://customer-<CODE>.cloudflarestream.com/<INPUT_ID|VIDEO_ID>/manifest/video.mpd
iframe: https://customer-<CODE>.cloudflarestream.com/<INPUT_ID|VIDEO_ID>/iframe
```
Use **INPUT_ID** for "always show current broadcast" (channel page). Use **VIDEO_ID** for a specific recording/replay. After a live stream ends, the recording is ready within ~60s; while generating it may report `not-found`/`not-started` until video state is `ready`.

### 8.6 Direct Creator Upload (VOD, keeps token off client)
```
POST /direct_upload   body: { "maxDurationSeconds": 3600 }
-> { "result": { "uploadURL": "https://upload.videodelivery.net/<uid>", "uid": "<uid>" } }
```
Client then `POST` the file to `uploadURL` (<=200 MB). For files >200 MB OR unreliable
connections, use the **tus** protocol instead:
```
POST /stream?direct_user=true
headers: Tus-Resumable: 1.0.0, Upload-Length: <bytes>, Upload-Metadata: <base64 kv pairs>
-> one-time upload URL returned in the "Location" response header
```
`Upload-Metadata` example (space between key and base64 value, comma-separated):
`maxDurationSeconds NjAw,requiresignedurls,expiry MjAyNC0wMi0yN1QwNzoyMDo1MFo=`
Billing: `maxDurationSeconds` is reserved against storage until the upload completes, then trued-up.

---

## 9. Real-time WebSocket gateway (matches existing frontend contract)

The frontend already has a reconnecting raw-WebSocket client (`Frontend/src/services/websocket.ts`)
and a hook (`Frontend/src/hooks/useWebSocket.ts`) that expects messages shaped as the
shared `WSEvent` type:
```ts
interface WSEvent<T> { type: WSEventType; payload: T; roomId: string; timestamp: string; }
type WSEventType = 'chat_message' | 'viewer_count_update' | 'stream_started' | 'stream_ended' | 'room_participant_update';
// viewer_count_update payload = { count: number }
```
The client connects to (current placeholder) `wss://.../ws/rooms/<roomId>` and dispatches by `type`.

**Backend plan:**
- Add a NestJS WS gateway using the raw `ws` adapter (`@nestjs/websockets` + `@nestjs/platform-ws` + `ws`). NOT socket.io (client is native WebSocket).
- Connection carries a `roomId` (the stream id) — read from the URL path/query. Update the frontend `useWebSocket` WS_URL to derive from `EXPO_PUBLIC_*` instead of the hardcoded `wss://api.bibleway.app/...`.
- Gateway responsibilities:
  - Track sockets per room (in-memory Map; mirror to Redis for multi-instance later — Phase 8).
  - On join/leave: update viewer count, broadcast `viewer_count_update { count }`, debounce-write the denormalized `live_streams.viewer_count`.
  - Expose `broadcastToRoom(roomId, WSEvent)` used by the webhook handler to push `stream_started` / `stream_ended`.
- **New backend deps** (add to `backend/api/package.json`, then the HUMAN runs `npm install` on Windows — do NOT run `npm install` for the backend from the sandbox; it breaks the Windows workspace junction for `@bibleway/shared-types`):
  `@nestjs/websockets`, `@nestjs/platform-ws`, `ws`, `@types/ws`.
  Enable the WS adapter in `main.ts`: `app.useWebSocketAdapter(new WsAdapter(app))`.

---

## 10. Frontend wiring (Expo / React Native)

- `Frontend/src/hooks/useLiveStreams.ts` → replace mock with `api.get('/streams', { query: { status: 'live' } })`. Keep the 30s poll as a fallback; WS pushes give real-time updates.
- `VideoPlayer` component → play the HLS URL via `expo-av` `Video` (`source={{ uri: streamUrl }}`, `shouldPlay`). HLS works on iOS/Android in Expo Go.
- `LiveStreamScreen` go-live button → `POST /streams`; show the returned ingest `rtmpsUrl` + `streamKey` (for OBS) — see broadcaster caveat below.
- `useWebSocket(roomId)` → point WS_URL at the gateway from `EXPO_PUBLIC_*`; it already maps `viewer_count_update` into the live store.

### ⚠️ Critical caveat: broadcasting FROM the phone
- Expo Go **cannot** publish RTMP — there is no pure-Expo RTMP broadcaster. On-device "go live" requires a **native** RTMP module (e.g. `react-native-nodemediaclient`) and therefore a **custom Expo dev client** (not Expo Go).
- **Therefore, in the first vertical slice:** "go live" creates the stream + shows ingest details, and you test broadcasting by pushing from **OBS on desktop** to the `rtmps` URL/key. **Playback, the live feed, and viewer count all work in Expo Go.** On-device broadcasting is a later task once the app moves off Expo Go.

---

## 11. Phase 4 build task list (when executing)

1. `0006_live_streams.sql` migration (table + RLS + indexes). Apply via `supabase db push`.
2. Add the 4 Cloudflare env vars to `env.ts` (optional) + `.env.example`.
3. `media/` provider: `MediaProvider` interface + `CloudflareStreamProvider` (fetch-based).
4. `StreamsModule`: service + controller (`POST /streams`, `GET /streams?status=live`, `GET /streams/:id`, `DELETE /streams/:id`) with cursor pagination + Redis-cached feed + `hostName` enrichment; never expose `stream_key` except to host on create.
5. `POST /webhooks/cloudflare` controller with secret verification + connected/disconnected/errored handling + recording capture.
6. WS gateway (raw `ws`) for `stream_started`/`stream_ended`/`viewer_count_update` + presence-based viewer count; enable `WsAdapter` in `main.ts`. Add the 4 new deps to package.json; HAVE THE HUMAN run `npm install` on Windows.
7. (Optional) `POST /streams/uploads` direct-upload endpoint for VOD.
8. Frontend: `useLiveStreams` → real API; `VideoPlayer` HLS via expo-av; `LiveStreamScreen` go-live → `POST /streams`; `useWebSocket` → gateway URL from env.
9. Register `StreamsModule` (and WS gateway module) in `app.module.ts` under the `// Phase 4` comment slot.
10. **Verify:** backend typecheck/build (use the dist-path workaround for the sandbox `@bibleway/shared-types` symlink: a temp `tsconfig.verify.json` with `paths` → `../packages/shared-types/dist/index.d.ts`); SQL review; then live: create stream → OBS push → webhook flips to live → appears in feed → HLS plays in app → viewer count moves on join/leave → end → recording saved.

---

## 12. Conventions & gotchas carried over from Phases 1–3 (READ THESE)

- **File writes in the sandbox truncate via the file tools** — write/edit backend & frontend files via **shell heredocs** (`cat > file <<'EOF'`), which is reliable. Verify each file's last line after writing.
- **Backend typecheck cannot use a normal build in the sandbox** — the `@bibleway/shared-types` workspace symlink is a Windows junction that doesn't resolve in the Linux mount. Verify with a throwaway `api/tsconfig.verify.json` that maps the path to `../packages/shared-types/dist/index.d.ts`, run `npx tsc -p tsconfig.verify.json --noEmit`, then delete it (`mcp__cowork__allow_cowork_file_delete` if `rm` is blocked).
- **NEVER run `npm install` for the backend from the sandbox** — it rewrites `node_modules/@bibleway/*` as Linux symlinks and breaks `nest start` on Windows. Add deps to `package.json` and have the human run `npm install` on Windows.
- **Migrations:** set `search_path = public` (and add `extensions` when using citext/opclass — see 0001/0003); make all `drop ... if exists` idempotent; emoji in SQL via Postgres `U&'\+0xxxxx'` escapes (NOT `\U...`).
- **Supabase hosted project** has email confirmation ON by default — for testing, confirm users via SQL Editor (`update auth.users set email_confirmed_at = now() where email = '...';`) or toggle it off.
- **RLS guard pattern:** owner-only via `(select auth.uid()) = <user col>`; protect privileged/denormalized columns with `SECURITY DEFINER` triggers + `auth.role() = 'service_role'` checks (see `0001_profiles.sql`).
- **Optional-auth** for browse-anonymously-but-enrich-when-authed endpoints: use `OptionalAuthGuard` + `@CurrentUser() user?: AuthUser` (the decorator returns `undefined` when anonymous).
- **Redis** (`RedisService`) degrades gracefully when `REDIS_URL` unset (direct path instead of buffering). Same pattern for Cloudflare config.

---

## 13. Reference links
- Stream overview: https://developers.cloudflare.com/stream/
- Start a live stream (API): https://developers.cloudflare.com/stream/stream-live/start-stream-live/
- Watch a live stream (playback URLs, lifecycle): https://developers.cloudflare.com/stream/stream-live/watch-live-stream/
- Live webhooks: https://developers.cloudflare.com/stream/stream-live/webhooks/
- Direct creator uploads (VOD): https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/
- Resumable/tus uploads: https://developers.cloudflare.com/stream/uploading-videos/resumable-uploads/
- Secure your stream (signed URLs): https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/
- Live viewer counts: https://developers.cloudflare.com/stream/getting-analytics/live-viewer-count/
- Use your own player (iOS/Android/Web): https://developers.cloudflare.com/stream/viewing-videos/using-own-player/
- Pricing: https://developers.cloudflare.com/stream/pricing/
- Full docs (LLM ingestion): https://developers.cloudflare.com/stream/llms-full.txt
