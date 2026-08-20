# R1 — Owncast Core Architecture & Streaming Pipeline

Scope: what Owncast is; ingest protocols; ffmpeg transcoding & CPU cost; HLS output/latency; adaptive bitrate; the single-broadcaster model; broadcast software & mobile push; storage; CDN fronting; hard architectural constraints. Maps to BibleWay's Agora (interactive) + Cloudflare Stream (HLS/VOD) hybrid and the many-broadcaster requirement.

## TL;DR
- **Owncast is a single-binary, self-hosted "personal live streaming + web chat server"** written in Go. It is explicitly modeled as *one broadcaster → one channel*: one Owncast instance = one stream + one chat room + one viewer page. There is no built-in multi-channel/multi-tenant concept. [1][2]
- **Ingest is RTMP only.** RTMPS (TLS) is **not** natively supported (open/unresolved; needs a TLS-terminating proxy) [8], **SRT is backlog/not implemented** [6], and **WHIP/WebRTC ingest was closed "not planned"** [7]. Default RTMP port 1935, default stream key `abc123`. [3][5]
- **Transcoding is ffmpeg-based and real (not a passthrough relay).** Owncast re-encodes the RTMP source into short HLS segments and can emit **multiple adaptive-bitrate variants** (resolution/bitrate/framerate configurable). Passthrough exists but is "generally not recommended." [4]
- **CPU is the cost driver, not viewers:** ~**1 CPU core per output-quality variant** (rule of thumb; can be less). "CPU usage is the same regardless of how many viewers you have." [10] Hardware encode (NVENC / Intel QuickSync / VA-API) is supported but requires bare-metal GPU access, drivers, and ffmpeg ≥4.1.5 — "advanced," and **not usable on typical VPS**. Apple VideoToolbox not documented. [11]
- **Output is standard HLS** (H.264/AAC, `.m3u8` + `.ts` segments). **Glass-to-glass latency is high: ~10–30s typical**, tunable down toward "a handful of seconds" via a latency-buffer setting; an **experimental "Lower Latency Playback"** mode exists (web player, non-WebKit only) but Owncast is **not LL-HLS/real-time** and the docs tell you to use a different tool if you need conferencing-style latency. [4][12][13]
- **Broadcast software = anything that speaks RTMP** (OBS, Streamlabs, ffmpeg, Restream, Zoom, Jitsi). **A phone can push RTMP** in principle (any RTMP-capable app/lib), but Owncast ships **no mobile broadcast SDK/app**, and RN would need a third-party RTMP publisher (native module) — this is a real gap vs BibleWay's current in-app Agora publish. [5]
- **Storage:** live segments live on local disk and are **cleaned up in real time** (minimal disk, no auto-VOD/archive by default). Optional **S3-compatible object storage** offloads segment serving/bandwidth (not archival). [9][10]
- **CDN fronting works** (Cloudflare/Bunny/any origin-pull CDN) — either in front of the Owncast origin host or in front of the S3 bucket; a websocket-override keeps chat working. This is how Owncast scales viewers. [14]

## Findings

### 1. What Owncast is / the single-broadcaster model
- Official description: "a free and open source live video and web chat server for use with existing broadcasting software." The pitch is *own your channel* — you point OBS at a server you control. [1]
- Architecturally it is **one Go process** bundling: RTMP ingest → ffmpeg transcode → HLS packager → static web front-end (viewer page + admin at `/admin`, default creds `admin`/`abc123`) → integrated websocket chat. [2][3]
- **One instance serves exactly one stream/channel/chat room.** There is no notion of accounts, multiple simultaneous broadcasters, or per-user channels inside a single instance. This is the defining constraint (see Implications; R3/R6 cover the multi-instance workaround). [1][2]
- Written in Go, ~200 MB RAM idle footprint (vs ~30–50 MB for bare relays like MediaMTX/nginx-rtmp) — because it bundles a full creator UI + admin + chat, not just protocol relay. [15]

### 2. Ingest protocols
| Protocol | Status | Note |
|---|---|---|
| **RTMP** | ✅ Supported (only native ingest) | `rtmp://server:1935/live`, stream key appended as `/live/<key>` [3][5] |
| **RTMPS (TLS)** | ❌ Not native | Open issue #988; needs stunnel/nginx TLS proxy in front, with caveats [8] |
| **SRT** | ❌ Backlog | Issue #980 open since 2021, "big feature," no timeline [6] |
| **WHIP / WebRTC ingest** | ❌ Not planned | Issue #3429 closed as "not planned"/stale (even after OBS 30 added WHIP) [7] |

Implication: the only well-supported, secure-ish path is plain RTMP (optionally TLS-proxied). No low-latency WebRTC ingest.

