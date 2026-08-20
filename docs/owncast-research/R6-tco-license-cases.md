# R6 — Multi-tenant Patterns, Licensing, TCO & Real-World Evidence

Scope: how to serve *many independent broadcasters* with Owncast; the exact license and its commercial implications; who actually runs Owncast and project health; a rough monthly TCO comparison (self-hosted Owncast vs Cloudflare Stream vs Agora); and risk/recommendation inputs. Maps to BibleWay's Agora (interactive) + Cloudflare Stream (HLS/VOD) hybrid and its **many-to-many** requirement (see CURRENT_STATE.md).

## TL;DR
- **License = MIT** (Copyright 2020–2023 Gabe Kangas). Permissive: BibleWay may self-host, modify, embed and commercialize freely. **No copyleft**, no source-sharing obligation, no patent grant. Only duty: retain the MIT copyright/permission notice in copies/substantial portions [1][2]. This is the *most* favorable answer for a commercial app — licensing is **not** a blocker.
- **Owncast is architecturally single-channel and cannot be horizontally scaled**: the docs explicitly state "you can't just run more copies of Owncast for scale" [3]. Serving N simultaneous broadcasters therefore means **one instance per live broadcaster** — an orchestration problem BibleWay would own.
- Three multi-tenant patterns exist (instance-per-broadcaster; RTMP relay/fan-out via MediaMTX/nginx-rtmp; ingest-once→record+HLS without Owncast). The last two increasingly **route around** Owncast — for passive one-to-many congregations, Owncast's bundled chat/UI is the only thing it adds, and that's the piece that doesn't fit N ephemeral streams.
- **Project health:** effectively a single-maintainer project (Gabe Kangas). Real but slow cadence — v0.2.0 (Jan 2025) → v0.2.5 (Apr 2026), ~2–3 releases/yr, currently in a multi-release "backend refactor" holding pattern [4]. Meaningful **bus-factor risk** for a product dependency.
- **Scaling ceiling** is bandwidth, not CPU: CPU is flat regardless of viewers; per-viewer bandwidth is the constraint, mitigated by offloading HLS to S3 + CDN [3][5][6]. Documented real-world point: 325 concurrent viewers, 6h, on a home Celeron at 30% CPU (passthrough) [6].
- **TCO (rough estimates, below):** for passive large audiences, **Cloudflare Stream is the cheapest and lowest-ops** at both scales; **self-hosted Owncast/MediaMTX can beat CF on raw infra egress only if you use a cheap CDN AND ignore ops labor** — and ops labor (dynamic per-broadcaster provisioning) is the dominant hidden cost. **Agora is by far the most expensive for passive viewers** because it bills per user-minute; it earns its price only for true interactivity.
- **Verdict input:** Owncast is a good fit only for a *fixed, small number* of persistent ministry channels (e.g. a 24/7 denomination channel). It is a **trap** as a general replacement for BibleWay's N-broadcaster, ephemeral, many-to-many model.

---

## Findings

### 1. License (verified from repo)
- Fetched `owncast/owncast` `LICENSE`: it is the **standard MIT License**, "Copyright (c) 2020-2023 Gabe Kangas" [1]. Confirmed by GitHub repo metadata / community listings labeling Owncast MIT [2].
- Implications for BibleWay (a commercial app):
  - **Use / self-host / modify / redistribute / sublicense / sell:** all permitted. No fee, no per-seat, no field-of-use restriction.
  - **Copyleft:** none. Modifications and any BibleWay code that links to or wraps Owncast do **not** have to be open-sourced (contrast AGPL/GPL). Owncast being a standalone server you talk to over HTTP/RTMP makes this even less of a concern.
  - **Attribution:** the MIT copyright + permission notice must be retained in copies or "substantial portions" of the software (e.g. if you ship a modified Owncast binary/image). A pure API/embed integration where BibleWay doesn't redistribute Owncast's code has minimal obligation; keeping the notice with any bundled binaries is the safe practice.
  - **Patent grant:** MIT has **no** explicit patent license (unlike Apache-2.0). Low practical risk for a streaming server but worth noting for legal review.
  - **Warranty/liability:** none — "as is." BibleWay assumes all operational risk.
