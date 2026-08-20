# R5 — Real-time (WebRTC/SFU) vs One-way HLS: Latency, Interactivity, Cost

Lane: Agora (WebRTC/SFU, sub-second, bidirectional) vs Owncast/CF (one-way HLS). Can Owncast replace Agora? Latency + cost curves + verdict.

## TL;DR

- **Owncast CANNOT replace Agora.** They solve different problems. Owncast is a one-way, push-RTMP→HLS server with **text chat only** — no audience audio/video, no co-host, no raise-hand, no sub-second two-way. Moving BibleWay's *live interactive* worship to Owncast would delete every real-time participation feature Agora provides today. Owncast is a plausible replacement for **CF Stream's HLS/VOD delivery leg**, not for Agora. [1][2]
- **Latency is a category difference, not a tuning knob.** Agora ≈ 400 ms (real-world 200–800 ms). Owncast HLS default ≈ 10–30 s, tunable to "a handful of seconds" (~3–5 s best case) but **never sub-second** — Owncast's own docs say so. [3][4]
- **Agora is ~4–9× more expensive per viewer-minute than CF Stream** for one-way viewing (HD $3.99 vs CF $1.00 per 1,000 min; Full-HD $8.99 vs $1.00). That premium buys interactivity — which is *wasted* on passive sermon audiences. [5][6][7]
- **Agora bills per-participant by aggregate resolution** ($0.99 audio / $3.99 HD / $8.99 Full-HD / $15.99 2K per 1,000 min), so cost scales **linearly with concurrent viewers** — the classic SFU cost curve. CDN/HLS (CF or self-host) scales sub-linearly on egress. [5][6]
- **Crossover:** For passive one-to-many, CF Stream beats Agora ~4× immediately; self-hosted HLS beats CF only on cheap-egress hosts (~$0.01–0.02/GB) and loses to CF on AWS-class egress ($0.09/GB) once you add ops + the N-instance problem (see R3/R6). Agora only "wins" where you genuinely need <1 s bidirectional interaction. [5][6][8]
- **Nuance:** CF Stream now *also* offers **WebRTC (WHIP/WHEP), sub-second, unlimited viewers** — so if BibleWay wants to drop Agora for cost reasons, CF (not Owncast) is the realistic real-time alternative to evaluate. [9]
- **Verdict by use case:** interactive worship w/ participation → **keep Agora** (Owncast fails); one-to-many sermon broadcast → **CF LL-HLS or Owncast** both fine (Agora is overkill/overpriced); 24/7 ministry channel → **Owncast shines** (Agora can't do it economically, CF can but costs more).

## Findings

### 1. The fundamental split (fact)

| Dimension | WebRTC/SFU (Agora) | One-way HLS (Owncast / CF Stream) |
|---|---|---|
| Direction | Bidirectional | One-way (broadcaster→viewers) |
| Latency | Sub-second (~400 ms) | 3–30 s |
| Audience can send A/V | Yes (co-host, on-stage, raise-hand) | **No** — viewers are receive-only |
| Interactivity | Full (talk-back, guest hosts) | **Text chat only** (Owncast) [2] |
| Scale ceiling | Thousands per SFU mesh; needs relay network for 100k+ | Millions (CDN-native) [8] |
| Cost driver | Per-participant-minute (linear in viewers) | Egress/delivery (sub-linear, cacheable) |
| Transport | UDP/SRTP over private media network | HTTP segments over any CDN |

Owncast is architecturally a single-broadcaster RTMP/RTMPS(+SRT in newer builds)→ffmpeg→HLS pipeline with a built-in **text** chat/ActivityPub layer. It has **no WebRTC ingest for audience, no return audio/video path**. Owncast's docs explicitly warn: *"If you require real-time, video conferencing style latency you may want to look for a different solution that doesn't use HLS video, as this scaling and distribution model will never get to sub-second levels."* [4]

### 2. Latency table (glass-to-glass, verified)

| Path | Typical latency | Source |
|---|---|---|
| **Agora SD-RTN (WebRTC/SFU)** | **~400 ms** (real-world 200–800 ms) | Agora marketing / WebRTC norms [10] |
| WHIP/WHEP WebRTC ingest (CF, generic) | **Sub-second** (<1 s) | [9] |
| **CF Stream LL-HLS** | **~3 s** (min "as little as three seconds") | Cloudflare [11] |
| LL-CMAF | 2–5 s | [8] |
| **Owncast HLS (tuned)** | **~3–5 s** best case ("a handful of seconds, little room for error") | Owncast [3] |
| **Owncast HLS (default)** | **~10–30 s** | Owncast HLS model / [8] |
| Standard HLS | 15–30 s | [8] |

Key point: even *maximally tuned* Owncast (~3–5 s) is an order of magnitude slower than Agora (~0.4 s) and offers no return path. Lowering Owncast latency also raises segment-request load and CDN/object-storage cost, and reduces resilience to network blips. [3]

### 3. Cost curves — the crux

**Agora Interactive Live Streaming (pay-as-you-go, per 1,000 participant-minutes; free 10,000 min/mo):** [5][6]
- Audio only: **$0.99**
- Video HD (≤921,600 px): **$3.99**
- Video Full HD (≤2,073,600 px): **$8.99**
- Video 2K: **$15.99** · 2K+: **$35.99**
- Billed on **aggregate subscribed resolution per user**; "Standard-minute" conversion coefficients: audio 1:1, HD 1:4, Full-HD 1:9, 2K 1:16, 2K+ 1:36. Broadcast-Streaming mode discounts *audience* (receive-only) rates (e.g. audience audio ≈ $0.59), but BibleWay currently mints wildcard subscriber tokens in the standard interactive model. [5][6]

**Cloudflare Stream:** **$5 / 1,000 min stored** + **$1 / 1,000 min delivered**; ingest + encoding free; no per-viewer premium. [7]

**Self-hosted HLS egress (Owncast):** at HD ~2.5 Mbps, 1,000 viewer-minutes ≈ **~18.75 GB** egress.
- Cheap-egress host (~$0.01–0.02/GB): ~$0.19–$0.38 per 1,000 viewer-min → **beats CF's $1**.
- AWS-class egress ($0.09/GB): ~$1.69 per 1,000 viewer-min → **loses to CF**, before adding CPU (one ffmpeg transcode per live channel) and ops.

**Per-1,000-viewer-minute (HD, one-way) side by side:**

| Option | ~$ per 1,000 viewer-min (HD) | Relative |
|---|---|---|
| Self-host HLS, cheap egress | ~$0.19–0.38 | cheapest (but +ops, +N-instance problem) |
| **CF Stream delivery** | **$1.00** | baseline, zero ops, global CDN |
| Self-host HLS, AWS egress | ~$1.69 | worse than CF |
| **Agora HD** | **$3.99** | ~4× CF |
| **Agora Full-HD** | **$8.99** | ~9× CF |

**Crossover reading:**
- For **passive viewers**, Agora is **4–9× the cost of CF** and its interactivity is unused → economically indefensible for pure broadcast.
- **Self-hosting beats CF only** with genuinely cheap egress AND enough scale to amortize the ops/infra of running one Owncast instance per concurrent broadcaster (see R3/R6). At AWS-grade egress, CF is cheaper *and* zero-ops.
- Agora's linear per-participant model means cost pain grows exactly with congregation size; CDN paths flatten because segments cache. The more viewers per stream, the worse Agora looks vs HLS — **unless** those viewers actually talk back.

### 4. Can Owncast replace Agora? What BibleWay would LOSE

Replacing Agora with Owncast for the live leg would remove, for every stream:
1. **Sub-second latency** (0.4 s → 3–30 s) — kills call-and-response, live prayer, real-time Q&A feel.
2. **Any audience audio/video** — no congregant can be brought "on stage," no guest co-preacher, no raise-hand/talk-back. Owncast audiences are strictly receive-only. [1][2]
3. **Multi-host / co-host** on one channel — Owncast is single-broadcaster (one ingest → one channel). [1]
4. Real-time interaction reduced to **text chat only**. [2]

Owncast *does* match/replace the things BibleWay currently uses **CF Stream** for on the delivery side: HLS playback URLs, VOD/recording, and (with S3 + CDN) fan-out — that is R1/R4's territory. So the correct framing: **Owncast ≈ a self-hosted CF-Stream-delivery substitute, never an Agora substitute.**

## Implications for BibleWay

- **Live interactive worship (Agora's job today):** Keep Agora, or evaluate **CF Stream WebRTC (WHIP/WHEP, sub-second, unlimited viewers)** [9] as a cheaper managed real-time path — **not** Owncast. Owncast structurally cannot do bidirectional/sub-second.
- **One-to-many sermon broadcast (no talk-back):** Agora is 4–9× overpriced here. Either **CF LL-HLS (~3 s, zero ops)** or **Owncast** (self-host) serve this well. If BibleWay's "go live" streams are mostly passive congregations watching one preacher, most Agora spend is buying interactivity nobody uses — a real savings opportunity.
- **24/7 ministry channel:** Agora is economically impossible (per-participant-minute never stops); Owncast is purpose-built for a persistent channel and is the strongest Owncast fit. CF can do it but bills continuously on delivery.
- **Multi-broadcaster (many-to-many) reality:** Agora handles N simultaneous independent channels natively (channel = stream UUID). Owncast is **one instance = one channel**, so N live broadcasters = N Owncast instances/containers (see R3/R6 for orchestration + TCO). This alone makes Owncast a poor drop-in for BibleWay's many-to-many live model on the interactive path.
- **Recommendation shape:** Owncast is best positioned as a *supplementary* low-cost HLS/VOD or 24/7-channel option — competing with the **CF Stream** leg, not the Agora leg. Any "drop Agora to save money" decision points to **CF WebRTC** or accepting HLS latency + losing interactivity, not to Owncast.

## Open questions / uncertainties

- **Pricing freshness:** Agora and CF figures scraped Aug 2026 from vendor/aggregator pages; per-1,000-min list prices are stable historically but **verify against a current invoice / live pricing page before budgeting**. Agora broadcast-streaming *audience* discount rates ($0.59 audio cited) were only partially confirmed — confirm the receive-only audience video tier if BibleWay switches to broadcast (audience) role tokens, which could materially cut Agora cost for passive viewers. [5][6]
- **Self-host egress math** assumes HD 2.5 Mbps single rendition; ABR ladders and Full-HD raise GB/viewer and shift the crossover toward CF. Bitrate assumptions dominate the self-host vs CF comparison.
- **CF WebRTC (WHIP/WHEP)** latency/pricing/limits are R4's lane — I flag it as the real Agora alternative but did not price it here.
- **Owncast exact latency presets:** docs give qualitative "handful of seconds" to default 10–30 s but not a precise per-level table (R1 owns pipeline specifics).

## Sources

1. Owncast docs (overview / single-broadcaster model) — https://owncast.online/docs/
2. Owncast chat (text/ActivityPub) — https://owncast.online/docs/ (chat section)
3. Owncast reducing latency — https://owncast.online/troubleshoot/latency/
4. Owncast video/latency ("never sub-second") — https://owncast.online/docs/video/
5. Agora Interactive Live Streaming pricing — https://www.agora.io/en/pricing/interactive-live-streaming/
6. Agora broadcast/ILS pricing + Standard-minute coefficients — https://docs.agora.io/en/broadcast-streaming/overview/pricing
7. Cloudflare Stream pricing — https://developers.cloudflare.com/stream/pricing
8. Low-latency protocols (WebRTC vs LL-HLS vs CMAF, scale ceilings) — https://floatleftinteractive.com/guides/low-latency-streaming-protocols-webrtc-vs-ll-hls-vs-cmaf-2026-guide/
9. Cloudflare WebRTC WHIP/WHEP sub-second, unlimited viewers — https://blog.cloudflare.com/webrtc-whip-whep-cloudflare-stream/
10. WebRTC vs HLS latency (Ant Media demo / norms) — https://antmedia.io/webrtc-samples/webrtc-vs-hls/
11. Cloudflare Stream LL-HLS open beta (~3 s) — https://blog.cloudflare.com/cloudflare-stream-low-latency-hls-open-beta/
