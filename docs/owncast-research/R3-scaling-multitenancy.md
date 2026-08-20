# R3 — Owncast Deployment, Scaling & Multi-Tenancy (the make-or-break for BibleWay)

Scope: install/config, server sizing, viewer scaling via S3/CDN, and the core
N-simultaneous-independent-broadcasters problem. Fact = from Owncast docs / maintainer.
Inference = my analysis, flagged.

## TL;DR
- **Owncast is architecturally single-broadcaster.** One instance = one stream key = one channel = one broadcaster. This is confirmed by the lead maintainer and by Owncast's own docs, and there is **no roadmap item** to change it [1][7][8][11].
- **The only supported path to N broadcasters is N instances.** Maintainer gabek: *"people just run multiple instances of Owncast… Owncast just isn't built for that, and would require almost everything to be changed to support something like that"* [7]. Cloudron: *"Owncast is single user software. You can run as many instances as you like"* [11].
- **Install is trivial per instance** (one binary or an 87 MB Docker image, ports 8080 + 1935, one `/app/data` volume) — but that simplicity is per-channel, so BibleWay's many-to-many model turns it into a fleet-orchestration problem BibleWay would have to build and operate [3][5][6][9].
- **Transcode sizing: ~1 CPU core per quality rung** (official rule of thumb); *"each stream output quality adds significant CPU usage"* [4]. CPU is **independent of viewer count** [4][14].
- **Viewer scaling is done with S3-compatible object storage + CDN, NOT by cloning instances.** Docs are explicit: *"you can't just run more copies of Owncast for scale"* — you offload egress so *"1 or 1000 viewers, the video traffic from your server will be exactly the same"* [2][10].
- **Real-world single-instance viewer datapoint:** 325 concurrent viewers, 6+ hrs, 1024 kbps passthrough, on a Celeron 3.5 GHz / 1 Gbps box at 30% CPU. Maintainer: viewers are **bandwidth-bound, not CPU-bound** [12].
- **A key routing gotcha for multi-instance:** HTTP/HLS (8080) can be subdomain-routed by a reverse proxy, but **RTMP ingest (1935) is raw TCP and cannot be host/subdomain-routed** — each instance needs a unique port or a TCP/SNI load-balancer mapping. This is real control-plane work [inference from 6][9].
- **Realistic ceiling (inference):** instance-per-stream is viable at ~10 concurrent broadcasters, heavy-but-doable at ~100 (needs K8s/autoscaling + S3/CDN + a real ops team), and **not viable at 1000** — it becomes rebuilding a managed video PaaS, which is exactly what CF Stream/Agora already provide.

## Findings

### 1. Installation & configuration (per instance)
| Item | Value | Source |
|---|---|---|
| Single-binary install | `curl -s https://owncast.online/install.sh \| bash` — downloads the binary + ffmpeg if absent | [3] |
| Docker image | `owncast/owncast:latest`, ~86.8 MB | [5][9] |
| Docker run | `docker run -v $(pwd)/data:/app/data -p 8080:8080 -p 1935:1935 owncast/owncast:latest` | [5] |
| Supported OS | Publicly accessible **Linux or macOS** server; Linode/DigitalOcean-class VPS from $5/mo. Windows not an official target | [8] |
| Default web/HTTP+HLS port | **8080** (also serves the HLS manifest/segments & web UI) | [6] |
| Default RTMP ingest port | **1935** | [6] |
| Config surface | Primarily the **admin UI at `/admin`** (default creds `admin` / `abc123`); `-webserverport` CLI flag; ports changeable in admin (restart required). Config/state persisted in **SQLite under `/app/data`** — no first-class env-var config file | [6] |
| Persistent state | The `/app/data` volume holds the DB, stream key, admin password, and all settings; must survive restarts/migrations | [5] |
| Dependencies | ffmpeg (bundled by installer / baked into image) | [3] |