### 3. Transcoding & CPU cost
- ffmpeg transcodes the RTMP source into "short, individual video segments" served as HLS. **Adaptive bitrate** is supported by defining multiple output variants (each with its own resolution/bitrate/framerate). [4]
- **Passthrough** (no re-encode) is possible to save CPU but "generally not recommended and can often cause playback issues." [4] (Note: a 2026 third-party guide mischaracterizes Owncast as passthrough-only [15] — that contradicts the official docs; treat Owncast as a real transcoder.)
- **CPU scaling:** roughly **1 core per output quality**; more variants = more CPU. Framerate strongly affects CPU (default 24 fps; 30/60 cost more). **"CPU usage is the same regardless of how many viewers you have"** — viewers cost bandwidth, not CPU. [4][10]
- **Hardware acceleration:** NVIDIA NVENC (Kepler+), Intel QuickSync, VA-API (Intel/AMD on Linux). Requires: direct hardware access (**not a VPS**), correct drivers/libs, and ffmpeg ≥ 4.1.5 built with support. Docs call it advanced; "very little of what is required has anything to do with Owncast." Apple VideoToolbox not documented. [11]

### 4. Output: HLS, segments, latency, LL-HLS
- Output is standard **HLS** (H.264 video / AAC audio; `.m3u8` playlist + `.ts` segments) — plays in any HLS player. [4]
- **Latency is the weak point.** HLS is inherently buffered; users report "+10 seconds or more" even locally [16]. A **latency-buffer setting** trades stability for delay; docs say at the lowest setting "you may be able to get down to only a handful of seconds," but the practical range is roughly **~10–30s typical, ~4–8s aggressive**. [12][13]
- An **experimental "Lower Latency Playback"** mode (added v0.0.12) is opt-in in the web player, works only on non-WebKit browsers, and needs a stable fast stream; docs warn to disable it if buffering. [13]
- **No production LL-HLS / CMAF chunked-transfer** and no WebRTC egress. Docs explicitly: if you need "real-time, video conferencing style latency … look for a different solution that doesn't use HLS." [4]

### 5. Broadcast software & mobile push
- Supports **any RTMP encoder**: OBS / Streamlabs OBS, ffmpeg, Restream.io, Zoom, Jitsi named explicitly. [5]
- **Mobile broadcast:** Owncast provides **no first-party mobile broadcasting app or SDK**. A phone *can* push RTMP via generic apps (e.g. Larix Broadcaster) or a native RTMP library, and OBS Mobile exists — but for a React Native app there is **no drop-in publisher**; you'd need a native RN RTMP-publish module (e.g. a HaishinKit/rtmp wrapper). This is a meaningful integration gap vs BibleWay's current `react-native-agora` in-app publish. [5] (inference on RN specifics; R2 owns embedding/playback)

### 6. Storage & retention
- **Local disk by default:** live HLS segments are written and **cleaned up in real time** during the stream, so disk need is minimal. Not designed as an archival/VOD store — **no automatic recording/VOD out of the box** (contrast CF Stream, which BibleWay already uses for VOD/recordings). [9][10]
- **S3-compatible object storage** (any S3 API endpoint; path-style supported since v0.0.11, e.g. Oracle Cloud) can hold the live segments so viewers pull from the bucket instead of the origin — offloads bandwidth/CPU-free. Positioned for live distribution, **not permanent archive**. [9]

### 7. CDN fronting
- **Yes — CDN fronting is the recommended scaling path.** Two patterns: [14]
  1. **CDN in front of the Owncast origin host** (origin-pull): create `owncast-origin.example.com`, point CDN at it, public DNS → CDN, and set the websocket override in admin so chat still connects to the origin.
  2. **CDN in front of the S3 bucket:** bucket is origin; set the CDN hostname as the serving endpoint in Owncast storage settings.
- No specific vendor mandated — **Cloudflare / BunnyCDN / Fastly** all work as generic origin-pull CDNs. Caveat: for small audiences a CDN can *add* latency; benefit grows with audience size, and the origin must still have adequate bandwidth for the CDN to pull. [14]

### 8. Hard architectural constraints (that matter for a many-broadcaster mobile app)
1. **One instance = one channel/broadcaster/chat room.** N simultaneous independent broadcasters ⇒ **N Owncast instances/containers** (orchestration, ports/subdomains, provisioning) — R3/R6 territory. This is the single biggest structural mismatch with BibleWay's many-to-many model.
2. **RTMP-only, high-latency HLS.** No WebRTC/SFU → **cannot match Agora's sub-second, interactive** experience (co-host, raise-hand, two-way). Owncast is one-way lecture/broadcast only.
3. **Transcode is CPU-bound; HW accel needs bare metal** → per-broadcaster compute cost is real and doesn't cleanly fit a serverless/VPS auto-scale model.
4. **No native mobile publish SDK** → RN broadcast side would need custom native RTMP publisher.
5. **No built-in VOD/recording or auth/paywall** in the core pipeline (recording, signed URLs, access control are what CF Stream gives BibleWay today; R2 covers Owncast auth/embed depth).

