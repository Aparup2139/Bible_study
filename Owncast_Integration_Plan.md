# Implementation Plan — Owncast 24/7 "Ministry Channel" for BibleWay

*Executes the Synthesizer's PRIMARY RECOMMENDATION (SYNTHESIS.md §6–7): keep Agora + Cloudflare Stream exactly as-is, and add **one always-on Owncast instance** surfaced in-app as a special always-live "Ministry Channel." This is the single niche where Owncast genuinely fits (SYNTHESIS §4c). All paths, class/method names, env vars, endpoints, and component names below are from the real repo (`backend/api/src/streams/*`, `Frontend/src/*`, `render.yaml`, `config/env.ts`).*

---

## 1. Goal & Non-Goals

**Goal.** Stand up a single, self-hosted, always-on Owncast instance that broadcasts a continuous ministry program (scripture readings, worship, teaching) 24/7, front it with Cloudflare for HLS delivery, and integrate it into BibleWay as one special "Ministry Channel" that appears alongside — not inside — the existing many-to-many live feed. It reuses BibleWay's existing `expo-av` HLS playback and rose-dawn `Glass`/`Kit` UI, and the existing `StreamsService`/`/streams` surface, adding a thin new channel endpoint.

**Non-goals (explicitly out of scope).**
- **No replacement of Agora.** The interactive go-live path (`goLive()` → Agora channel + publisher token, `LiveStreamScreen`/`LiveViewerScreen` with `react-native-agora`) is untouched. Owncast is one-way HLS at 10–30 s latency and cannot do sub-second/bidirectional (SYNTHESIS §1, §4b).
- **No replacement of Cloudflare Stream for user go-lives.** CF stays the HLS/VOD/signed-playback layer (`CloudflareStreamService`, `require_signed`, direct uploads, recordings). No VOD/recording migration off CF.
- **No per-host / instance-per-broadcaster Owncast (no MediaMTX fan-out).** Owncast is architecturally 1 instance = 1 channel (R3 §4); the many-to-many feed stays on Agora + CF. Exactly one Owncast instance total.
- **No mobile RTMP-publish native module.** The channel is broadcast from a fixed operator source (OBS/ffmpeg), never phone-in-app (SYNTHESIS §7).

---

## 2. Architecture Decision

**One self-hosted Owncast Docker container** (single binary, ports 8080 HTTP/HLS + 1935 RTMP, `/app/data` SQLite+config volume) on a small VPS. **Cloudflare sits in front** of the HTTP/HLS origin (origin-pull cache of `/hls/*`, WebSocket pass-through for `/ws` chat). BibleWay's NestJS backend exposes a new **`GET /streams/channel`** that returns the Cloudflare-fronted HLS URL + a cached live/offline status (proxied from Owncast `/api/status`). The RN app renders it as a **pinned "Ministry Channel" card on Home** and a dedicated viewer screen using the existing `expo-av` HLS player + `Glass`/`Kit` UI. Agora and CF Stream paths are completely unchanged.

*Alternative considered:* a fully-managed CF Stream live input flipped to `recording.mode:'automatic'` for a 24/7 channel (SYNTHESIS §6.2) — rejected here because CF bills delivery continuously for an always-on channel, which is precisely the case where self-hosted Owncast + cheap CDN wins (SYNTHESIS §4c). Keep it as the documented fallback if Owncast stalls (single-maintainer risk, §9).

```
                                        ┌──────────────────────────────┐
  Ministry operator (OBS / ffmpeg) ───► │  Owncast (Docker, 1 instance)│
      RTMP push :1935 (stream key)      │  RTMP ingest → ffmpeg ABR →   │
                                        │  HLS packager + WS chat + admin│
                                        └───────────┬──────────────────┘
                                       HTTP/HLS :8080│ (+ optional S3 offload)
                                                     ▼
                                        ┌──────────────────────────────┐
                                        │  Cloudflare (DNS + CDN)       │
                                        │  cache /hls/*, pass /ws,/api  │
                                        │  (Phase 2: Caddy JWT gate)    │
                                        └───────────┬──────────────────┘
                     GET /streams/channel           │  HLS .m3u8 + WS
              (HLS URL + cached status)             │
   ┌──────────────────────────┐   status poll  ┌────▼─────────────────────┐
   │ BibleWay API (NestJS)     │ ◄───────────── │ BibleWay RN app (Expo)    │
   │ StreamsService.getChannel │  /api/status   │ Home "Ministry Channel"   │
   │ cached 15s, feed-safe     │                │ card → MinistryChannel-   │
   └──────────────────────────┘                │ Screen (expo-av HLS)      │
        (Agora + CF paths untouched)            └──────────────────────────┘
```

