# YouTube API for BibleWay video & live streaming — research & recommendation

*Deep research, June 2026. Every load-bearing fact is cited to a primary source (Google/Mux docs).
Where Google's own docs conflict, both are cited and the conflict is flagged.*

This evaluates using the **YouTube Data API v3** (incl. the **YouTube Live Streaming API**) for live
and on-demand video in BibleWay, against the existing **Phase 4 = Mux** plan in `BACKEND_PLAN.md`. It
compares four models and recommends one.

---

## TL;DR

- **YouTube is a content layer, not a video backend.** The Data API gives you *metadata + an
  embeddable video id* — never a downloadable or HLS URL. Playback must go through YouTube's own
  embedded/IFrame player, ads included. You cannot legally extract, proxy, or store the raw video.
- **Recommended: a hybrid.** Use YouTube to **discover and embed existing** church/sermon/worship
  content (near-zero cost, huge instant catalog), and keep **Mux for first-party broadcasting and
  owned recordings** where you need control, no ads, signed access, low latency, and real analytics.
- **It fits your stack cleanly and even runs in Expo Go** — YouTube embedding uses
  `react-native-youtube-iframe` over `react-native-webview` (bundled in Expo Go), unlike Mux/LiveKit
  which need a dev build. So YouTube embedding is actually the *lower-friction* path to shipping video.
- **The quota is the real constraint, not money.** The API is free but capped at **10,000 units/day**
  by default, and **search is the expensive operation (~100 searches/day max)**. The trick is to
  refresh a *curated catalog on a schedule into your own cache* and serve users from cache — so quota
  spend is independent of user count.

---

## 1. How the YouTube APIs actually work (the mental model)

There are three distinct pieces, and conflating them causes most bad architecture decisions:

1. **YouTube Data API v3 — read/metadata + search.** Find channels/videos/playlists, read titles,
   thumbnails, statistics, and *live details* (concurrent viewers, start time). Returns a **videoId
   and an embed iframe**, never a media file URL. ([videos resource](https://developers.google.com/youtube/v3/docs/videos))
2. **YouTube Live Streaming API — broadcast control** (a subset of the Data API + the Content ID API).
   Programmatically create/run a live broadcast: `liveBroadcasts.insert` → `liveStreams.insert` →
   `liveBroadcasts.bind` → `liveBroadcasts.transition` (`testing`→`live`→`complete`) →
   `liveBroadcasts.cuepoint` for ad breaks. ([life of a broadcast](https://developers.google.com/youtube/v3/live/life-of-a-broadcast))
3. **Playback — the embedded player only.** On the device you render the official **IFrame player**;
   in React Native that means `react-native-youtube-iframe`. ([IFrame API](https://developers.google.com/youtube/iframe_api_reference))

**The hard wall:** the Data API "does NOT return downloadable or stream URLs." Google's Developer
Policies (III.E) state you "must not download, import, backup, cache, or store copies of YouTube
audiovisual content without YouTube's prior written approval," and "must not separate, isolate, or
modify the audio or video components." API ToS §16.3 grants no license to the media outside the
player. **So YouTube can never feed your `VideoPlayer`'s HLS path — it can only be shown via the
embedded player.** ([Developer Policies](https://developers.google.com/youtube/terms/developer-policies),
[API ToS](https://developers.google.com/youtube/terms/api-services-terms-of-service))

---

## 2. The four models compared

### Model 1 — Embed & discover existing YouTube content  ✅ high value, low cost/effort

Surface sermons, worship sets, and live church services already on YouTube: search/curate faith
channels, list their live + recent videos, show live concurrent-viewer counts, and play them in an
embedded player inside BibleWay.

- **Feasibility:** High. Pure read API + embed. No OAuth (a server API key is enough for public data).
- **Cost:** Free (quota only). A curated-catalog approach stays well under the 10,000-unit/day default
  (see §3).
- **Effort:** Low–Medium. A backend `YouTubeModule` + a scheduled catalog refresh + an iframe player
  on the frontend.
- **Constraints:** Embed-only playback; **ads may show and cannot be suppressed**; must respect
  `status.embeddable=false`; attribution/links required; no background audio (Play-Store rule); you
  don't control the UX. ([Developer Policies III.E](https://developers.google.com/youtube/terms/developer-policies))

### Model 2 — Let BibleWay hosts broadcast & upload to YouTube  ⚠️ heavy, indirect

Your hosts go live / upload, with the video **hosted on their own YouTube channels** via OAuth.

- **Feasibility:** Technically yes via the Live Streaming API, but operationally heavy.
- **Cost:** Free quota-wise, but the *real* costs are OAuth + audits.
- **Effort / blockers:**
  - Requires **OAuth 2.0 with sensitive scopes** (`youtube`, `youtube.force-ssl`, `youtube.upload`)
    → **Google verification + demo video + justification**; until verified you're capped at ~100 test
    users with an "unverified app" warning. ([sensitive-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification))
  - Each host's **channel must be eligible for live**: phone-verified, no live restrictions in 90 days,
    16+, and the **first live stream can take up to 24h to activate**. ([enable live](https://support.google.com/youtube/answer/2474026))
  - The content lives on the **host's** channel (their branding, their ads, their ownership) — not
    BibleWay's. You're essentially a remote control for someone else's YouTube.
- **Verdict:** Only makes sense if "publish to the host's own YouTube" is an explicit goal. For a
  first-party BibleWay broadcast experience, this is the wrong tool — that's what Mux is for.

### Model 3 — Replace Mux with YouTube entirely  ❌ not recommended

Host *all* BibleWay video/live on YouTube and embed it everywhere.

- **Why it fails the product:** you give up ownership and UX, **ads you can't remove** play over
  worship content, you can't gate content with signed access, you can't get recordings as owned
  assets, analytics are coarse, and you're fully bound by YouTube ToS (which can change or suspend
  access). You also can't charge users to watch in an embedded player. ([Developer Policies](https://developers.google.com/youtube/terms/developer-policies))
- **Verdict:** Acceptable only for a zero-budget MVP that's fine showing ads and ceding control.

### Model 4 — YouTube + Mux hybrid  ✅ recommended (see §6)

YouTube for the **discovery/aggregation layer** (existing content, near-zero cost) and **Mux for
first-party broadcasts and owned VOD** (control, no ads, signed playback, low latency, real
analytics). This is a well-established pattern and maps directly onto your current architecture.

| | Model 1 Embed/discover | Model 2 Broadcast to YT | Model 3 Replace Mux | Model 4 Hybrid |
|---|---|---|---|---|
| Cost | Free (quota) | Free (quota) | Free (quota) | YT free + Mux per-min |
| Effort | Low–Med | High (OAuth+audit) | Med | Med |
| Ownership/UX control | None | None (host's channel) | None | Full for first-party |
| Ads | Yes, forced | Yes | Yes | None on Mux content |
| Signed/secure access | No | No | No | Yes (Mux JWT) |
| Recommended? | ✅ as a layer | Only if explicitly wanted | ❌ | ✅✅ |

---

## 3. Quota & cost math (the real constraint)

The API costs no money, but every project gets a **default 10,000 units/day**, resetting at
**midnight Pacific**. Increases require passing a **compliance audit** (the "YouTube API Services –
Audit and Quota Extension" form) and are not guaranteed.
([getting started](https://developers.google.com/youtube/v3/getting-started),
[quota cost](https://developers.google.com/youtube/v3/determine_quota_cost),
[audits](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits))

Per-operation costs (verified against the official quota table):

| Operation | Cost | Note |
|---|---|---|
| `videos.list` | 1 unit | up to **50 video ids per call** — batch! |
| `channels.list` | 1 unit | |
| `playlistItems.list` | 1 unit | a channel's "uploads" playlist = its recent videos |
| `liveBroadcasts.list` / `liveStreams.list` | ~1 unit | not itemized in the table; by Google's read=1 convention |
| writes (`insert`/`update`/`transition`/`bind`) | ~50 units | by Google's write=50 convention |
| `videos.insert` (upload) | 100 units | (old "1,600" figure is outdated) |
| **`search.list`** | **expensive — see below** | |

**⚠️ `search.list` discrepancy (flagged):** Google's own docs disagree. The
[quota-cost table](https://developers.google.com/youtube/v3/determine_quota_cost) lists `search.list`
at **100 units**, while the
[search.list reference](https://developers.google.com/youtube/v3/docs/search/list) now says "100 calls
per day … a quota cost of **1 unit** in the **Search Queries** quota bucket" (i.e. a *separate*
~100-calls/day bucket). **Either way the practical ceiling is the same: ~100 searches/day on the
default quota.** Treat search as a scarce resource.

**The architectural consequence — serve users from your own cache, not from YouTube:**

- **Do NOT call `search.list` per user request.** ~100 searches/day would be exhausted by a handful of
  users. Use search only for occasional admin/catalog curation, cached for 24h.
- **Maintain a curated channel catalog** (e.g. ~150 faith channels) and refresh it on a **schedule**
  into Postgres/Redis. For each channel: `playlistItems.list` (1 unit) → recent video ids → batched
  `videos.list?part=snippet,liveStreamingDetails` (1 unit per 50 ids) → titles, thumbnails, live
  status, and `concurrentViewers`.
- **Sample budget:** 150 channels refreshed hourly ≈ 150 (`playlistItems`) + ~15 (`videos.list`
  batches) ≈ **165 units/hour ≈ ~4,000 units/day** — comfortably under 10,000, *regardless of how many
  users you have*, because users read your cache. Poll live viewer counts for the few currently-live
  videos every 1–2 min via one batched `videos.list` (cheap).
- If you outgrow that, request a quota increase via the audit, or split into multiple Cloud projects
  per Google's terms.

**Live data available:** `videos.list?part=liveStreamingDetails` →
`concurrentViewers`, `actualStartTime`, `scheduledStartTime`, `activeLiveChatId`. `concurrentViewers`
appears **only while live and only if the owner hasn't hidden the count**, and **stops at broadcast
end** (no count for the archive). A cheap live/not-live check is `snippet.liveBroadcastContent`
(`live`/`upcoming`/`none`). ([videos resource](https://developers.google.com/youtube/v3/docs/videos))

---

## 4. Hard constraints & ToS gotchas (read before building)

All from the [YouTube API Services Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service)
and [Developer Policies](https://developers.google.com/youtube/terms/developer-policies) (verified 2026):

- **Embed-only playback. No raw stream.** Can't download, cache, store, or separate the audio/video
  (Policies III.E). The only lawful playback is the official embedded/IFrame player.
- **Don't touch ads.** "Modify, interfere with, replace, or block advertisements" is prohibited
  (III.E). Worship/sermon embeds may show ads and you can't remove them.
- **Don't charge to watch** content in an embedded player (III.G). Relevant if BibleWay ever gates
  content behind payment/subscription.
- **No background audio for embeds.** The iframe library's Play-Store guidance is explicit: Google
  "does not allow background play in any form" for the embedded player — you must stop playback when
  the app backgrounds. (This kills "listen to a sermon with the screen off" for YouTube content —
  another reason podcasts/Mux remain first-party.) ([play-store compatibility](https://lonelycpp.github.io/react-native-youtube-iframe/play-store-compatibility/))
- **Data retention ≤ 30 days.** Stored API data must be deleted or refreshed within 30 days (view
  counts are an exception with periodic re-verification); delete authorized user data within 7 days of
  revocation (III.D). Practically: your cache rows are short-lived, which aligns fine with a refresh
  loop.
- **Attribution/branding required**; don't obscure player links or attribution (III.E, ToS §10.3/§11,
  [Branding Guidelines](https://developers.google.com/youtube/terms/branding-guidelines)).
- **Respect `status.embeddable`.** Videos with embedding disabled won't play; filter them out.
- **No cross-content-owner aggregation** of API data, and don't present YouTube content as if it
  originates elsewhere (III.E).
- **"Made for Kids" / COPPA.** If BibleWay is (or has sections) directed to children, you become a
  "Child-Directed API Client": notify Google and follow Policies III.J (no personalized ads, write
  actions blocked, etc.) (ToS §9.1). A faith app with kids' content should review this.
- **OAuth scopes for broadcasting/uploading are sensitive** → verification + demo video before public
  use (Model 2 only).

---

## 5. React Native integration realities

- **Playback:** `react-native-youtube-iframe` (wraps the IFrame Player API inside
  `react-native-webview`, a peer dependency). It explicitly lists Expo support.
  ([npm](https://www.npmjs.com/package/react-native-youtube-iframe),
  [install docs](https://lonelycpp.github.io/react-native-youtube-iframe/install/))
- **Runs in Expo Go.** `react-native-webview` is **bundled in Expo Go**
  ([Expo webview docs](https://docs.expo.dev/versions/latest/sdk/webview/)), so YouTube embedding needs
  **no dev build** — the opposite of Mux/LiveKit native players. This makes YouTube the fastest path to
  *some* working video in the app today.
- **`expo-av` / `expo-video` CANNOT play YouTube URLs** — they need a direct `.mp4`/`.m3u8`/`.mpd`
  source; a YouTube watch page is not one. So Mux content uses `expo-video` (HLS), YouTube content uses
  the iframe player. They coexist. ([expo-video](https://docs.expo.dev/versions/latest/sdk/video/))
- **Call the Data API from your backend, not the client** — the quota is per-project and a key shipped
  in an app binary is effectively public. Your NestJS layer holds the key and caches results.
  ([getting started](https://developers.google.com/youtube/v3/getting-started))
- **Embedded-player caveats:** ads may show; autoplay is gated by mobile browsers; fullscreen handling
  is platform-specific; `onFullScreenChange` is Android-only today.
  ([component props](https://lonelycpp.github.io/react-native-youtube-iframe/component-props/))

### YouTube vs Mux — side by side

| | YouTube (Data API + embed) | Mux |
|---|---|---|
| Infra cost | **Free** (quota only) | **Per minute**: encode + storage + delivery |
| Playback URL | Embed-only (no HLS URL) | **Direct HLS** `stream.mux.com/{id}.m3u8` |
| Secure/signed access | No | **Yes** (signed JWT playback) |
| Ads | **Forced, can't remove** | **None** |
| Recordings/VOD | The video *is* on YouTube | **Auto VOD asset** from live |
| Live latency | Standard | standard / reduced / **low (~5s LL-HLS)** |
| Viewer analytics | Coarse `concurrentViewers`, stops at end | **Real-time CCV + QoE** (<20s) via Mux Data |
| RN player | iframe/WebView (**Expo Go OK**) | `expo-video` HLS (**needs dev build**) |
| Ownership/UX | None | **Full** |

**Approximate Mux pricing** (from [mux.com pricing](https://www.mux.com/pricing), fetched 2026-06-22 —
*verify before quoting, rates change*): encoding ~$0.025/min @720p (Plus) up to ~$0.047/min @1080p
(Premium); **delivery: first 100,000 min/month free**, then ~$0.0008–$0.0048/min by resolution/tier;
storage ~$0.0024–$0.003/min/month; live needs Plus/Premium; low-latency costs the same as standard;
Mux Data analytics included free. Live captions 6,000 min/mo free then $0.024/min; simulcast
$0.020/min/target.

---

## 6. Recommendation for BibleWay + integration sketch

**Adopt the hybrid (Model 4):**

- **YouTube = the discovery/aggregation layer.** Ship a curated, denomination-tagged catalog of
  faith channels; surface their **live services** and **recent sermons/worship** with real
  concurrent-viewer counts; play them via the embedded player. This gives BibleWay a large, fresh
  video catalog on day one at essentially $0 — and it ships in Expo Go.
- **Mux = first-party broadcasting & owned VOD** (your existing Phase 4 plan, unchanged). Use it when
  BibleWay itself hosts a stream and needs no ads, signed access, recordings, low latency, and real
  analytics.

This is additive to `BACKEND_PLAN.md` — it doesn't replace Phase 4; it adds a cheaper content source
alongside it.

### How it slots into the existing code

**Domain type** — extend the existing `LiveStream` (in `Frontend/src/types` and
`backend/packages/shared-types`) with a discriminator instead of a new shape:

```ts
// add to LiveStream
source: 'mux' | 'youtube';
youtubeVideoId?: string;   // present when source === 'youtube'; streamUrl stays for Mux HLS
```

**Backend — new `YouTubeModule`** (mirrors the `podcasts`/`agent` module conventions):

- Env (zod in `config/env.ts`, optional → graceful degrade like the others):
  `YOUTUBE_API_KEY`, and a `YOUTUBE_CHANNELS` seed (or a `youtube_channels` table).
- `youtube.service.ts` calls the Data API server-side and **caches in Redis** (you already have
  `RedisService`). Methods: `refreshCatalog()` (scheduled via `@Interval`, like the podcasts progress
  flush) → `playlistItems.list` + batched `videos.list?part=snippet,liveStreamingDetails`; `listLive()`
  and `listRecent(channelId, cursor)` read from cache; `search(q)` (admin/occasional, 24h-cached).
- `youtube.controller.ts` endpoints under the streams namespace, cursor-paginated like podcasts:
  `GET /streams/youtube/live`, `GET /streams/youtube/channels/:id/videos`, `GET /streams/youtube/search`.
  Map results into the shared `LiveStream` shape with `source:'youtube'`.
- Merge into discovery: the "Streaming Now" feed becomes Mux-live ∪ YouTube-live, both as `LiveStream`s.

**Frontend** — minimal, reuses your patterns:

- `npx expo install react-native-youtube-iframe react-native-webview` (both Expo-Go compatible).
- `useYouTubeLive()` / extend `useLiveStreams()` (React Query, like `usePodcasts`) to fetch the merged
  feed; users hit your API (cache), never YouTube directly.
- In `VideoPlayer` / `LiveStreamScreen`: branch on `stream.source` — `youtube` → render
  `<YoutubePlayer videoId={stream.youtubeVideoId} />`; `mux` → render the `expo-video` HLS player.
  Keep the same card UI and viewer-count badge.

### Quota budget to plan against

Default 10,000 units/day is enough for a **curated catalog served from cache** (~4,000 units/day for
~150 channels refreshed hourly, §3). It is **not** enough for per-user `search.list`. Rule: scheduled
catalog refresh + cache + batched `videos.list`; reserve `search` for admin curation. Request an
increase via the compliance audit only if the catalog grows large.

## 7. Key risks & gotchas (summary)

1. **Ads on worship content** you can't remove, and **no background audio** for YouTube embeds —
   reasons to keep first-party/podcast content on Mux/your own stack.
2. **`search.list` is scarce** (~100/day) and Google's docs are inconsistent about its cost — architect
   around scheduled refresh + cache, never per-user search.
3. **ToS lock-in & change risk** — embed-only, attribution required, 30-day data cap, can't charge in
   embed; YouTube can revise terms or limit access. Don't make YouTube load-bearing for paid features.
4. **Model 2 (broadcast to YouTube) needs OAuth sensitive-scope verification + per-channel live
   eligibility** — heavy; only pursue if "publish to the host's own channel" is a real requirement.
5. **`embeddable=false`, private/unlisted, geo-restrictions** — filter and handle gracefully.
6. **"Made for Kids"/COPPA** — review if BibleWay targets or includes children's content.

---

## Sources

**YouTube — quota & API**
- Getting started / quota overview — https://developers.google.com/youtube/v3/getting-started
- Quota costs table — https://developers.google.com/youtube/v3/determine_quota_cost
- search.list (eventType=live; search-bucket cost note) — https://developers.google.com/youtube/v3/docs/search/list
- videos resource (liveStreamingDetails, concurrentViewers, status.embeddable) — https://developers.google.com/youtube/v3/docs/videos
- Compliance audits / quota extension — https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits

**YouTube — live streaming**
- Life of a broadcast (insert/bind/transition/cuepoint) — https://developers.google.com/youtube/v3/live/life-of-a-broadcast
- liveBroadcasts.transition (scopes, eligibility errors) — https://developers.google.com/youtube/v3/live/docs/liveBroadcasts/transition
- Getting started (live) — https://developers.google.com/youtube/v3/live/getting-started
- Enable live streaming — https://support.google.com/youtube/answer/2474026

**YouTube — terms, policies, OAuth**
- API Services Terms of Service — https://developers.google.com/youtube/terms/api-services-terms-of-service
- Developer Policies — https://developers.google.com/youtube/terms/developer-policies
- Branding Guidelines — https://developers.google.com/youtube/terms/branding-guidelines
- IFrame Player API — https://developers.google.com/youtube/iframe_api_reference
- Sensitive-scope verification — https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification

**React Native / Expo**
- react-native-youtube-iframe — https://www.npmjs.com/package/react-native-youtube-iframe · https://lonelycpp.github.io/react-native-youtube-iframe/install/
- Play-Store compatibility (no background play) — https://lonelycpp.github.io/react-native-youtube-iframe/play-store-compatibility/
- Expo WebView (bundled in Expo Go) — https://docs.expo.dev/versions/latest/sdk/webview/
- expo-video (supported sources) — https://docs.expo.dev/versions/latest/sdk/video/

**Mux**
- Pricing — https://www.mux.com/pricing · https://www.mux.com/docs/pricing/video
- Secure (signed) playback — https://www.mux.com/docs/guides/secure-video-playback
- Real-time monitoring (Mux Data) — https://data.mux.com/real-time-monitoring
- Reduce live latency — https://www.mux.com/docs/guides/reduce-live-stream-latency

*Note: a third-party blog encountered during research contained a prompt-injection attempt; it was
ignored and only primary Google/Mux sources were used for the figures above. Mux prices and YouTube
terms change — re-verify the cited pages before committing.*


