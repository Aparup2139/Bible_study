# Owncast Evaluation — Final Synthesis for BibleWay

*Synthesizer report. Compacts R1–R6 against BibleWay's real architecture (Agora interactive + Cloudflare Stream HLS/VOD hybrid, per CURRENT_STATE.md). Decision-oriented; a downstream Planner turns Section 7 into an executable plan. Uncertain/stale figures are flagged inline as ⚠.*

---

## 1. Executive Summary (the verdict)

- **Owncast cannot replace Agora.** It is one-way RTMP→HLS with ~10–30 s latency (best-tuned ~3–5 s, never sub-second) and **text chat only** — no audience A/V, no co-host, no raise-hand, no talk-back. Agora's sub-second bidirectional path is a category Owncast does not implement. [R1, R5]
- **Owncast can only partially replace Cloudflare Stream's HLS/VOD**, and does so *more heavily*: no native VOD/recording, no signed-URL/JWT access control, and — critically — **one instance = one channel**, so it loses CF's zero-ops N-tenancy. [R1, R2, R4]
- **The structural mismatch is decisive:** Owncast is architecturally single-broadcaster and "you can't just run more copies of Owncast for scale." BibleWay is many-to-many (arbitrary N simultaneous independent hosts). N broadcasters ⇒ **N Owncast instances/containers** BibleWay must provision, route, upgrade, monitor, and tear down. [R1, R3, R6]
- **CF Stream is the incumbent's strength:** each `createLiveInput` is an independent channel with **no per-input fee**; N simultaneous broadcasters cost nothing extra to host, only aggregate watch-minutes + stored recordings bill. This is CF's biggest advantage over Owncast. [R4]
- **Cost:** CF wins on both price and ops at BibleWay's scale. Owncast's egress *can* undercut CF only with a cheap CDN AND at high sustained volume AND if you discount ops labor — and the per-broadcaster orchestration is the dominant hidden cost. Agora is the interactivity premium (~4–9× CF per viewer-minute), justified only where interaction is actually used. [R5, R6]
- **License is a non-issue:** MIT (© 2020–2023 Gabe Kangas). Free to self-host, modify, embed, commercialize; only duty is retaining the notice in redistributed binaries. No copyleft, no patent grant. [R6]
- **Sustainability risk:** effectively a single-maintainer project, ~2–3 releases/yr, currently in a multi-release backend-refactor holding pattern. Real bus-factor risk for core infra. [R6]
- **Mobile publish gap:** Owncast ships no mobile broadcast SDK. BibleWay's in-app `react-native-agora` publish would have to be replaced with a third-party native RTMP publisher — a downgrade for the "phone as broadcaster" path. Mobile *playback* is trivial (HLS via existing `expo-av`). [R1, R2]
- **Where Owncast genuinely shines: one persistent 24/7 "ministry channel."** A single long-lived instance (S3 + CDN offload, bundled chat/branding) is a real fit that Agora can't do economically and CF bills continuously for. [R1, R3, R5, R6]
- **Recommendation:** Keep Agora + Cloudflare Stream. Adopt Owncast **only** as a supplementary single always-on ministry channel. Do **not** use it (or MediaMTX instance-per-channel) for the many-to-many go-live path.

---

## 2. What Owncast Is (compact)

A **single-binary, self-hosted Go server** = "personal live video + web chat." One process bundles: **RTMP ingest → ffmpeg transcode → HLS packager → web viewer/admin UI → WebSocket chat**. Modeled explicitly as *one broadcaster → one channel → one chat room*; no accounts, no multi-channel/multi-tenant concept. [R1, R3]

