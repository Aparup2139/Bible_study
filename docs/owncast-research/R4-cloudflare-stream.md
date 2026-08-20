# R4 — Cloudflare Stream: capabilities, pricing & limits (2025–2026)

*Incumbent-provider fact sheet for the Owncast evaluation. All figures verified against
`developers.cloudflare.com/stream` on 2026-08-09. Cross-references BibleWay's
`CloudflareStreamService` (see CURRENT_STATE.md).*

## TL;DR
- **Pricing is flat & two-variable:** **$5 / 1,000 minutes stored/month** (prepaid) + **$1 / 1,000 minutes delivered/month** (usage-based). **Ingest, encoding, and egress/bandwidth are always free** — bandwidth is bundled into "delivered." [1]
- **No free storage/delivery tier and no hard subscription minimum on the current pricing page** — you pay from the first minute stored/delivered. The repo notes' claim that "Pro/Business include 100 free storage min + 10,000 free delivery min" is **NOT on the 2026 pricing page** — treat it as stale/incorrect. [1] (flag)
- **Delivery is billed on minutes *delivered*, not per-viewer** → 100 concurrent viewers × 60 min = 6,000 delivered min = **$6** for that event (worked examples below). This is the number to compare against Owncast's CDN-egress model.
- **Live ingest:** RTMPS (`rtmps://live.cloudflare.com:443/live/`) and **SRT** (caller mode) are GA; **WHIP/WebRTC is beta** (sub-second, but no recording/no viewer count/no analytics, and WHIP must pair with WHEP — no WHIP→HLS). [2][3]
- **Latency:** standard HLS ≈ **~30s** glass-to-glass; **LL-HLS (open beta)** targets **<10s** via `?protocol=llhls`. WHIP/WHEP beta is **sub-second** but a separate, non-recorded path. [4][5][6]
- **Delivery:** auto HLS + DASH over Cloudflare's global CDN; plays natively in AVPlayer/ExoPlayer/`expo-av`; **signed playback via RS256 JWT** (≤24h expiry, ≤5 accessRules for IP/country) — exactly what BibleWay already mints. [7][8]
- **Limits worth flagging:** live recordings **truncated to 7 days**; direct one-time upload **200 MB** cap (tus above that); **simulcast to ≤50 destinations** per input; **≤1,000 signing keys**; **no documented cap** on live inputs or concurrent viewers. [2][8][9]

## Findings

### 1. Live inputs & ingest protocols
- **Create live input:** `POST /accounts/{acct}/stream/live_inputs` with `recording.mode` = `automatic` (watchable + auto-recorded) or `off` (default; not recorded, not playable). Response carries `rtmps.url`, `rtmps.streamKey`, `srt.*`, `webRTC.url`, `status`. [2]
- **Ingest protocols:** **RTMPS** at `rtmps://live.cloudflare.com:443/live/` and **SRT** (Stream supports **caller mode only**) are GA. **WHIP (WebRTC ingest) is beta.** [2][3]
- **Codec reqs for live ingest:** H.264 + AAC, closed GOPs, keyframe interval 2–8s (OBS defaults comply). [2]
- **Key params:** `requireSignedURLs` (default false), `timeoutSeconds` (drop tolerance before a *new* video is cut, default 0), `deleteRecordingAfterDays` (30–1096), `preferLowLatency` (LL-HLS beta), `recording.allowedOrigins`, `recording.hideLiveViewerCount`. [2]
- **Recording of live → VOD:** with `recording.mode:'automatic'` the finished broadcast becomes an on-demand video ~60s after it ends; list via `GET /live_inputs/{uid}/videos` and filter `status.state === 'ready'`. **A live video >7 days is truncated to 7 days.** [2]
- **Simulcast / restream out (Stream Connect):** a live input can be pushed on to **YouTube, Twitch, Facebook, X, etc. via RTMP**, up to **50 concurrent destinations per input**, outputs toggled individually mid-broadcast. Configured via `POST /live_inputs/{id}/outputs` or dashboard. [10]
- **Concurrency / soft limits:** docs state **no explicit cap** on number of live inputs or simultaneous broadcasts; enterprise/volume handled via sales. (No published ceiling — verify with Cloudflare if planning hundreds of simultaneous inputs.) (flag)

### 2. Latency
| Path | Typical glass-to-glass | Status | Notes |
|---|---|---|---|
| Standard HLS/DASH | **~30 s** | GA | Default; segment-based. [5] |
| **LL-HLS** | **<10 s** (many cases) | **Open beta** (since Sept 2023; no GA date) | Enable per-input for beta, then `?protocol=llhls` on the manifest for custom players; needs CBR H.264, 2s keyframes, no B-frames. [4][5][6] |
| **WHIP/WHEP (WebRTC)** | **sub-second (<1 s)** | **Beta** | No recording, no live viewer count, no analytics; WHIP+WHEP must be paired (no WHIP→HLS/DASH). [3] |
- LL-HLS remaining in **open beta for ~3 years** is a maturity/risk signal — the sub-10s number is not a GA-guaranteed SLA. (flag)