---

## 3. Provisioning & Infra

**3.1 Host — recommendation: a $6/mo DigitalOcean / Linode 1 vCPU–2 GB "regular" droplet** (R3 §1: Linode/DO-class from $5/mo; FAQ names these). One transcode rung ≈ 1 CPU core (R3 §2); run **2 ABR rungs max** (e.g. 720p + 480p) so a 2-vCPU box has headroom. Since Cloudflare fronts egress, the box is CPU/uplink-bound only, not viewer-bound (R3 §2–3).
- *Alternative:* Fly.io `shared-cpu-2x`/2 GB (~$8–12/mo, easy Docker deploy, but RTMP 1935 needs a dedicated TCP service + dedicated IPv4 ~$2/mo). Render is a poor fit — it does not expose a raw TCP ingress port for RTMP 1935, so keep the BibleWay API on Render (`render.yaml`) and put Owncast on the VPS.

**3.2 Deploy Owncast (Docker).**
```bash
docker run -d --name owncast --restart unless-stopped \
  -v /opt/owncast/data:/app/data \
  -p 8080:8080 -p 1935:1935 \
  owncast/owncast:latest        # ~87 MB image (R3 §1)
```
- `/app/data` (SQLite DB, stream key, admin password, all config) MUST be on a persistent, backed-up volume (R3 §1). Snapshot it in provisioning.
- **Rotate the default `admin/abc123` admin password immediately** at `/admin` (R3 §1, SYNTHESIS §7). Set a strong **RTMP stream key** (this protects *ingest* only, not playback — R2 §6).
- In `/admin` config: set channel name/branding (rose-dawn); set video output to 2 rungs; **leave ActivityPub/Fediverse OFF** (default; R2 §7); enable chat if using Owncast chat (see §6).
- Pin the image tag (e.g. `owncast/owncast:0.2.x`) rather than `latest` for a reproducible upgrade path (single-maintainer risk, §9).

**3.3 Cloudflare in front of HLS.**
- DNS: `A`/`AAAA` `ministry.bibleway.<domain>` → droplet IP, **proxied (orange cloud)**.
- Cache rule: cache-eligible for `ministry.bibleway.<domain>/hls/*` (short edge TTL, e.g. respect Owncast segment TTLs — segments are short-lived `.ts`; the `.m3u8` manifest must NOT be cached long). Use origin-pull (R3 §3, SYNTHESIS §7).
- **WebSocket override:** ensure `/ws` (chat) is passed through un-cached — Cloudflare supports WS on proxied hostnames; do not apply cache/transform rules to `/ws` (R2 §5, SYNTHESIS §7 "websocket override").
- *(Optional, higher scale)* Configure Owncast S3-compatible object storage (e.g. Cloudflare R2) so segments serve from the bucket + CDN and origin traffic is viewer-independent (R3 §3). Not required at expected ministry-channel volumes; add later if egress grows.

**3.4 Broadcast setup for the operator.** OBS (or a headless `ffmpeg` loop for a scheduled program) pushing RTMP to `rtmp://ministry.bibleway.<domain>:1935/live` with the stream key. For true 24/7, run a supervised `ffmpeg` playlist/looped source as a systemd service on a small always-on box or the same VPS, so the channel never goes dark. Owncast shows an offline screen when no RTMP source is connected — acceptable, and the app handles it via status (§5/§6).