- **License:** MIT — fully permissive, not a blocker. [R6]
- **Ingest:** **RTMP only** (port 1935). RTMPS not native (needs TLS proxy), SRT backlog, WHIP/WebRTC "not planned." [R1]
- **Transcode:** real ffmpeg re-encode to adaptive-bitrate rungs; **~1 CPU core per output quality**, independent of viewer count. HW accel (NVENC/QuickSync/VA-API) needs bare metal — not usable on typical VPS. [R1, R3]
- **Output/latency:** standard HLS (H.264/AAC, `.m3u8`+`.ts`); glass-to-glass ~10–30 s typical, ~3–5 s best-tuned, **never sub-second** (docs say so). [R1, R5]
- **Access control:** **none native** — HLS manifest is public/unsigned; private/paid streams require a custom reverse proxy. Long-standing unimplemented gap (incl. a church use case, issue #4344). [R2]
- **VOD/recording:** none out of the box; live segments cleaned in real time. [R1]
- **Scaling:** viewers scaled via **S3-compatible storage + CDN offload**, NOT by cloning instances. CDN-frontable (Cloudflare/Bunny/Fastly). [R1, R3]
- **Mobile:** no publish SDK; playback trivial via HLS. [R1, R2]

---

## 3. Decision Matrix — Owncast vs Cloudflare Stream vs Agora

Ratings: ✅ strong / 🟡 partial-or-caveated / ❌ weak-or-absent.

| Criterion | Owncast (self-host) | Cloudflare Stream | Agora | One-line note |
|---|---|---|---|---|
| **Latency** | 🟡 ~10–30 s (best ~3–5 s) | 🟡 HLS ~30 s; LL-HLS <10 s ⚠beta; WHIP <1 s ⚠beta | ✅ sub-second (~400 ms) | Owncast never sub-second; Agora is the only GA real-time path. [R1,R4,R5] |
| **Interactivity** | ❌ text chat only, receive-only audience | ❌ HLS one-way (WHIP beta lacks recording/count) | ✅ co-host, raise-hand, talk-back | Only Agora does two-way. [R5] |
| **Multi-broadcaster / N-tenancy** | ❌ 1 instance = 1 channel → N instances | ✅ N live inputs, no per-input fee, zero orchestration | ✅ N channels natively | The decisive axis; CF/Agora native, Owncast inverts it. [R1,R3,R4] |
| **VOD / recording** | ❌ none built-in | ✅ auto-VOD (`recording.mode:'automatic'`; ⚠live>7d truncated) | 🟡 cloud recording (add-on) | CF is the recording backbone today. [R1,R4] |
| **Signed / private access** | ❌ none native; reverse-proxy DIY | ✅ RS256 JWT ≤24h, ≤5 accessRules (BibleWay uses this) | ✅ server-minted RTC tokens (BibleWay uses this) | Owncast's biggest security-integration gap. [R2,R4] |
| **Mobile publish** | ❌ no SDK; 3rd-party native RTMP | 🟡 RTMPS/SRT/WHIP; needs native module in RN | ✅ `react-native-agora` in-app today | Owncast is a regression for phone-as-broadcaster. [R1,R4] |
| **Mobile playback** | ✅ HLS via expo-av/ExoPlayer/AVPlayer | ✅ HLS/DASH, same players | ✅ RtcSurfaceView | All fine; Owncast reuses existing expo-av path. [R2,R4] |
| **Cost / TCO** | 🟡 infra ~$200–1.1k (S1) / ~$2.5–6k (S2) **+ heavy ops** | ✅ ~$260–350 (S1) / ~$5.2–5.7k (S2), ~0 ops | ❌ ~$1,000 (S1) / ~$20,000 (S2) | CF cheapest+lowest-ops; Owncast's hidden cost is orchestration; Agora is the interactivity premium. [R5,R6] |
| **Ops burden** | ❌ high (provision/route/upgrade/monitor fleet) | ✅ ~none (managed) | ✅ low (SaaS) | RTMP port/IP routing + per-instance state are net-new surface. [R3,R6] |
| **License / lock-in** | ✅ MIT, self-owned, no lock-in | 🟡 proprietary managed (usage lock-in) | 🟡 proprietary SaaS (SDK lock-in) | Only Owncast is self-owned; also only one with bus-factor risk. [R6] |

*Cost figures: Scenario 1 = 10 broadcasters × ~50 viewers; Scenario 2 = 100 broadcasters × ~100 viewers. See Section 5.*

---

## 4. The Three Roles — Does Owncast Replace Each Leg?

**(a) Replace Cloudflare Stream's HLS/VOD delivery? — PARTIAL, and heavier.**
Owncast can emit HLS and be CDN-fronted, and RN playback drops straight into BibleWay's existing `expo-av` path. But it **loses**: (1) native VOD/recording (CF gives auto-VOD), (2) signed-URL/RS256 access control matching `require_signed` (Owncast manifest is public — gating means a bespoke reverse-proxy JWT layer), and (3) zero-ops N-tenancy (CF = many live inputs, no per-input fee; Owncast = one CPU-provisioned instance per broadcaster). Net: you'd rebuild capabilities BibleWay already gets managed. [R1, R2, R4]

**(b) Replace Agora's interactive real-time layer? — NO.**
Owncast is one-way HLS (~10–30 s), receive-only audience, **text chat only**, single-broadcaster. It deletes every real-time participation feature (sub-second latency, audience A/V, co-host, raise-hand, talk-back). If BibleWay ever wants to drop Agora for cost, the realistic managed alternative is **CF WebRTC (WHIP/WHEP)** ⚠beta — *not* Owncast. [R1, R5]

**(c) Supplement the stack? — YES, in exactly one niche.**
A **single persistent 24/7 ministry channel**: one long-lived Owncast instance, S3+CDN offload (reusing BibleWay's Cloudflare relationship), bundled chat/branding. Agora can't do a 24/7 channel economically (per-user-minute never stops); CF can but bills continuously on delivery. This is the one place Owncast is genuinely attractive. [R1, R3, R5, R6]

---

## 5. Cost / TCO Synthesis (reconciling R4/R5/R6)

Order-of-magnitude, Aug-2026 list pricing, ±~2×. Assumes ~2 h/week/broadcaster, mid ABR (~3.7 GB/viewer/2 h session per Owncast's own docs example).

**Baselines (R4):** CF = `delivered_min × $0.001 + stored_min × $0.005`; **ingest/encode/egress free**, **no per-broadcaster/per-ingest fee**. Per 1,000 HD viewer-minutes: self-host cheap-egress ~$0.19–0.38 · **CF $1.00** · self-host AWS-egress ~$1.69 · Agora HD $3.99 · Agora Full-HD $8.99. [R4, R5]

| Option | Scenario 1 (10 bc × 50 viewers, ~260k viewer-min, ~8 TB) | Scenario 2 (100 bc × 100 viewers, ~5.2M viewer-min, ~150 TB) | Ops |
|---|---|---|---|
| **Cloudflare Stream** | **~$260–350/mo** | **~$5,200–5,700/mo** | ~none |
| **Self-host Owncast/MediaMTX** (commodity CDN) | infra ~$200–1,100 **+ ops ~$1.5k–5k (0.1–0.3 FTE)** | infra ~$2,500–6,000 **+ ops ~$5k–15k (0.3–1 FTE)** | **high** |
| Self-host, AWS CloudFront egress | up to ~$1.1k + ops | egress alone ~$13k + compute + ops | high |
| **Agora (interactive HD)** | **~$1,000/mo** | **~$20,000/mo** | low (SaaS) |

**Honest read:**
- **CF wins on cost AND ops** at both scales. It only loses on raw infra egress at Scenario-2 scale *with a cheap CDN AND if ops labor is discounted to zero* — and the per-broadcaster orchestration is precisely the labor you can't discount.
- **Owncast's true cost is orchestration/ops**, not egress. Once you add MediaMTX/ingest-once to make it multi-tenant, you've largely **rebuilt Cloudflare Stream** minus the managed CDN — undermining the reason to leave CF.
- **Agora is the interactivity premium** (~4–9× CF/viewer-min, linear in viewers). Indefensible for passive audiences; correct only where interaction is genuinely used. Switching passive congregations to Agora's *broadcast-streaming audience* tier would cut Agora ~2× (still far above CF) — a separate savings lever worth noting. ⚠ (audience-tier rate only partially confirmed). [R5, R6]

---

## 6. Primary Recommendation (decisive)

**Keep the incumbent hybrid; add Owncast only as a supplement.**

1. **Keep Agora** for the interactive live (go-live) path — sub-second, bidirectional, many-to-many native. Nothing here replaces it. If cost pressure arises, evaluate **CF WebRTC (WHIP/WHEP)** ⚠beta as the managed real-time alternative, and/or move passive congregations to Agora's cheaper broadcast-audience token tier — **not** Owncast.
2. **Keep Cloudflare Stream** for HLS delivery, VOD/recording, and signed access. If a fully-managed HLS mirror of live is wanted, **activate CF's dormant live leg** — the `CloudflareStreamService` wrapper already implements everything; you only flip `recording.mode:'automatic'` and have `goLive()` call `createLiveInput`. Near-zero net-new code.
3. **Adopt Owncast ONLY as a single always-on 24/7 "ministry channel"** — one long-lived instance, S3+CDN (Cloudflare) offload, bundled chat, integrated into BibleWay as a special always-available `channel`. **MediaMTX / instance-per-channel orchestration is overkill and out of scope** for the many-to-many go-live path.

**Conditions under which broader Owncast adoption would (not) make sense:**
- **Would make sense** only if ALL hold: BibleWay needs a *small fixed set* of persistent channels (not N ephemeral hosts); it has spare DevOps capacity to own instance orchestration; sustained volume is high enough that cheap-CDN egress savings exceed build+ops cost; and it accepts the single-maintainer bus-factor risk.
- **Would NOT make sense** (BibleWay's actual case) for arbitrary N simultaneous ephemeral broadcasters, any need for sub-second interactivity, or any expectation of zero-ops N-tenancy — Owncast fights its own single-channel design there and you end up rebuilding CF Stream.

---

## 7. What the Planner Should Implement

**Scope — the 24/7 Owncast ministry channel, integrated into BibleWay:**
- **Provisioning:** one long-lived Owncast instance (Docker, `/app/data` persistent volume). Rotate default `admin/abc123` creds; seed stream key + config at provision time. S3-compatible object storage for HLS segments; **Cloudflare fronting** the origin/bucket (origin-pull), with the websocket override set so chat still connects.
- **Access gating (optional):** a reverse proxy (Nginx/Caddy) validating a **BibleWay JWT** before proxying `/hls/*`, `/ws`, `/api/*`, `/embed/*`. Note the Safari-WebSocket-Authorization-header caveat if using Basic auth; prefer token/cookie gating.
- **Backend:** introduce a `channel` concept distinct from ephemeral `live_streams` rows (a persistent, always-on entity). Endpoints to expose channel status/metadata; consume Owncast **webhooks** (`STREAM_STARTED/STOPPED`, `USER_JOINED/PARTED`, `CHAT`) — add BibleWay's own **shared-secret verification** since Owncast payloads have no HMAC.
- **RN client:** a viewer screen reusing the existing **`expo-av` HLS** player pointed at the channel manifest (`/hls/stream.m3u8` or CF-fronted URL), plus the **existing chat** UI (map BibleWay users to Owncast via proxy-injected `X-Forwarded-User`, or bridge to BibleWay's own chat).

**Explicitly OUT of scope:**
- Replacing Agora (interactive go-live path) with Owncast.
- Instance-per-broadcaster / MediaMTX fan-out for the many-to-many live feed.
- Mobile RTMP-publish native module for Owncast (the ministry channel is broadcast via OBS/ffmpeg from a fixed source, not phone-in-app).
- Migrating VOD/recording or signed playback off Cloudflare Stream.

**Open questions / risks the plan must handle:**
- **Cold start / go-live latency** for any provisioned instance (est. seconds→tens of seconds; needs a prototype) — mostly moot for an always-on channel, but confirm first-segment behavior after restarts.
- **Access gating correctness** — the reverse-proxy JWT layer is a net-new security-review surface; Safari WS caveat; ensure `require_signed`-equivalent semantics.
- **Ops & monitoring** — health/CPU/egress for the instance; upgrade path (re-roll image); per-instance secret + backup of `/app/data`.
- **Single-maintainer risk** — pin versions, have a fallback (CF live leg) ready if Owncast stalls.
- **Chat identity mapping** — Owncast users are anonymous tokens; mapping BibleWay identities needs proxy injection or a chat bridge.
- ⚠ **CF concurrency cap unknown** — if the ministry channel or CF live leg is expected to draw very large concurrent audiences, confirm CF soft limits with sales.

---

## 8. Consolidated Sources (deduped)

**Owncast — official docs & site**
- Docs home / overview — https://owncast.online/docs/
- Configuration (ports 8080/1935, admin, single-instance) — https://owncast.online/docs/configuration/
- Video encoding (ffmpeg, ABR, passthrough, latency warning) — https://owncast.online/docs/video/
- Broadcasting software (OBS/ffmpeg/Restream/Zoom/Jitsi) — https://owncast.online/docs/broadcasting/
- Storage (S3-compatible offload) — https://owncast.online/docs/storage/
- Scaling ("can't just run more copies") — https://owncast.online/docs/scaling/
- Resources & requirements (CPU/bandwidth, viewer-independence) — https://owncast.online/docs/resources-requirements/
- Codecs / hardware acceleration — https://owncast.online/docs/codecs/ ; https://owncast.online/troubleshoot/hardware-usage/
- Reducing latency ("handful of seconds") — https://owncast.online/troubleshoot/latency/
- CDNs guide (origin-pull, S3-origin, websocket override) — https://owncast.online/docs/cdns/
- Embed & playback (HLS manifest, iframe, chat embeds) — https://owncast.online/docs/embed/
- Social / Fediverse federation — https://owncast.online/docs/social/
- SSL & HTTP proxies (reverse-proxy, WS) — https://owncast.online/docs/sslproxies/
- APIs latest reference — https://owncast.online/api/latest/
- Build on top of Owncast — https://owncast.online/thirdparty/ ; APIs & access tokens — https://owncast.online/thirdparty/apis/ ; Webhooks — https://owncast.online/thirdparty/webhooks/
- API overview ("early days") — https://owncast.online/docs/api/
- Install quickstart — https://owncast.online/quickstart/installation/ ; Container — https://owncast.online/quickstart/container/
- FAQ (server type/cost) — https://owncast.online/faq/
- v0.0.12 release (Lower Latency Playback) — https://owncast.online/releases/owncast-0.0.12/

**Owncast — GitHub / community**
- Repo — https://github.com/owncast/owncast ; LICENSE (MIT) — https://raw.githubusercontent.com/owncast/owncast/develop/LICENSE ; Releases (cadence) — https://github.com/owncast/owncast/releases
- Docker Hub — https://hub.docker.com/r/owncast/owncast
- Issue #980 (SRT), #3429 (WHIP not planned), #988 (RTMPS), #504 (latency), #489 (password), #630 (private), #4344 (church multi/private), #3642 (multiple streams) — https://github.com/owncast/owncast/issues/{980,3429,988,504,489,630,4344,3642}
- Discussion #3546 (multiple channels), #1684 (325 viewers), #2645 (reverse-proxy Basic auth / Safari WS) — https://github.com/owncast/owncast/discussions/{3546,1684,2645}
- Cloudron forum "Owncast Multi-User Mode?" — https://forum.cloudron.io/topic/8925/owncast-multi-user-mode
- hugowncast — https://codeberg.org/johanvandegriff/hugowncast
- Fediverse listings — https://joinfediverse.wiki/Owncast ; https://fedidevs.org/projects/server-apps/owncast/

**Cloudflare Stream**
- Pricing — https://developers.cloudflare.com/stream/pricing/
- Start live — https://developers.cloudflare.com/stream/stream-live/start-stream-live/ ; Watch live — https://developers.cloudflare.com/stream/stream-live/watch-live-stream/ ; Simulcast — https://developers.cloudflare.com/stream/stream-live/simulcasting/
- WebRTC WHIP/WHEP beta — https://developers.cloudflare.com/stream/webrtc-beta/ ; blog — https://blog.cloudflare.com/webrtc-whip-whep-cloudflare-stream/
- LL-HLS open beta — https://blog.cloudflare.com/cloudflare-stream-low-latency-hls-open-beta/ ; announcement — https://blog.cloudflare.com/low-latency-hls-support-for-cloudflare-stream/
- Use your own player — https://developers.cloudflare.com/stream/viewing-videos/using-own-player/ ; Securing (RS256 JWT) — https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/ ; Direct uploads — https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/ ; Live viewer count — https://developers.cloudflare.com/stream/getting-analytics/live-viewer-count/

**Agora & comparative**
- Agora ILS pricing — https://www.agora.io/en/pricing/interactive-live-streaming/ ; docs pricing (Standard-minute coefficients) — https://docs.agora.io/en/interactive-live-streaming/overview/pricing ; https://docs.agora.io/en/broadcast-streaming/overview/pricing
- WebRTC vs HLS latency norms — https://antmedia.io/webrtc-samples/webrtc-vs-hls/
- Low-latency protocols guide — https://floatleftinteractive.com/guides/low-latency-streaming-protocols-webrtc-vs-ll-hls-vs-cmaf-2026-guide/
- MediaMTX — https://github.com/bluenviron/mediamtx
- Pi Stack self-host guide (2026) ⚠ unreliable on Owncast transcoding — https://www.pistack.xyz/posts/self-hosted-live-streaming-owncast-mediamtx-nginx-rtmp-guide-2026/

---

## 9. Preserved Caveats (stale / uncertain — do not treat as settled)

- ⚠ **CF LL-HLS is open beta** ~3 years running; "<10 s" / "~3 s" are blog claims, **no GA date or latency SLA**. [R4, R5]
- ⚠ **CF WHIP/WebRTC is beta** — no recording, no live viewer count, no analytics, no WHIP→HLS fallback; GA timing unknown. Blocks it as a clean Agora replacement today. [R4, R5]
- ⚠ **CF free-allowance claim is stale** — the repo note that Pro/Business bundle free storage/delivery minutes is **NOT on the 2026 pricing page**; confirm on the billing dashboard. [R4]
- ⚠ **CF concurrency cap unknown** — docs publish no cap on live inputs or concurrent viewers; verify soft/account limits with Cloudflare sales before assuming hundreds of simultaneous inputs / very large audiences. [R4, R6]
- ⚠ **Agora pricing needs verification** — list prices scraped Aug 2026; verify against a current invoice. The cheaper broadcast-streaming *audience* video tier (~$0.59 audio cited) was only partially confirmed — confirm before modeling a passive-viewer switch. [R5, R6]
- ⚠ **Owncast latency specifics uncertain** — docs give qualitative ranges ("handful of seconds" → default 10–30 s), no authoritative per-level seconds table; figures synthesized from docs + user reports. [R1, R5]
- ⚠ **Owncast cold-start time** ("Go Live" → first playable segment) for any provisioned design is undocumented — needs a prototype. [R3]
- ⚠ **Owncast webhook signing** — as-read docs show no HMAC/payload signature; confirm against current changelog before relying on it. [R2]
- ⚠ **Owncast ~200 MB baseline RAM** figure is from an unofficial 2026 guide, not official docs; the same guide **wrongly** claims Owncast has "no built-in transcoding" — official docs contradict this (ffmpeg transcode is the default). [R1, R3]
- ⚠ **RTMPS-via-proxy reliability** (issue #988) — a working proxy path reported but with viewer-playback failures; unclear if fully resolved. [R1]
