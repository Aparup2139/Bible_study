# BibleWay — Backend Build Plan

A step-by-step, feature-by-feature roadmap to build a backend that stays smooth and fast
from the first 100 users to millions.

**Stack decided:**
- **Core platform:** Supabase (Postgres + Auth + Storage + Realtime + Edge Functions)
- **Custom API:** Node.js + TypeScript (NestJS) — for logic Supabase can't express, media token minting, webhooks, jobs
- **Live video:** Mux (RTMP ingest → HLS playback + recordings)
- **Audio rooms:** LiveKit Cloud (WebRTC SFU)
- **Managed-first:** lean on hosted services; self-host only when scale economics demand it

---

## 0. Mental model — why this won't break at millions

We separate the system into three planes so no single piece is asked to do something it's bad at:

| Plane | What it does | Who handles it | Why it scales |
|-------|--------------|----------------|---------------|
| **Data plane** | Users, profiles, streams metadata, podcasts, subscriptions | Supabase Postgres | ACID, RLS, read replicas, connection pooling |
| **Media plane** | Video ingest/transcode/playback, audio room mixing | Mux + LiveKit | Purpose-built global infra; we never push bytes ourselves |
| **Real-time plane** | Chat, presence, viewer counts, participant updates | Supabase Realtime → dedicated gateway later | Fan-out is offloaded, never run through the main DB at scale |

**The 10 golden rules we follow everywhere (these are what actually prevent the "breaks at scale" problem):**

1. **Always use the connection pooler** (Supabase Transaction pooler / PgBouncer). Postgres dies from too many direct connections long before it dies from load.
2. **Cursor pagination, never `OFFSET`.** Offset gets linearly slower; cursors stay constant-time.
3. **Never `COUNT(*)` live for hot numbers.** Viewer/subscriber counts are denormalized columns updated async.
4. **Don't fan out real-time through Postgres at high volume.** Chat/presence move to Redis pub-sub + a WebSocket gateway when traffic grows.
5. **CDN for every byte that isn't dynamic JSON** — media, thumbnails, avatars, static reference data.
6. **Cache hot reads in Redis** (Upstash) — the "Streaming Now" feed, denomination list, channel lists.
7. **Everything slow is async** — transcoding callbacks, notifications, counter reconciliation go through a job queue.
8. **RLS (Row Level Security) on every table** — security enforced at the database, not just the API.
9. **Stateless API behind a load balancer** — scale horizontally by adding instances; no in-memory session state.
10. **Observability from day one** — you can't fix what you can't see (metrics, tracing, error tracking, load tests).

---

## 1. Phase 0 — Foundations (build before any feature)

**Goal:** a repeatable, observable, version-controlled backend skeleton.

**Steps:**
1. Create Supabase projects: `dev`, `staging`, `prod` (separate projects, not just schemas).
2. Adopt **Supabase CLI migrations** — all schema changes are SQL files in `backend/supabase/migrations/`, committed to git. No clicking in the dashboard for schema.
3. Scaffold the Node API (`backend/api/`) with **NestJS** + Fastify adapter. Structure by feature module (`auth`, `profiles`, `streams`, `podcasts`, `chat`, `rooms`, `search`).
4. Create a **shared types package** (`packages/shared-types`) — move the interfaces from `Frontend/src/types/index.ts` here so frontend and backend share one source of truth.
5. Set up the **API contract**: OpenAPI/Swagger auto-generated from NestJS decorators.
6. CI/CD: GitHub Actions → run migrations, tests, deploy API (Fly.io / Railway / Render to start; ECS/Cloud Run later).
7. Observability: **Sentry** (errors), structured JSON logs, basic uptime + latency dashboards.
8. Secrets: environment vars in the host's secret manager; never in git. Frontend gets only the Supabase anon key + API base URL.

**Frontend wiring:** create `Frontend/src/services/api.ts` (a typed fetch/axios client with auth header injection) and a `supabase.ts` client. Keep React Query — just swap `queryFn` from mock data to real calls.

**Done when:** a `/health` endpoint is deployed, migrations run in CI, and the app can call one real endpoint.

---

## 2. Phase 1 — Auth & User Profiles

*Maps to: `UserProfile`, `EditProfileScreen`, `useAppStore.profile`*