- Net: licensing is the *easiest* box to tick. It does not constrain any of BibleWay's options.

### 2. Multi-tenant patterns to serve many broadcasters
Owncast = one server → one channel → one chat → one HLS output. The docs are explicit that you cannot scale by cloning it [3]. So "N broadcasters" is solved *outside* Owncast. Three patterns:

**Pattern A — Instance-per-broadcaster, provisioned on demand**
- On `goLive`, spin up a dedicated Owncast container (own RTMP ingest key, admin, chat, HLS output, and subdomain/port); tear down on `end`. Requires an orchestrator (Docker/K8s/Nomad) + dynamic reverse proxy (Traefik/Caddy) for per-stream subdomain routing and RTMP port mapping, plus a control plane wired to BibleWay's `live_streams` lifecycle.
  - *Pros:* full native Owncast feature set per stream (chat, moderation, ActivityPub federation, branding); strong isolation per broadcaster; uses Owncast as intended (just many of it).
  - *Cons:* heavy. One ffmpeg transcode per instance (CPU scales with concurrent broadcasters); cold-start/provisioning latency on go-live; subdomain/TLS/port churn; no shared chat or central directory (BibleWay's feed must aggregate N instances — which it already does via its own DB); Owncast isn't built for ephemeral multi-tenant lifecycles. Highest ops burden. Bus-factor risk compounds because you're deep in one project's internals.

**Pattern B — RTMP relay / fan-out (MediaMTX or nginx-rtmp ingest once)**
- A single MediaMTX or nginx-rtmp cluster ingests *all* broadcasters via wildcard paths, then per stream: (a) relays/restreams into a per-broadcaster Owncast instance, and/or (b) records to VOD, and/or (c) also pushes to Cloudflare Stream. MediaMTX handles many concurrent paths in one lightweight process (passthrough = low CPU) [7][8]; nginx-rtmp natively supports push-to-multiple-destinations and pull/relay [8].
  - *Pros:* one ingest surface for N broadcasters; efficient passthrough; can record + package HLS itself; flexible fan-out (could feed both Owncast *and* CF during a migration).
  - *Cons:* if you still terminate into Owncast you retain Pattern A's per-instance cost; adds a network hop/latency; another component to run. Mostly useful as a *transition/bridge* layer.

**Pattern C — Ingest-once → record + HLS package, WITHOUT Owncast**
- MediaMTX / nginx-rtmp / ffmpeg ingests RTMP(S), packages (LL-)HLS, writes segments to S3-compatible storage fronted by a CDN, and records VOD. Wildcard paths make N broadcasters natural on a single service.
  - *Pros:* cleanest horizontal fit for one-to-many *passive* viewing; no per-broadcaster server; cheapest egress if fronted by a commodity CDN; matches BibleWay's congregation model.
  - *Cons:* you must rebuild chat, auth/signed access, viewer counts, DVR, moderation — i.e. **exactly what Cloudflare Stream + BibleWay's backend already provide.** Owncast is entirely dropped. This pattern is "self-host your own Cloudflare Stream," and is only worth it at very high sustained volume where egress savings beat build+ops cost.
- **Key insight:** Patterns B and C show that for BibleWay's many-to-many, mostly-passive model, Owncast's *distinctive* value (bundled single-channel chat/UI/federation) is the part that doesn't scale to N ephemeral broadcasters; the scalable part (RTMP→HLS packaging) is better served by MediaMTX or by the incumbent CF Stream.

### 3. Real-world evidence, project health, scaling ceilings
- **Who runs it:** primarily individual creators, Fediverse/ActivityPub streamers, small communities and self-hosters; Owncast federates into Mastodon and is listed across fediverse directories [9]. It's a well-regarded indie/self-host tool — *not* a platform known for powering large multi-tenant SaaS. No evidence of a production deployment running hundreds of orchestrated instances for independent broadcasters.
- **Maintainer / bus factor:** effectively **one primary maintainer, Gabe Kangas**, with community contributors. Active but small. This is the single biggest sustainability risk for depending on it as core infra [4].
- **Release cadence:** v0.2.0 (Jan 11 2025), v0.2.1 (Jan 17 2025), v0.2.2 (May 3 2025), v0.2.3 (May 10 2025), v0.2.4 (Jan 10 2026), v0.2.5 (Apr 11 2026) — roughly 2–3 releases/yr, and the project states 0.2.x will continue as "backend refactor" / behind-the-scenes work rather than major features [4]. Slow-moving.
- **Scaling ceiling (facts):**
  - CPU rule of thumb: ~1 CPU core per output quality being transcoded; **CPU is independent of viewer count** [5][6].
  - The real constraint is **bandwidth per viewer**; mitigation is offloading HLS segments to S3-compatible object storage + a CDN, after which "if you have 1 or 1000 viewers the video traffic from your server will be exactly the same" [3][5].
  - Chat scales to "thousands" but is single-server bound and can hit `ulimit`/"too many open files" — fixed only by a bigger box, not horizontal scaling [3].
  - Community data point: **325 concurrent viewers, 6+ hours, home Intel Celeron @ 1 Gbps up, ~30% CPU, passthrough** — i.e. a single instance easily serves one moderately-large congregation; the problem is *many instances*, not one big audience [6].
- **Complaints/known gaps relevant here:** no built-in horizontal scaling; no native multi-tenant/multi-channel; bandwidth cost pushed onto you; chat limits; feature velocity gated by refactor.

### 4. Rough TCO model (ESTIMATES — read the assumptions)

> **These are order-of-magnitude estimates, not quotes.** They assume Aug-2026 public list pricing and are sensitive to bitrate, CDN choice, and (for self-host) how you value engineering/ops labor. Treat ± a factor of ~2.

**Shared assumptions**
- Each broadcaster streams **2 h/week ≈ 8.66 h/month (≈ 520 min/month)**.
- Video ~ mid ABR. Egress basis from Owncast's own docs example: **~93.1 GB for 25 viewers over 2 h dual-quality ≈ ~3.7 GB per viewer per 2-h session** [5] (≈ 4 Mbps aggregate). Rounded to **~2–4 GB/viewer/session**.
- Scenario 1: **10 concurrent broadcasters × ~50 viewers = 500 viewers.** Monthly delivered ≈ 10 × 50 × 520 ≈ **260,000 viewer-minutes**; egress ≈ 500 viewers × 4.33 sessions × 3.7 GB ≈ **~8 TB/month**.
- Scenario 2: **100 concurrent broadcasters × ~100 viewers = 10,000 viewers** (same 2 h/week cadence). Monthly delivered ≈ 100 × 100 × 520 ≈ **5,200,000 viewer-minutes**; egress ≈ **~150–160 TB/month**. Self-host compute must handle **100 simultaneous transcodes** at peak.
- CDN egress unit cost varies wildly: commodity (Bunny/Cloudflare-class) **~$0.005–0.01/GB**; AWS CloudFront **~$0.085/GB**. Ops labor valued at a blended **~$100/hr** contractor-equivalent.

**Cloudflare Stream** — $1 / 1,000 min delivered; $5 / 1,000 min stored; ingest + live encoding + egress all free/included [10].
- S1: delivery ≈ 260k min → **~$260/mo**; recordings (10×520 min stored/mo) accrue ~$26/mo growing. **≈ $260–350/mo, ~0 ops.**
- S2: delivery ≈ 5.2M min → **~$5,200/mo**; storage ~$260/mo growing. **≈ $5,200–5,700/mo, ~0 ops.**

**Self-hosted Owncast (or MediaMTX) + object storage + CDN + ops**
- S1: ~10 concurrent transcodes → 3–5 VPS (4–8 vCPU, ~$40–80 each) ≈ **$150–400/mo compute**; object storage ~$10/mo; CDN egress 8 TB → **$40–80** (commodity) up to **~$680** (CloudFront). **Infra ≈ $200–1,100/mo**, **plus ops** (build + run per-broadcaster orchestration): realistically **0.1–0.3 FTE ≈ $1.5k–5k/mo equivalent** early on.
- S2: 100 simultaneous transcodes → many servers / K8s ≈ **$1,500–4,000/mo compute**; CDN egress ~150 TB → **$800–1,600** (commodity) to **~$13,000** (CloudFront); storage ~$50–100. **Infra ≈ $2,500–6,000/mo (commodity CDN)**, **plus ops ≈ 0.3–1 FTE ≈ $5k–15k/mo equivalent.**

**Agora (interactive live streaming)** — HD video ~$3.99 / 1,000 user-minutes; audio $0.99; Full-HD $8.99; 10,000 free min/mo [11]. Bills **every user-minute** (host + each viewer).
- S1: ~260k user-min HD → **~$1,000/mo** (after free tier). Broadcast-streaming audience tier is cheaper (~2× vs 4× coeff) but still per-user.
- S2: ~5.2M user-min HD → **~$20,000/mo.** Scales linearly and punishingly for passive audiences.

**Summary table (monthly, USD, rough estimates)**

| Option | Scenario 1 (10 bc × 50 viewers) | Scenario 2 (100 bc × 100 viewers) | Ops burden | Notes |
|---|---|---|---|---|
| **Cloudflare Stream** | **~$260–350** | **~$5,200–5,700** | ~none | Incumbent; usage-based, egress included; simplest |
| **Self-host Owncast/MediaMTX** (commodity CDN) | infra ~$200–1,100 **+ ops $1.5k–5k** | infra ~$2,500–6,000 **+ ops $5k–15k** | **high** | Cheaper raw egress at huge scale *only if* ops labor discounted; per-broadcaster orchestration is the real cost |
| **Self-host, AWS CloudFront egress** | infra up to ~$1.1k + ops | egress alone ~$13k + compute + ops | high | CloudFront egress makes self-host uncompetitive |
| **Agora (interactive HD)** | **~$1,000** | **~$20,000** | low (SaaS) | Justified only for true interactivity; worst $ for passive scale |

**Read of the table:** CF Stream wins on both cost-at-low/mid-scale AND ops. Self-host can undercut CF on *infra egress* at Scenario-2 scale with a cheap CDN, but the engineering to run 100 on-demand Owncast instances (or a custom MediaMTX+chat+auth stack) likely erases the saving unless BibleWay already has spare DevOps capacity and sustained high volume. Agora is a real-time premium you pay only where you need <1 s interactivity.

### 5. Risks & recommendation inputs
**Owncast is a good fit when:**
- BibleWay wants a **small, fixed set of persistent channels** (e.g. a 24/7 denomination/ministry channel, a flagship service) rather than N ephemeral broadcasters.
- It values **bundled chat + branding + Fediverse reach** out of the box and can run one long-lived instance per channel.
- A **low-cost, self-owned HLS path** for a few high-visibility streams is desirable, with S3+CDN offload.

**Owncast is a trap when (BibleWay's actual case):**
- Requirement is **arbitrary N simultaneous independent broadcasters, ephemeral, many-to-many** — this fights Owncast's single-channel design and forces you to build/operate instance-per-broadcaster orchestration.
- You need **sub-second interactivity** (co-host, raise-hand, talk-back) — Owncast is one-way HLS only (that's Agora's job; see R5).
- **Bus-factor / velocity** matters for core infra: single maintainer, slow refactor-phase cadence.
- Once you adopt MediaMTX/ingest-once patterns to make it multi-tenant, you've largely **rebuilt Cloudflare Stream** minus the managed CDN and reliability — undermining the reason to leave CF.

**Recommendation inputs:** Keep CF Stream as the HLS/VOD backbone (best TCO + zero ops for passive congregation viewing) and Agora for interactivity. Consider Owncast **only** as a supplementary, self-hosted option for a *handful* of persistent ministry channels where its chat/branding/federation add value — not as a replacement for either incumbent in the N-broadcaster path.

---

## Implications for BibleWay
- **License:** MIT removes any legal obstacle to adopting/modifying Owncast in the commercial app — but that's the *only* dimension where Owncast is unambiguously easy.
- **Vs the many-to-many requirement:** Owncast's single-channel model directly conflicts with BibleWay's core need. The only faithful mapping is instance-per-broadcaster (heavy ops) or routing around Owncast with MediaMTX (at which point CF Stream is the better-supported equivalent).
- **Vs the Agora + CF hybrid:** Owncast can't do Agora's sub-second interactive layer at all, and it competes with CF Stream's HLS/VOD only by making BibleWay operate CDN/egress/orchestration that CF currently handles for ~$260/mo at Scenario 1. Cost only tilts toward self-host at large sustained scale with cheap CDN and available DevOps.
- **Best niche:** a persistent 24/7 ministry channel (Option (c) in CURRENT_STATE) — one long-lived Owncast instance, S3+CDN offload, native chat — is the one place Owncast is genuinely attractive.

## Open questions / uncertainties
- **Scenario 2 concurrency semantics:** I assumed 100 broadcasters each 2 h/week for billed minutes, but sized self-host compute for 100 *simultaneous* transcodes at peak. If truly 100 concurrent at all times, delivered-minutes and CF/Agora costs rise proportionally.
- **Egress per viewer** is anchored to one Owncast docs example (~3.7 GB/viewer/2 h); real figure swings with chosen ABR ladder and average watch duration.
- **Agora tier:** the app currently uses *interactive* ILS tokens; a switch to Agora's cheaper *broadcast streaming* audience tier would lower the Agora numbers ~2×, still far above CF. (Owned by R5 — cross-reference.)
- **CDN unit cost** dominates self-host TCO and ranges ~17× between commodity CDN and CloudFront; a real quote is needed before trusting self-host savings.
- **CF Stream concurrency/soft limits** at 10,000 concurrent viewers not verified here (owned by R4).
- Whether Owncast's per-instance transcode can be avoided with passthrough (no ABR) for congregations — would cut self-host compute substantially but sacrifices adaptive quality on mobile.

## Sources
1. Owncast LICENSE (repo, MIT, © 2020-2023 Gabe Kangas): https://raw.githubusercontent.com/owncast/owncast/develop/LICENSE
2. Owncast GitHub repo: https://github.com/owncast/owncast
3. Owncast docs — Scaling: https://owncast.online/docs/scaling/
4. Owncast releases (cadence/versions): https://github.com/owncast/owncast/releases
5. Owncast docs — Resources & requirements (CPU/bandwidth): https://owncast.online/docs/resources-requirements/
6. Owncast discussion #1684 — maximum viewers (325 concurrent example): https://github.com/owncast/owncast/discussions/1684
7. MediaMTX (bluenviron) — SRT/WebRTC/RTSP/RTMP/LL-HLS server, record/proxy: https://github.com/bluenviron/mediamtx
8. Pi Stack — Self-Hosted Live Streaming: Owncast, MediaMTX & Nginx RTMP (2026): https://www.pistack.xyz/posts/self-hosted-live-streaming-owncast-mediamtx-nginx-rtmp-guide-2026/
9. Owncast on the Fediverse / who uses it: https://joinfediverse.wiki/Owncast ; https://fedidevs.org/projects/server-apps/owncast/
10. Cloudflare Stream pricing: https://developers.cloudflare.com/stream/pricing
11. Agora interactive live streaming pricing: https://docs.agora.io/en/interactive-live-streaming/overview/pricing