## Implications for BibleWay
- **As a replacement for Agora (interactive real-time): No.** Owncast is RTMP→HLS with ~10–30s latency and no WebRTC egress/interactivity. It cannot deliver the sub-second, two-way "congregation" interactivity Agora provides. Owncast is a one-way broadcast tool.
- **As a replacement for Cloudflare Stream (HLS delivery/VOD): partial and operationally heavier.** Owncast *can* produce HLS and be fronted by a CDN, but (a) it needs a running, CPU-provisioned instance **per live broadcaster** (CF Stream is fully managed and scales to N live inputs with no server), and (b) it has **no built-in VOD/recording, signed-URL/JWT, or access control** matching CF's — those are core to BibleWay's `require_signed`/recordings flows. You'd be rebuilding capabilities BibleWay already gets managed.
- **As a supplementary option: plausible for a low-cost, always-on ministry "channel."** A single Owncast instance is a genuinely good fit for **one persistent 24/7 broadcast channel** (e.g. a flagship ministry stream) with chat, fronted by Cloudflare, at low marginal cost. It does **not** fit BibleWay's core "any number of hosts live simultaneously, each a row in `live_streams`" model without per-stream instance orchestration.
- **Multi-broadcaster reality:** BibleWay's `live_streams` many-to-many design maps to **one Owncast container per active stream** — dynamic provisioning, routing, and teardown that Agora (channels) and CF Stream (live inputs) give you for free. This is the crux of the evaluation and is R3/R6's lane.
- **Mobile:** BibleWay broadcasts from an Expo/RN app today via `react-native-agora`. Owncast offers no equivalent publish SDK; you'd bolt on a native RTMP publisher and lose the interactive path — a clear downgrade for the "phone as broadcaster" use case.

## Open questions / uncertainties
- **Exact latency-buffer level values in seconds:** docs describe levels qualitatively ("handful of seconds" at lowest) but I found no authoritative per-level seconds table; the ~10–30s figure is synthesized from docs + user reports [12][13][16]. (uncertain / version-dependent)
- **Default HLS segment length / count:** not explicitly stated on the pages fetched (commonly ~2–4s segments in HLS; Owncast tunes this with the latency buffer). (fact-gap)
- **VideoToolbox (macOS/Apple silicon) HW encode:** not documented — unclear if supported. [11]
- **RTMPS via proxy reliability:** issue #988 reports a working proxy path but viewer playback failing; unclear if fully resolved in current releases. [8]
- Whether any recording/VOD plugin exists in current versions beyond manual ffmpeg capture — not confirmed in core docs (R2/R6 may refine).

## Sources
1. Owncast docs home / overview — https://owncast.online/docs/
2. Owncast quickstart / architecture (admin, ports, single instance) — https://owncast.online/docs/configuration/
3. Owncast configuration (ports 8080 HTTP / 1935 RTMP, stream key vs admin) — https://owncast.online/docs/configuration/
4. Owncast Video encoding (ffmpeg transcode, ABR variants, passthrough, HLS, latency warning) — https://owncast.online/docs/video/
5. Owncast Broadcasting software (OBS/ffmpeg/Restream/Zoom/Jitsi; RTMP endpoint & stream key) — https://owncast.online/docs/broadcasting/
6. GitHub issue #980 — SRT ingest support (backlog, unimplemented) — https://github.com/owncast/owncast/issues/980
7. GitHub issue #3429 — WebRTC/WHIP via broadcast-box (closed, not planned) — https://github.com/owncast/owncast/issues/3429
8. GitHub issue #988 — RTMPS/TLS ingest not native (proxy workaround) — https://github.com/owncast/owncast/issues/988
9. Owncast Object/S3 storage — https://owncast.online/docs/storage/
10. Owncast Resources & requirements (1 core/output, CPU independent of viewers, real-time segment cleanup, bandwidth examples) — https://owncast.online/docs/resources-requirements/
11. Owncast Codecs / hardware acceleration (NVENC, QuickSync, VA-API; bare-metal, ffmpeg ≥4.1.5) — https://owncast.online/docs/codecs/ and https://owncast.online/troubleshoot/hardware-usage/
12. Owncast Reducing Latency ("handful of seconds") — https://owncast.online/troubleshoot/latency/
13. Owncast v0.0.12 release (experimental Lower Latency Playback) — https://owncast.online/releases/owncast-0.0.12/
14. Owncast CDNs guide (origin-pull, S3-origin, websocket override) — https://owncast.online/docs/cdns/
15. Pi Stack, "Self-Hosted Live Streaming: Owncast, MediaMTX & Nginx RTMP in 2026" (RAM footprint; note: mislabels Owncast transcoding) — https://www.pistack.xyz/posts/self-hosted-live-streaming-owncast-mediamtx-nginx-rtmp-guide-2026/
16. GitHub issue #504 — "How to reduce latency?" (+10s reported) — https://github.com/owncast/owncast/issues/504