Implication: provisioning a fresh instance means not just starting a container but also **seeding its stream key + config** (either via the admin API — R2's lane — or by pre-baking the SQLite DB). Default creds `admin/abc123` must be rotated per instance.

### 2. Server sizing
- **Transcode CPU:** *"generally… one CPU core for each quality you're offering, that's a good rule of thumb… can be less."* Each added output rung *"adds significant CPU usage and slows down the overall generation of video segments."* Lower frame rate → less CPU [4].
- **Passthrough mode** disables re-encode (≈0 transcode CPU) but is *"an advanced setting that most people should not use"* — stream compatibility becomes whatever OBS/the phone sends, often not HLS-friendly [13]. So free-CPU passthrough trades away reliability + adaptive bitrate.
- **RAM:** Official docs only say memory *"will grow a bit as more concurrent connections are being handled"* [12]. Unofficial 2026 guide estimates ~200 MB baseline (vs ~30 MB MediaMTX, ~50 MB nginx-rtmp) [15] — treat as rough.
- **CPU is independent of viewer count** [4][14]; **viewers are bandwidth-bound** [12].
- **Bandwidth math (official examples):** a 2-hr stream at 5000 kbps to 25 viewers ≈ **112.5 GB** (passthrough) / ≈ 93.1 GB (lower transcoded rung). Egress scales linearly with viewers × bitrate × time [14].
- **Disk:** near-zero — live segments are cleaned up in real time (unless recording, which BibleWay currently keeps on Cloudflare) [14].
- **Real-world viewer datapoint:** 325 concurrent for 6+ hrs, 1024 kbps passthrough, Celeron 3.5 GHz, 1 Gbps uplink, CPU steady ~30% [12].

### 3. Viewer scaling — S3 + CDN offload (per stream)
- **Object storage offload:** point Owncast at an **S3-compatible** provider (docs example: Oracle Cloud Objects; `path-style` option since v0.0.11). Owncast writes HLS segments there instead of serving from the box, so *"if you have 1 or 1000 viewers the video traffic from your server will be exactly the same"* [10][2]. Explicitly *"not for permanent storage / archival"* [10].
- **CDN in front:** *"Putting a CDN in front of your video allows your video to be distributed by servers geographically closer to the viewer."* No named provider, but any CDN in front of the S3 bucket works (e.g. Cloudflare/R2 — inference; would align with BibleWay's existing Cloudflare footprint) [2].
- **Crucial distinction:** you scale one stream's *viewers* with S3+CDN, **not** by launching more Owncast copies — *"you can't just run more copies of Owncast for scale"* [2]. Cloning instances is only for adding *broadcasters*, not for load-sharing one broadcast.

### 4. THE CORE PROBLEM — N independent broadcasters
**Fact — no native multi-channel/multi-tenant mode.** Repeated feature requests (Discussion #3546, Issue #3642, Issue #4344 closed as dup of #489) are all answered the same way: run multiple instances; it is not built and not planned [7][11][and issue threads]. Docker Hub itself brands Owncast *"single user live video streaming and chat server"* [9].

So BibleWay's many-to-many requirement (any number of hosts live at once, each a discoverable row in the feed) maps to **one Owncast instance per live broadcaster**, which BibleWay must provision, route, monitor, and tear down. Concretely the control plane needs:

1. **Dynamic provisioning/teardown** on "Go Live"/"End": spin a container (Docker API / **Kubernetes** Job/Pod or Deployment / **Nomad**), inject a unique stream key + admin password + config, hand the host back an RTMP ingest URL + key, then destroy on end. This is bespoke — Owncast ships nothing for it.
2. **Routing per instance — two separate problems:**
   - *HLS/web (8080, HTTP):* easy — a reverse proxy (Traefik/nginx/Caddy) can host-route `stream-<id>.bibleway…` → the right container by Host header.
   - *RTMP ingest (1935, raw TCP):* **cannot be host/subdomain-routed** (no Host header before the stream). Each instance needs a **unique published port**, a dedicated IP, or an SNI/TCP load-balancer mapping. This is the awkward, easily-overlooked piece and a real source of ops complexity at scale [inference from 6][9].
3. **Per-instance state:** each container's SQLite `/app/data` holds its key/config; provisioning must seed it and (if recordings matter) offload before teardown.
4. **Cold start (inference):** image is small (~87 MB, cacheable on nodes), so container boot is seconds; but "tap Go Live → usable stream" also includes orchestration scheduling, config seeding, the host's encoder connecting, and ffmpeg producing the first HLS segments (see R1 for HLS glass-to-glass, typically 2–30 s). Realistically **several seconds to tens of seconds** before viewers can watch — noticeably worse than CF/Agora's near-instant API-issued channel.
5. **Ops burden:** upgrades = re-rolling every instance image; monitoring = health/CPU/egress across the whole fleet; plus per-instance secrets and backup. Owncast is effectively a **single-maintainer** project (see R6 on bus factor), so all this glue is on BibleWay.

**Any real multi-channel setups found?** None that are true multi-tenant. The closest community artifacts are **"just run multiple instances"** guidance [7][11] and **hugowncast** (Hugo + Owncast bundle) — but hugowncast packages a *single* Owncast + static site, not a multi-broadcaster control plane [16]. Some users instead fan a single broadcast out to multiple *platforms* via Restream.io [11] — that's multi-*destination*, not multi-*broadcaster*, and doesn't solve BibleWay's need.

### 5. Realistic ceiling (inference, instance-per-stream)
Assume 3 quality rungs → ~2–3 transcode cores per live instance (or ~0 with risky passthrough).
- **10 concurrent broadcasters:** Viable. ~20–30 transcode cores across a few nodes, 10 containers, manageable routing. A small team could run this.
- **100 concurrent:** Heavy but possible. ~200–300 transcode cores, 100 unique RTMP port/IP mappings, 100 SQLite states, autoscaling K8s + node pools + S3/CDN egress + fleet monitoring. Requires a dedicated ops/platform effort; cost and complexity are real.
- **1000 concurrent:** Effectively not viable as instance-per-stream. ~2000–3000 transcode cores, 1000 provisioning/teardown events, 1000 routing entries — you'd be building and staffing a bespoke live-video PaaS. This duplicates exactly what Cloudflare Stream (managed live inputs) and Agora (managed channels) already deliver via a single API call with zero standing infra.

## Implications for BibleWay
- BibleWay's incumbent hybrid (CF Stream + Agora) is **inherently many-to-many**: N broadcasters = N API calls, no standing per-stream infra, near-instant channel creation, and viewer scale handled by the vendor's global CDN/SFU. Owncast **inverts** this: N broadcasters = N pieces of infra BibleWay provisions, routes, upgrades, and monitors.
- Where Owncast could still fit **without** touching the multi-tenant pain: a **single persistent 24/7 ministry channel** (one instance, S3+CDN offload) as a supplementary low-cost HLS channel — not as a replacement for the per-host go-live path.
- As a replacement for CF Stream's per-stream HLS/VOD or for Agora's interactive layer across many simultaneous hosts, instance-per-broadcaster is the make-or-break constraint and it does **not** scale cleanly to BibleWay's model. The orchestration + routing (esp. RTMP port/IP mapping) + per-instance upgrades are net-new operational surface BibleWay does not carry today.
- If Owncast were ever adopted for multi-host, the S3/CDN egress path can and should reuse BibleWay's existing **Cloudflare** relationship (R2 + CDN) — but that only solves per-stream viewer scale, not the broadcaster-fan-out problem.

## Open questions / uncertainties
- Exact **cold-start time** ("Go Live" tap → first playable segment) for a container-per-stream design is not documented; my estimate (seconds→tens of seconds) needs a prototype to confirm.
- Whether config/stream-key seeding at provision time is fully automatable via the admin API without a UI step (R2's lane) — determines feasibility of dynamic provisioning.
- RAM-per-viewer growth curve is only qualitatively documented ("grows a bit"); no numbers for planning 100s of instances.
- The ~200 MB baseline RAM figure is from an unofficial 2026 guide [15], not Owncast docs.
- **Discrepancy flagged:** the pistack 2026 guide claims Owncast has *"no built-in transcoding"* [15] — this contradicts Owncast's official video docs, which describe ffmpeg transcoding to multiple rungs as the default and passthrough as the opt-out [4][13]. Trust the official docs; treat pistack as unreliable on that point.

## Sources
1. Owncast docs index — https://owncast.online/docs/
2. Scaling Owncast — https://owncast.online/docs/scaling/
3. Installation quickstart — https://owncast.online/quickstart/installation/
4. Resources & requirements — https://owncast.online/docs/resources-requirements/
5. Container quickstart — https://owncast.online/quickstart/container/
6. Configuration (ports, admin) — https://owncast.online/docs/configuration/
7. Discussion #3546 "Multiple channels (of the same user)" (maintainer gabek) — https://github.com/owncast/owncast/discussions/3546
8. FAQ (server type / cost) — https://owncast.online/faq/
9. Docker Hub owncast/owncast — https://hub.docker.com/r/owncast/owncast
10. Storage (S3-compatible offload) — https://owncast.online/docs/storage/
11. Cloudron forum "Owncast Multi-User Mode?" (girish, robi) — https://forum.cloudron.io/topic/8925/owncast-multi-user-mode
12. Discussion #1684 "maximum viewer possible?" (325 viewers; gabek on bandwidth-bound) — https://github.com/owncast/owncast/discussions/1684
13. Video config / passthrough — https://owncast.online/docs/video/
14. Resources & requirements — bandwidth/CPU-independent-of-viewers examples — https://owncast.online/docs/resources-requirements/
15. Pistack "Self-Hosted Live Streaming… 2026" (unofficial sizing; unreliable transcoding claim) — https://www.pistack.xyz/posts/self-hosted-live-streaming-owncast-mediamtx-nginx-rtmp-guide-2026/
16. hugowncast (Hugo+Owncast single-instance bundle) — https://codeberg.org/johanvandegriff/hugowncast
17. Issue #4344 / Issue #3642 (multiple streams requests → run multiple instances) — https://github.com/owncast/owncast/issues/4344 , https://github.com/owncast/owncast/issues/3642