**3.5 RTMP-port routing gotcha (R3 §4, must-note).** RTMP on **1935 is raw TCP and cannot be host/subdomain-routed** — there is no Host header before the stream. For a *single* instance this is trivial (just publish port 1935 on the droplet's IP). It is called out here only so a future engineer does NOT try to co-host multiple Owncast instances behind one hostname: that would require unique ports / dedicated IPs / an SNI-TCP LB per instance — which is exactly the multi-tenant path this plan rejects (§1 non-goals).

---

## 4. Access Gating (OPTIONAL — Phase 2)

Owncast has **no native private/authenticated/paid streams** (R2 §6, issues #489/#630/#4344 — the last literally a church use case, unresolved). If the ministry channel must be gated to signed-in BibleWay users, put a **reverse proxy that validates a BibleWay Supabase JWT before proxying to Owncast** — mirroring CF Stream's `require_signed` semantics for the channel.

**Recommendation: Caddy** (simpler TLS + WS proxying than Nginx for this). Terminate on the VPS behind Cloudflare; validate the token, then reverse-proxy `/hls/*`, `/ws`, `/api/*`, `/embed/*` to `localhost:8080`.

- **Token transport (important):** validate a **query-string / cookie token, NOT an `Authorization` header**, because **Safari does not send `Authorization` on the WebSocket upgrade**, which breaks chat under HTTP Basic auth (R2 §6, SYNTHESIS §7). The app appends `?bwt=<supabase_jwt>` to the HLS + WS URLs; Caddy validates it with a small `forward_auth` to a new backend route (below) or with a JWT-verify plugin using Supabase's JWKS.
- Backend helper for the proxy: add `GET /streams/channel/verify` (or reuse `forward_auth` → an existing lightweight auth route) that returns 200/401 for a given token. Reuse the existing `SupabaseAuthGuard` verification logic (`backend/api/src/auth/auth.guard.ts`).
- **Mark clearly:** this is a net-new security-review surface (SYNTHESIS §7). Ship the channel **public first** (Phase 1); add gating only if product requires it (Phase 2). Owncast has no billing/entitlement layer, so any paywall is entirely BibleWay's (R2 §6).

---

## 5. Backend Changes (file-by-file)

Keep the ephemeral-vs-channel distinction the Synthesizer requires: the ministry channel is a **persistent singleton**, not a `live_streams` feed row. Two viable shapes — **recommendation: no new table; a config-driven singleton channel** (fewest moving parts). Alternative in one line at the end.

### 5.1 `backend/api/src/config/env.ts` — add env vars
Extend `envSchema` (zod) with optional keys (graceful-degradation: endpoints 503 only when called unconfigured, matching the CF/Agora pattern):
```ts
// Owncast 24/7 ministry channel (optional; unset ⇒ /streams/channel returns 404/disabled).
OWNCAST_BASE_URL: z.string().url().optional(),     // e.g. https://ministry.bibleway.<domain>
OWNCAST_HLS_URL: z.string().url().optional(),       // CF-fronted manifest, e.g. <base>/hls/stream.m3u8
OWNCAST_ADMIN_TOKEN: z.string().min(1).optional(),  // integration Bearer token (moderation/status; optional)
OWNCAST_CHANNEL_TITLE: z.string().default('Ministry Channel'),
```
Also add the four keys to `render.yaml` under `bibleway-api.envVars` as `sync: false` (except `OWNCAST_CHANNEL_TITLE` which can carry a value).

### 5.2 `backend/api/src/streams/streams.service.ts` — add channel status (cached, feed-safe)
The existing feed is feed-safe by rule #4 (no per-row network calls). Preserve that: **cache the Owncast status in-memory with a short TTL** so `GET /streams/channel` never fans out a network call per request, and the Home feed poll stays cheap.
```ts
// New shared type: MinistryChannel (see 5.4)
private channelCache: { at: number; value: MinistryChannel } | null = null;
private static readonly CHANNEL_TTL_MS = 15_000; // matches Home feed refetchInterval

/** Public: the always-on ministry channel. Status is cached ~15s; poll of
 *  Owncast /api/status happens at most once per TTL regardless of caller count. */
async getMinistryChannel(): Promise<MinistryChannel> {
  const base = this.config.get('OWNCAST_BASE_URL', { infer: true });
  const hlsUrl = this.config.get('OWNCAST_HLS_URL', { infer: true });
  if (!base || !hlsUrl) throw new ServiceUnavailableException('Ministry channel not configured');
  const now = Date.now();
  if (this.channelCache && now - this.channelCache.at < StreamsService.CHANNEL_TTL_MS) {
    return this.channelCache.value;
  }
  const status = await this.fetchOwncastStatus(base); // {online, viewerCount, streamTitle} | offline fallback
  const value: MinistryChannel = {
    id: 'ministry',
    title: this.config.get('OWNCAST_CHANNEL_TITLE', { infer: true }),
    subtitle: status.streamTitle ?? '',
    live: status.online,
    viewerCount: status.viewerCount ?? 0,
    playbackUrl: hlsUrl,      // CF-fronted HLS; append ?bwt=<jwt> client-side in Phase 2
    chatUrl: `${base.replace(/^http/, 'ws')}/ws`, // Phase 2 (Owncast chat) — else null
  };
  this.channelCache = { at: now, value };
  return value;
}

/** Proxy Owncast public consumer API GET /api/status (R2 §1). Never throws to caller. */
private async fetchOwncastStatus(base: string): Promise<{ online: boolean; viewerCount?: number; streamTitle?: string }> {
  try {
    const res = await fetch(`${base}/api/status`);
    if (!res.ok) return { online: false };
    return (await res.json()) as { online: boolean; viewerCount?: number; streamTitle?: string };
  } catch { return { online: false }; }
}
```
`StreamsService` must gain a `ConfigService<Env, true>` in its constructor (it currently injects `supabase`, `cf`, `agora`) — add `private readonly config: ConfigService<Env, true>`.

### 5.3 `backend/api/src/streams/streams.controller.ts` — add the route
```ts
/** The always-on ministry channel (Owncast). Public read; no per-user token in Phase 1. */
@Get('channel')
@UseGuards(OptionalAuthGuard)
channel(): Promise<MinistryChannel> {
  return this.streams.getMinistryChannel();
}
```
Route is `GET /api/v1/streams/channel` (global prefix `/api/v1`). Place it **before** `@Get(':id')` so `channel` is not captured as an `:id` param.

*(Optional moderation/webhook glue — defer to Phase 2/3):* accept Owncast webhooks (`STREAM_STARTED/STOPPED`, `USER_JOINED/PARTED`, `CHAT`) at a new `POST /streams/channel/webhook`. Owncast payloads have **no HMAC** (R2 §2), so add a BibleWay **shared-secret path token / allowlist** and verify it exactly the way `verifyWebhook` guards the CF path today.

### 5.4 `backend/packages/shared-types/src/video-stream.ts` — new type
```ts
/** The always-on Owncast "ministry channel" (singleton; not a live_streams row). */
export interface MinistryChannel {
  id: 'ministry';
  title: string;
  subtitle: string;
  live: boolean;
  viewerCount: number;
  /** CF-fronted HLS .m3u8 (append signed token client-side when gated). */
  playbackUrl: string;
  /** Owncast chat WebSocket (Phase 2); null if bridging to BibleWay chat. */
  chatUrl: string | null;
}
```

### 5.5 `backend/api/src/streams/streams.module.ts`
No structural change needed (`ConfigModule` is global in this app — `CloudflareStreamService`/`AgoraService` already inject `ConfigService`). Confirm `ConfigService` resolves in `StreamsService`; nothing else to register.

---

## 6. Frontend Changes

All in `Frontend/src/`. Reuse the existing `expo-av` HLS pattern (`expo-av` is already a dependency — used in `PodcastScreen.tsx`/`audioPlayer.ts`) and the rose-dawn `Glass`/`Kit` components.

### 6.1 API + hook
- `src/hooks/useLiveStreams.ts` — add:
```ts
export interface MinistryChannel { id: 'ministry'; title: string; subtitle: string; live: boolean; viewerCount: number; playbackUrl: string; chatUrl: string | null; }
export function useMinistryChannel() {
  return useQuery<MinistryChannel>({
    queryKey: ['ministry-channel'],
    queryFn: () => api.get<MinistryChannel>('/streams/channel'),
    refetchInterval: 30_000,   // gentle; backend already caches 15s
    retry: false,              // 503/404 when unconfigured ⇒ just hide the card
  });
}
```
- `src/services/queryClient.ts` — add `ministryChannel: () => ['ministry-channel'] as const` to `queryKeys`.

### 6.2 Home surface — pinned "Ministry Channel" card
In `src/screens/HomeScreen.tsx`, above the existing `SerifTitle "Streaming Now"` + `LiveBadge` section (around the `VideoHero`/list header), render a pinned card only when `useMinistryChannel()` returns data:
```tsx
const { data: ministry } = useMinistryChannel();
// ...in the sticky/hero header block, before "Streaming Now":
{ministry && (
  <MinistryChannelCard channel={ministry} onPress={() => navigate to MinistryChannelScreen} />
)}
```
Build `MinistryChannelCard` reusing `Kit` primitives already imported around the app (`SerifTitle`, `LiveBadge`, `GoldPill`, `PulseDot`, `GlassCircle`) and the rose-dawn palette so it reads as a first-class, always-present tile distinct from the ephemeral feed cards.

### 6.3 Dedicated viewer screen — `src/screens/MinistryChannelScreen.tsx`
Model it on `LiveViewerScreen.tsx` (reuse its `Header`, `CenterMessage`, `Fonts`, `Radii`, `Icon`, `GlassCircle`/`GoldPill`/`PulseDot`) but **swap the Agora engine for `expo-av` `Video`** pointed at the HLS manifest:
```tsx
import { Video, ResizeMode } from 'expo-av';
// ...
<Video
  source={{ uri: channel.playbackUrl }}   // Phase 2: `${playbackUrl}?bwt=${supabaseJwt}`
  resizeMode={ResizeMode.CONTAIN}
  shouldPlay
  useNativeControls={false}
  style={{ width, height: width * 9/16 }}
/>
```
iOS AVPlayer / Android ExoPlayer both play Owncast HLS natively (R2 §4). Show the existing offline/`CenterMessage` state when `channel.live === false`. Latency is 10–30 s and acceptable for a passive channel (SYNTHESIS §9, risk §9 below).

### 6.4 Chat — recommendation: **reuse BibleWay's existing chat, not Owncast's**
BibleWay already has `useLiveChat.ts`, `useWebSocket.ts`, and the `ChatFeed`/`ChatInputBar` (`src/components/elegant/LiveChat.tsx`). Owncast chat users are **anonymous tokens with no BibleWay identity** (R2 §5) — bridging them needs proxy-injected `X-Forwarded-User`, adding surface for little gain. **Recommend: point the Ministry screen's `ChatFeed`/`ChatInputBar` at BibleWay's own chat backend keyed by a fixed `ministry` room**, preserving real BibleWay identities and moderation.
*Alternative (one line):* connect directly to Owncast's `/ws` (`POST /api/chat/register` → `accessToken` → WS) if you want Owncast's built-in moderation and don't need BibleWay identities.

---

## 7. Data Model / Migration

**Recommended (config-singleton) path: NO Supabase migration required.** The channel is not a `live_streams` row; it is env-config + a cached status read. This keeps the feed query (`listLive`) and `live_streams` schema untouched.

**If product later wants the channel to also appear as a discoverable feed row / carry a denomination / analytics**, add a nullable `source` discriminator instead of a bespoke table:
```sql
-- migration: add stream source discriminator (default preserves all existing rows)
ALTER TABLE live_streams
  ADD COLUMN source text NOT NULL DEFAULT 'agora'
  CHECK (source IN ('agora','cloudflare','owncast'));
-- optional seed of the singleton ministry row (kept out of the ephemeral sweep):
-- INSERT a reserved row with source='owncast', status managed by getMinistryChannel, not sweepStaleStreams.
```
Then exclude `source='owncast'` from `sweepStaleStreams()` and from the default `listLive` query (or surface it pinned). Defer this until the config-singleton proves insufficient.

---

## 8. Phased Milestones

| Phase | Tasks | Acceptance criteria | Rough effort |
|---|---|---|---|
| **0 — Spike** | Deploy Owncast Docker on a $6 droplet (§3.2); push a test RTMP source via OBS; hardcode the `/hls/stream.m3u8` URL into a throwaway `expo-av` `Video` in the app. | Live video from Owncast plays in the BibleWay app on **one** real iOS **and** one Android device. Confirm cold-start/first-segment behavior after an RTMP (re)connect (SYNTHESIS §9 open Q). | **1–2 days** |
| **1 — Public MVP** | Cloudflare DNS+cache in front (§3.3); env vars (§5.1) + `render.yaml`; `getMinistryChannel()` + `GET /streams/channel` (§5.2–5.4, cached/feed-safe); `useMinistryChannel` hook; `MinistryChannelCard` on Home; `MinistryChannelScreen` (§6). Public, no gating. | Card shows on Home only when configured; tapping opens the screen; plays live HLS through Cloudflare; shows offline state when RTMP source is down; **feed poll issues ≤1 Owncast status call per 15 s** (verify no per-request fan-out). | **3–5 days** |
| **2 — Gating + chat** | Caddy JWT reverse proxy validating Supabase JWT on `/hls`,`/ws`,`/api`,`/embed` via **query/cookie token** (§4, Safari-WS caveat); app appends `?bwt=<jwt>`; wire `ChatFeed`/`ChatInputBar` to BibleWay's `ministry` chat room (§6.4); optional Owncast webhook route with shared-secret verify (§5.3). | Unauthenticated request to HLS/WS is **401**; signed-in BibleWay user plays + chats (incl. **Safari/iOS WebView if used**); chat messages carry real BibleWay identities. Security review of the proxy signed off. | **4–7 days** |
| **3 — Ops hardening** | `--restart unless-stopped` + host watchdog/systemd for the 24/7 ffmpeg source; uptime + CPU + egress monitoring/alerts; `/app/data` volume backup + snapshot; pinned image + documented upgrade (re-roll) runbook; Cloudflare cache tuning (segment TTLs, `.m3u8` no-cache); optional R2 S3 offload if egress grows (§3.3). | Instance auto-recovers after reboot/crash; alert fires on channel-offline > N min; documented one-command image upgrade; backup restore tested. | **2–4 days** |

---

## 9. Risks & Mitigations

| Risk (from SYNTHESIS §1/§7/§9) | Mitigation |
|---|---|
| **Single-maintainer / bus-factor** (Owncast ≈ one maintainer, ~2–3 releases/yr, mid backend-refactor) | Pin the image tag; document the **CF Stream live-leg fallback** (`CloudflareStreamService.createLiveInput` + `recording.mode:'automatic'`, near-zero net-new code per SYNTHESIS §6.2) so the channel can migrate to CF if Owncast stalls. Config-singleton design means swapping providers is just changing `OWNCAST_HLS_URL` → a CF HLS URL. |
| **Latency 10–30 s** | Acceptable — this is a *passive* one-way channel, not interactive (SYNTHESIS §9). Set the app's expectations (no "raise hand"/talk-back UI on this screen). Interactive stays on Agora. |
| **Cold start / first-segment after restart** (undocumented, R3 §4 / SYNTHESIS §9) | Mostly moot for always-on; confirm in Phase 0 that the app's offline→live transition is clean after an RTMP reconnect; show the `CenterMessage` offline state meanwhile. |
| **No native access control** (R2 §6) | Ship public in Phase 1; add Caddy JWT proxy in Phase 2 (§4) only if required. Treat as an explicit security-review surface; use query/cookie token (Safari-WS caveat). |
| **Ops burden** (provision/monitor/upgrade one box) | Bounded — it's **one** instance, not a fleet (the whole point vs the rejected multi-tenant path). Phase 3 adds restart policy, monitoring, backups, pinned-image upgrade runbook. |
| **Egress spikes if the channel goes viral** | Cloudflare fronts + caches `/hls`; add R2/S3 offload (R3 §3) to make origin traffic viewer-independent. ⚠ Confirm no surprising CF cap for very large concurrent audiences (SYNTHESIS §9). |
| **RTMP-port misuse for future multi-instance** (R3 §4) | Documented non-goal (§3.5); single instance only — never co-host multiple Owncasts behind one hostname. |
| **Owncast webhooks unsigned** (R2 §2) | If webhooks are used (Phase 2/3), add BibleWay shared-secret path token + allowlist, mirroring the CF HMAC guard. |

---

## 10. Cost Estimate (single-channel deployment)

| Item | Monthly |
|---|---|
| VPS (DO/Linode 2 vCPU–2 GB, always-on) | **~$12** (1 vCPU–2 GB ~$6 works with 1–2 ABR rungs; 2 vCPU gives headroom) |
| Cloudflare (DNS + CDN in front; free/Pro tier for a single hostname's HLS) | **~$0–20** (free plan covers a single channel's caching; egress via CF is not per-GB billed like AWS) |
| Object storage (optional R2 offload, only if egress grows) | **~$0–5** (R2 has generous free egress; segments are transient) |
| Cloudflare Stream / Agora for this channel | **$0** (not used for the ministry channel) |
| **Total** | **≈ $12–35 / month** |

This aligns with the research: R3 §1 (VPS from ~$5/mo, viewer scale offloaded to S3+CDN so the box cost is flat regardless of audience) and SYNTHESIS §4c/§5 (self-hosted single always-on channel is the one case where Owncast + cheap CDN beats CF's continuous delivery billing and Agora's never-stopping per-user-minute charge). Contrast: an always-on channel on CF Stream would bill delivery minutes continuously; on Agora it would bill per-viewer-minute 24/7 (SYNTHESIS §5) — both far above a flat ~$12–35/mo. **Excludes** the ministry operator's labor to produce content and the ~0.05–0.1 FTE to own the one box (Phase 3).

---

## 11. Test / Verification Plan

**Phase 0 — RTMP push + playback**
- Push RTMP from OBS to `rtmp://<host>:1935/live` with the stream key → confirm Owncast `/admin` shows "online" and `GET <base>/api/status` returns `{online:true}`.
- Play `<base>/hls/stream.m3u8` in the throwaway `expo-av` `Video` on **iOS + Android** physical devices; confirm video+audio, measure glass-to-glass latency (expect 10–30 s).
- Stop/restart the RTMP source; confirm the app recovers to live within one manifest window (cold-start check).

**Phase 1 — endpoint + viewer, feed-safe**
- `GET /api/v1/streams/channel` returns correct `live`/`viewerCount`/`playbackUrl`; returns 503/404 when `OWNCAST_*` unset (card hidden).
- **Feed-safety:** hammer `GET /streams/channel` (e.g. 50 rapid requests) and confirm via Owncast access logs that `/api/status` is hit **≤1× per 15 s** (cache working); confirm the Home feed poll is unaffected.
- Play through the Cloudflare-fronted URL on iOS + Android; kill the RTMP source and confirm the offline `CenterMessage` renders.

**Phase 2 — JWT gate + chat**
- Request HLS/WS **without** `?bwt` → **401**; with a valid Supabase JWT → 200 + playback.
- **Safari/iOS WebView** (if used): confirm chat WS connects with query/cookie token (validates the Authorization-header-on-WS caveat is avoided).
- Post a chat message as a signed-in user → appears in `ChatFeed` with the real BibleWay display name; moderation (hide/ban) works via BibleWay's chat backend.
- Expired/tampered JWT → 401 on both HLS and WS.

**Phase 3 — failover / ops**
- Reboot the droplet → Owncast container auto-restarts (`--restart unless-stopped`) and the 24/7 ffmpeg source resumes (systemd); app returns to live automatically.
- Kill the ffmpeg source → offline-alert fires within N minutes; app shows offline state.
- Perform a pinned-image upgrade per runbook → channel returns healthy; `/app/data` preserved. Restore `/app/data` from backup in a staging box to verify backups.
- Simulate CDN cache: confirm `.m3u8` is served with short/no cache and `.ts` segments are cached at the edge (check `cf-cache-status`).