**Steps:**
1. Enable **Supabase Auth** providers: email/password, **Apple** (mandatory for iOS App Store), Google.
2. Create `profiles` table, 1:1 with `auth.users`:
   - `id (uuid, FK auth.users)`, `display_name`, `handle (unique, indexed)`, `bio`, `avatar_path`, `subscriber_count (int, denormalized)`, `denomination_id`, `is_verified`, `created_at`.
   - Trigger: auto-insert a `profiles` row when a new `auth.users` row appears.
3. **RLS policies:** anyone can read public profile fields; only the owner can update their own row.
4. **Avatar uploads** → Supabase Storage bucket `avatars` (public-read, owner-write). Store only the path; serve via CDN URL. Resize on upload via an Edge Function.
5. Endpoints (NestJS, or direct Supabase client where RLS suffices):
   - `GET /profiles/:handle`, `PATCH /profiles/me`, `GET /profiles/me`
   - Handle-uniqueness check endpoint for the edit screen.
6. **Frontend:** secure token storage with `expo-secure-store`; session restore on launch; replace `DEFAULT_PROFILE` in `useAppStore` with the fetched profile; wire `EditProfileScreen` to `PATCH /profiles/me`.

**Scale notes:** profiles are read constantly — cache by id/handle in Redis; index `handle`. `subscriber_count` is denormalized (rule #3).

---

## 3. Phase 2 — Denominations (warm-up feature)

*Maps to: `Denomination`, `DenominationScreen`*

Almost pure reference data — a perfect first end-to-end vertical slice to validate the whole stack.

**Steps:**
1. `denominations` table; seed via a migration from `MOCK_DENOMINATIONS`.
2. `GET /denominations` — **cache aggressively** (edge-cached, long TTL; this data changes monthly at most).
3. User selection writes `profiles.denomination_id`.

**Scale notes:** this endpoint should be served almost entirely from cache/CDN — near-zero DB load.

---

## 4. Phase 3 — Podcasts

*Maps to: `PodcastEpisode`, `PodcastChannel`, `PodcastCategory`, `PodcastScreen` (library/episodes/downloads/saved/categories/channels tabs)*

**Steps:**
1. Tables:
   - `podcast_channels` (`id`, `name`, `avatar`, `episode_count` denormalized, `subscriber_count` denormalized)
   - `podcast_episodes` (`id`, `channel_id`, `title`, `duration_seconds`, `published_at`, `audio_asset_id`, full-text `search_vector`)
   - `podcast_categories` (seeded reference data)
   - `channel_subscriptions` (`user_id`, `channel_id`) — the "Subscribe/Following" toggle
   - `saved_episodes` (`user_id`, `episode_id`) — the "Saved" tab
   - `playback_progress` (`user_id`, `episode_id`, `position_seconds`, `updated_at`)
2. **Audio hosting:** upload to **Mux Audio** (or Supabase Storage + CDN for simpler/cheaper). Serve via signed playback URLs.
3. Endpoints (all **cursor-paginated**):
   - `GET /podcasts/episodes`, `GET /podcasts/channels`, `GET /podcasts/categories`
   - `POST/DELETE /podcasts/channels/:id/subscribe`
   - `POST/DELETE /podcasts/episodes/:id/save`
   - `PUT /podcasts/episodes/:id/progress` (playback position)
4. **Downloads tab** is mostly a client concern — the app downloads the audio file locally (`expo-file-system`) and tracks it on-device. Backend just serves the file + a `GET /podcasts/downloads` that returns the user's downloadable set.

**Scale notes:**
- Playback-position writes are **very frequent** → debounce on the client (write every ~10s/on pause), `UPSERT`, and consider buffering in Redis then flushing. Never write on every second.
- Audio bytes always come from CDN, never your API.
- `search_vector` (tsvector) powers episode search (see Phase 7).

---

## 5. Phase 4 — Live Video Streaming

*Maps to: `LiveStream`, `VideoPlayer`, `LiveStreamScreen` (go-live flow), "Streaming Now" feed*

This is hard — so **Mux owns the media**, we own metadata + discovery + counts.

**Steps:**
1. `live_streams` table: `id`, `host_id`, `title`, `mux_stream_id`, `mux_playback_id`, `status (idle|countdown|live|ended)`, `viewer_count (denormalized)`, `quality`, `is_public`, `denomination`, `started_at`, `ended_at`, `recording_asset_id`.
2. **Go live** (`POST /streams`): Node API calls Mux → gets back a **stream key** (RTMP ingest) + **playback id**. Store them. Return the stream key to the broadcaster only.
3. **Playback:** mint **signed playback tokens** so only authorized clients watch private streams; public streams use the public playback URL. Frontend `VideoPlayer` plays the Mux **HLS** URL via `expo-av`.
4. **Mux webhooks** → Node API: `video.live_stream.active` → set `status='live'` + broadcast `stream_started`; `video.live_stream.idle` → `status='ended'` + broadcast `stream_ended`; recording ready → save `recording_asset_id` (becomes VOD).
5. **"Streaming Now" feed** (`GET /streams?status=live`): cursor-paginated, **cached in Redis** (short TTL ~5–10s) because everyone hits it. Invalidate on stream_started/ended webhooks.
6. **Viewer count:** track presence in Redis (increment on player open, decrement on close/timeout), update the denormalized `viewer_count` periodically, and broadcast `viewer_count_update`. Mux Data can also supply this. **Never count rows live.**

**Frontend wiring:** replace empty `streamUrl` with the Mux HLS URL; the go-live button in `LiveStreamScreen` calls `POST /streams` and pushes RTMP via a broadcaster SDK; map the WS events you already defined (`stream_started`, `stream_ended`, `viewer_count_update`).

**Scale notes:** Mux scales the video globally; your only scale concerns are the feed query (cached), counts (denormalized + Redis), and webhook throughput (async queue).

---

## 6. Phase 5 — Live Chat (real-time)

*Maps to: `ChatMessage`, `websocket.ts`, the chat overlay in `LiveStreamScreen`*

**Steps (start simple, evolve):**
1. **Start:** `chat_messages` table (`id`, `room_id`, `user_id`, `text`, `sent_at`) for history; use **Supabase Realtime Broadcast** to deliver new messages to everyone in the room. Low effort, good to ~thousands concurrent.
2. **Moderation & safety from day one:** profanity filter, per-user **rate limiting** (Redis token bucket — e.g., max 5 msg/10s), report/block, and a `banned_users` check.
3. Endpoints: `GET /streams/:id/messages` (history, paginated); sending goes over the realtime channel + persisted.

**Scale path (when a single hot stream has tens of thousands of viewers):**
- Move chat fan-out off Postgres to **Redis pub/sub + a dedicated Node WebSocket gateway** (horizontally scalable, sticky by room), or adopt a provider (**Ably / PubNub**).
- Persist messages in batches (write-behind), partition `chat_messages` by time, archive old partitions.
- Your existing `wsService` in `Frontend/src/services/websocket.ts` already handles reconnect — just point its URL at the gateway and keep the `WSEvent` shape.

**Scale notes:** chat is the classic "breaks at scale" feature precisely because people fan it out through their DB. We don't (rule #4).

---

## 7. Phase 6 — Study Chat / Audio Rooms (real-time + media)

*Maps to: `AudioRoom`, `RoomParticipant`, `StudyChatScreen` (speakers/listeners, raise hand, mute, roles)*

**LiveKit owns the audio media; we own room lifecycle + roles + discovery.**

**Steps:**
1. `audio_rooms` table: `id`, `title`, `subtitle`, `host_id`, `is_live`, `livekit_room_name`, `created_at`. Participant state is largely **ephemeral in LiveKit + Redis**, not a hot Postgres table.
2. **Create room** (`POST /rooms`): Node API creates a LiveKit room and returns the room handle.
3. **Join** (`POST /rooms/:id/token`): mint a **LiveKit access token** with grants based on role:
   - `host` → publish + admin (mute others, promote)
   - `speaker` → publish audio
   - `listener` → subscribe only (no publish)
4. **Raise hand → promote:** listener calls `POST /rooms/:id/raise-hand`; host approves → API re-issues a token with publish grant (or uses LiveKit's `updateParticipant`). Mute = toggling the publish permission / track.
5. **Participant updates:** LiveKit webhooks + server events → broadcast `room_participant_update` (matches your existing WS event type). Speaking detection comes from LiveKit's active-speaker events.
6. **Discovery** (`GET /rooms?live=true`): cached list of live rooms with speaker/listener counts (denormalized).

**Frontend wiring:** `StudyChatScreen` currently uses `MOCK_ROOM_PARTICIPANTS` — replace with the LiveKit React Native SDK for audio + a participant list driven by LiveKit's room state and your `room_participant_update` events. Mute button toggles the local track; "Raise hand" hits the API.

**Scale notes:** LiveKit Cloud scales rooms/participants; your concerns are token minting (stateless, cheap), role transitions, and the live-rooms discovery list (cached).

---

## 8. Phase 7 — Search & Discovery

*Maps to: `SearchBar`, the search filter in `HomeScreen`*

**Steps:**
1. **Start with Postgres full-text search** (`tsvector` columns + GIN indexes) across `live_streams.title`, `podcast_episodes.title`, `podcast_channels.name`. Covers the current search bar with zero new infra.
2. `GET /search?q=...&type=streams|podcasts|all` — cursor-paginated, ranked by relevance + recency.
3. **Scale path:** when the corpus or query volume grows, move to **Typesense** or **Meilisearch** (self-host or cloud) for typo-tolerance and speed, or **Algolia** (fully managed). Sync via the job queue on content changes.
4. **Later — recommendations/trending:** denomination-based suggestions, follow-graph "for you" feed, trending streams by velocity. This is a separate ranking service once you have engagement data.

---

## 9. Phase 8 — Hardening for millions (cross-cutting)

Do these continuously, but they become mandatory as you grow:

1. **Database:** enable **read replicas** (route feed/read traffic to replicas); partition high-volume tables (`chat_messages`, `playback_progress`) by time; archive cold data; add indexes guided by `pg_stat_statements`.
2. **Caching:** **Upstash Redis** for hot reads (feeds, counts, denominations), presence, and rate limiting.
3. **Background jobs/queue:** **pg-boss** (Postgres-backed, simple) or **Upstash QStash** for notifications, webhook processing, counter reconciliation, search sync, recording post-processing.
4. **Push notifications:** Expo Push Notifications → APNs/FCM (live-stream-started alerts, new episodes from subscribed channels, room invites).
5. **Abuse & safety:** WAF + rate limiting at the edge, content moderation (text + reported media), spam/bot detection, account-takeover protection.
6. **Cost & autoscaling:** autoscale API instances on CPU/RPS; set budgets/alerts on Mux/LiveKit usage (media is the biggest cost lever); CDN cache-hit ratios watched.
7. **Reliability:** load test with **k6** (simulate a viral stream — 100k viewers hitting the feed + chat), chaos-test webhook failures, define SLOs and alerts.
8. **Data & compliance:** backups + point-in-time recovery (Supabase provides this), GDPR delete/export, audit logging.

---

## 10. Build order & rough effort

| # | Feature | Depends on | Effort | Why this order |
|---|---------|-----------|--------|----------------|
| 0 | Foundations | — | M | Everything sits on it |
| 1 | Auth & Profiles | 0 | M | Every other feature needs a user |
| 2 | Denominations | 1 | S | Easy slice to prove the stack end-to-end |
| 3 | Podcasts | 1 | L | Mostly CRUD + CDN; no real-time risk; great to build confidence |
| 4 | Live Video | 1 | L | Mux does the hard part; you build metadata + feed + counts |
| 5 | Live Chat | 4 | M | Layers onto streams; introduces real-time discipline |
| 6 | Audio Rooms | 1 | L | LiveKit does media; you build roles + lifecycle |
| 7 | Search | 3,4 | M | Needs content to exist first |
| 8 | Hardening | all | ongoing | Continuous, intensifies with growth |

**Recommended sequence:** 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7, hardening throughout.
Podcasts (3) before Live Video (4) deliberately: it's lower-risk CRUD that lets you nail
pagination, caching, CDN, and the React Query → real-API swap before tackling real-time media.

---

## 11. Data model at a glance

```
auth.users (Supabase managed)
  └─ profiles (1:1)
        ├─ denomination_id → denominations
        ├─ channel_subscriptions → podcast_channels
        ├─ saved_episodes → podcast_episodes
        └─ playback_progress → podcast_episodes

podcast_channels ─< podcast_episodes >─ (search_vector)
podcast_categories (reference)

live_streams (host_id → profiles, mux ids, denormalized viewer_count)
  └─ chat_messages (room_id, partitioned by time)

audio_rooms (host_id → profiles, livekit_room_name)
  └─ participant state mostly in LiveKit + Redis (ephemeral)
```

Counts (`subscriber_count`, `viewer_count`, `episode_count`, `listener_count`) are **denormalized
columns**, updated asynchronously — never computed with live `COUNT(*)`.