### 3. Delivery & playback
- **Formats:** HLS (`/manifest/video.m3u8`) and DASH (`/manifest/video.mpd`) off `https://customer-<CODE>.cloudflarestream.com/<INPUT_ID|VIDEO_ID>/...`; built-in iframe player also available. INPUT_ID = "always current broadcast" (channel page); VIDEO_ID = a specific recording. [7]
- **CDN:** delivered over Cloudflare's global edge; bandwidth included in "delivered" pricing (no separate egress bill). [1]
- **Players:** any HLS/DASH player — AVPlayer (iOS), ExoPlayer (Android), `expo-av`/`expo-video` in RN. Note AVPlayer/ExoPlayer **do not** natively play SRT/RTMPS (irrelevant for HLS playback). [7]
- **Manifest caveat:** "Do not cache, proxy, or store manifests; read them directly from Stream." [7]
- **Chromecast:** prefer DASH (Chromecast can't take separated audio/video that HLS uses). [5]

### 4. Signed URLs / RS256 JWT (BibleWay already does this)
- One-time `POST /stream/keys` → `{ id, pem, jwk }` (base64; **≤1,000 keys/account**, rotatable/revocable). [8]
- Per-request JWT: header `{ alg:'RS256', kid }`, payload `{ sub:<uid>, kid, exp, nbf?, downloadable?, accessRules? }`. **`exp` ≤ 24h** from signing time. [8]
- `accessRules`: **≤5 rules**, first-match-wins, types `any` / `ip.src` / `ip.geoip.country`, action `allow`/`block`. [8]
- URL: token replaces the UID → `https://customer-<CODE>.cloudflarestream.com/<TOKEN>/manifest/video.m3u8`. [8]

### 5. VOD / direct uploads & storage
- **Direct creator upload:** `POST /direct_upload` → `{ uploadURL, uid }`; client PUTs the file **without** the API token, **≤200 MB**. Above 200 MB or on flaky links use **tus** resumable (`POST /stream?direct_user=true`). [9]
- **Storage** billed at $5/1,000 stored minutes regardless of resolution/file size — only duration counts. `maxDurationSeconds` is reserved against storage until true-up. [1][9]

### 6. Analytics / viewer count
- `GET https://customer-<CODE>.cloudflarestream.com/<INPUT_ID>/views` → `{ liveViewers: N }` (token-free poll); `/lifecycle` → `{ isInput, live, videoUID }`. Suppressible via `recording.hideLiveViewerCount`. [11]
- Analytics are **light** (a viewer integer + GraphQL bulk API) — no QoE/rebuffering metrics. **No documented hard cap on concurrent viewers.** [11]

### Pricing — worked examples for BibleWay
Base rates: **$1 / 1,000 delivered min**, **$5 / 1,000 stored min**, ingest/encode/egress **free**. [1]

**A. 100 concurrent viewers × 60 min live event**
- Delivered = 100 × 60 = **6,000 min → $6.00** for the event. Storage of its recording (60 min) ≈ **$0.30/mo** while retained. Ingest/encode = **$0**.

**B. 10 broadcasters × 2 hrs/week**
- Ingest/encode of all 10 streams = **$0** (ingest is free). Cost is driven purely by *who watches*.
- Recording storage: 10 × 120 min/wk × ~4.3 wk ≈ **5,160 new stored min/mo → ~$25.80/mo**, growing with the archive (a full year's archive ≈ 62,000 min → ~$310/mo). Set `deleteRecordingAfterDays` to cap this.
- Delivery: say each broadcast draws avg 50 concurrent viewers for the full 120 min → 10 × 120 × 50 = 60,000 delivered min/wk ≈ **258,000/mo → ~$258/mo**.
- **Combined B ≈ ~$284/mo** (delivery $258 + first-month storage $26), scaling linearly with watch-minutes and archive size.

**Key modelling insight for the comparison:** CF Stream cost = `delivered_minutes × $0.001 + stored_minutes × $0.005`. Delivery scales with *viewer-minutes*, storage with *library size*. There is **no per-broadcaster or per-ingest fee**, so N simultaneous independent broadcasters cost nothing extra to *host* — only their aggregate watch-time and stored recordings bill. This is the crucial contrast with Owncast (one container + CDN egress per broadcaster).

## Implications for BibleWay
- **Multi-broadcaster fit (the critical requirement):** CF Stream is inherently N-tenant — each `createLiveInput` is an independent channel with its own ingest key and HLS URL, and there's no per-input fee. BibleWay's live feed of many simultaneous hosts maps 1:1 onto many live inputs with **zero orchestration**. This is CF's biggest structural advantage over Owncast (one instance = one channel).
- **What `CloudflareStreamService` already exercises vs. the platform:**
  | BibleWay method | CF capability | State |
  |---|---|---|
  | `createLiveInput` (RTMPS+SRT) | `POST /live_inputs`, `recording.mode` | Wired; **not called on go-live** (goLive sets `cf_live_input_id:null`, uses Agora) |
  | `createDirectUpload` | `POST /direct_upload` (≤200 MB) | **Actively used** (VOD/podcast uploads) |
  | `hlsUrl(uid, signed)` | `/manifest/video.m3u8` (+token) | Actively used |
  | `signToken` | RS256 JWT, ≤24h, ≤5 accessRules | Actively used (matches CF spec exactly) |
  | `verifyWebhook` | HMAC-SHA256 `Webhook-Signature: time=,sig1=` (video-ready) | Wired |
  | `/lifecycle`, `/views` polling | token-free live status + `liveViewers` | Wired (feed-safe) |
  | `disableLiveInput`, `listLiveInputVideos` | `enabled:false`, `/videos` recordings | Wired; recording `mode:'off'` today → no auto-VOD |
- **Latency reality check:** BibleWay's interactive layer is **Agora WebRTC (sub-second)**. CF's equivalent sub-second path is **WHIP/WebRTC beta** — but it has **no recording, no viewer count, no analytics** and can't fall back to HLS, so it is **not** a drop-in for Agora's interactive congregation use case. CF's *recorded/broadcast* path is HLS (~30s) or LL-HLS beta (<10s). So the Agora↔CF-WebRTC swap R5 evaluates is blocked by CF-WebRTC's beta feature gaps, not just latency.
- **Owncast comparison anchor:** vs Owncast, CF Stream trades a usage bill (delivery $1/1k min + storage $5/1k min) for **zero ops, free ingest/encode, built-in global CDN, native multi-tenancy, signed URLs, and auto-VOD**. Owncast's appeal is only where CF's delivery bill at BibleWay's viewer scale would exceed self-host infra+ops — R6's TCO model should use the CF formula above as the baseline.
- **To fully activate CF's live leg** BibleWay would only need to flip `recording.mode` to `automatic` and have `goLive()` call `createLiveInput` — the wrapper already implements everything else.

## Open questions / uncertainties
- **Free allowance:** repo notes claim Pro/Business plans bundle free storage/delivery minutes; the **2026 pricing page shows none**. Likely stale — confirm on the current billing dashboard. (flag)
- **LL-HLS GA:** still labelled beta ~3 years on; no published GA date or latency SLA. The "<10s" is a blog claim, not a docs guarantee. (flag)
- **Hard concurrency limits:** docs publish **no** cap on live inputs or concurrent viewers; unknown soft/account limits for hundreds of simultaneous inputs — needs a Cloudflare sales/support confirmation for BibleWay's projected many-hosts scale.
- **Regional availability / mobile caveats:** no region restrictions surfaced in docs (global CDN). Mobile *playback* is fine via HLS in AVPlayer/ExoPlayer/expo; mobile *broadcasting* needs a native RTMP/WHIP module (dev build) — a client-side, not CF, constraint.
- **WHIP/WebRTC beta → GA timing** and whether recording/analytics will be added — unknown; blocks any plan to use it as the Agora replacement.

## Sources
1. Pricing — https://developers.cloudflare.com/stream/pricing/
2. Start a live stream — https://developers.cloudflare.com/stream/stream-live/start-stream-live/
3. WebRTC (WHIP/WHEP) beta — https://developers.cloudflare.com/stream/webrtc-beta/
4. LL-HLS open beta — https://blog.cloudflare.com/cloudflare-stream-low-latency-hls-open-beta/
5. Watch a live stream — https://developers.cloudflare.com/stream/stream-live/watch-live-stream/
6. LL-HLS announcement (latency figures) — https://blog.cloudflare.com/low-latency-hls-support-for-cloudflare-stream/
7. Use your own player (HLS/DASH, LL-HLS `?protocol=llhls`, manifest caching) — https://developers.cloudflare.com/stream/viewing-videos/using-own-player/
8. Securing your Stream (RS256 JWT, keys, accessRules) — https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/
9. Direct creator uploads (200 MB cap, tus) — https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/
10. Simulcasting / Stream Connect (≤50 outputs) — https://developers.cloudflare.com/stream/stream-live/simulcasting/
11. Live viewer count (`/views`) — https://developers.cloudflare.com/stream/getting-analytics/live-viewer-count/
