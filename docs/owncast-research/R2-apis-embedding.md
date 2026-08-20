# R2 — Owncast APIs, Integration & Mobile Embedding

Scope: Admin/integration APIs, tokens & scopes, webhooks/events, playback embedding (JS widget + raw HLS + React Native/Expo), chat + ActivityPub federation, access control for private/paid streams, moderation via API. Evaluated against BibleWay's Agora (interactive) + Cloudflare Stream (HLS/VOD/signed) hybrid and its **many-to-many multi-broadcaster** requirement.

## TL;DR
- Owncast exposes **three API surfaces**: internal **Admin API** (HTTP Basic auth w/ admin password, `/api/admin/*`), **External/Integrations API** (Bearer access-token, `/api/integrations/*`), and a **public consumer API** (`/api/status`, `/api/chat/register`, `/api/video/variants`, no auth). [1][2][3]
- Integration tokens have only **3 coarse scopes**: `CAN_SEND_MESSAGES`, `CAN_SEND_SYSTEM_MESSAGES`, `HAS_ADMIN_ACCESS`. Tokens are created manually in the admin UI (`/admin/access-tokens`) — **no OAuth, no per-user tokens, no programmatic token minting**. [3]
- **Webhooks** cover 9 event types (chat, joins/parts, name change, stream started/stopped, title update, visibility, fediverse follow), delivered as plain-JSON HTTP POST `{type, eventData}`. **No documented signing/HMAC** on the payload — a real gap vs BibleWay's existing CF webhook HMAC verification. [4]
- **HLS is a plain, unauthenticated manifest at `/hls/stream.m3u8`.** Any standards-compliant player works, so **React Native/Expo playback is trivial** via `expo-video`/`expo-av` or `react-native-video` (`{ uri: 'https://host/hls/stream.m3u8' }`). CORS is a browser concern only — irrelevant to native RN players. [5]
- Real-time chat runs over a **WebSocket** (`/ws?accessToken=…`); client first calls `POST /api/chat/register` to get an `accessToken`, then connects. Chat is a full first-class subsystem with moderation. [1][2]
- **ActivityPub / Fediverse federation is OFF by default** and toggled in Admin → Configuration → Social. Easy to keep disabled — good for a private ministry app. [6]
- **No native private/authenticated/paid streams.** This is a long-standing, repeatedly-requested, still-unimplemented gap (issues #489, #630, #4344 — the last literally a church wanting password-protected private services, closed as duplicate). Gating requires a **custom reverse proxy** in front, with a known Safari-websocket auth caveat. [7][8][9][10]
- Moderation is well covered via API (hide/restore messages, enable/disable users, IP bans, promote moderators) — usable as glue for BibleWay's own moderation UI. [2][3]

## Findings

### 1. API surfaces & auth [1][2][3]
Owncast splits endpoints into **internal (incl. admin)** and **external (integration)** APIs; a subset is public/unauthenticated for player clients.

**Admin API** — auth: **HTTP Basic** using the admin password (single shared credential).
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/status` | System status |
| GET | `/api/admin/serverconfig` | Current server config |
| POST | `/api/admin/config/*` | Change settings (title, name, chat rules, codec…) |
| GET | `/api/admin/chat/messages` | Full unfiltered chat history |
| POST | `/api/admin/chat/messagevisibility` | Hide/restore messages |
| POST | `/api/admin/chat/users/setenabled` | Enable/disable (ban) a user |
| GET/POST | `/api/admin/chat/users/moderators`, `/setmoderator` | List / assign moderators |
| POST | `/api/admin/chat/users/ipbans/create` | Ban IP |
| GET/POST | `/api/admin/users`, `/users/delete` | List / delete users |
| GET | `/api/admin/logs`, `/api/admin/followers*` | Logs, federation followers |

**External / Integrations API** — auth: **`Authorization: Bearer <token>`**. Described in docs as the "stable and reliable" surface for third parties. [2][3]
| Method | Path | Scope required |
|---|---|---|
| POST | `/api/integrations/chat/send` | `CAN_SEND_MESSAGES` |
| POST | `/api/integrations/chat/system` | `CAN_SEND_SYSTEM_MESSAGES` |
| POST | `/api/integrations/chat/action` | `CAN_SEND_SYSTEM_MESSAGES` |
| POST | `/api/integrations/chat/messagevisibility` | `HAS_ADMIN_ACCESS` |
| GET | `/api/integrations/chat` | `HAS_ADMIN_ACCESS` (chat history) |
| GET | `/api/integrations/clients` | `HAS_ADMIN_ACCESS` (connected clients) |
| GET | `/api/integrations/status` | server status |
| POST | `/api/integrations/streamtitle` | `HAS_ADMIN_ACCESS` |

**Access tokens & scopes** [3]: created manually in admin UI (`/admin/access-tokens` → Create → pick scope). Only three scopes exist:
- `CAN_SEND_MESSAGES` — post standard chat messages.
- `CAN_SEND_SYSTEM_MESSAGES` — system messages + chat actions + targeted client messages.
- `HAS_ADMIN_ACCESS` — chat history, client list, message visibility, stream title.

No OAuth flow, no scoped-per-integration granularity beyond these, no API to mint tokens. **Fact + note:** docs themselves say "APIs are still early days with our integration hooks." [11]

**Public consumer API** (no auth): `GET /api/status` (`online`, `viewerCount`, `lastConnectTime`, `streamTitle`, `versionNumber`), `GET /api/video/variants`, `GET /api/ping` (register active viewer), `POST /api/metrics/*`. [1]

### 2. Webhooks / event stream [4]
Register in admin UI (`/admin/webhooks` → pick events + public URL). Delivery = **HTTP POST**, `Content-Type: application/json`, body `{"type":"<EVENT>","eventData":{…}}`. Event types:
`CHAT`, `NAME_CHANGED`, `USER_JOINED`, `USER_PARTED`, `STREAM_STARTED`, `STREAM_STOPPED`, `STREAM_TITLE_UPDATED`, `VISIBILITY-UPDATE`, `FEDIVERSE_ENGAGEMENT_FOLLOW`.
Covers exactly the BibleWay-relevant signals (stream start/stop, chat, viewer join/part → viewer count). **No documented payload signature/HMAC** — the receiver must trust the endpoint or add its own shared-secret path/allowlist. Contrast: BibleWay's current CF webhook path verifies HMAC-SHA256 over the raw body. For chat-message-level real time, a WebSocket client (see §4) is the lower-latency alternative to the `CHAT` webhook.

### 3. Playback embedding [5]
- **JS/iframe widget:** `<iframe src="https://host/embed/video" allowfullscreen>`; query `?initiallyMuted=true`. Chat embeds: `/embed/chat/readwrite`, `/embed/chat/readonly` (readonly used for OBS overlays, accepts custom CSS). Built-in web player is a video.js-based HLS player. Embedded content **must be served over HTTPS** or browsers block it.
- **Raw HLS:** master playlist at **`/hls/stream.m3u8`**. Docs recommend pointing players at the instance homepage so it auto-selects the playlist, but the direct manifest URL is stable. When object storage (S3-compatible) is configured, segments (`.ts`) are served from that bucket/CDN; the manifest still originates from the Owncast host.

### 4. React Native / Expo embedding (most important for BibleWay)
- HLS `.m3u8` is a first-class source for **`expo-video`** (current), **`expo-av`** (legacy, what BibleWay already uses for HLS/VOD), and **`react-native-video`**. Minimal usage: `player source = { uri: 'https://host/hls/stream.m3u8' }`. iOS uses native AVPlayer HLS; Android uses ExoPlayer HLS — both handle Owncast output natively. [5]
- **CORS is NOT a concern for native RN players** — CORS is enforced only by web browsers/`fetch`; AVPlayer/ExoPlayer fetch the manifest and segments directly. (Inference, standard mobile-HLS behavior; only relevant if BibleWay renders the stream inside a React Native `WebView`, where the page's HTTPS + Owncast's CORS headers would matter.)
- **No auth/cookies on the manifest by default.** Because the manifest is public and unsigned, BibleWay cannot pass a per-user token on it the way it does with Cloudflare's RS256 signed playback JWT. Any gating must live in a reverse proxy (see §6). This is the single biggest embedding gotcha relative to the CF incumbent.
- **Latency/ABR** are R1's lane; for RN the practical note is standard HLS buffering (multi-second glass-to-glass), i.e. **not** a drop-in for Agora's sub-second interactive path.

### 5. Chat architecture & API [1][2][3]
- Real-time transport = **WebSocket** at `/ws?accessToken=<token>`. Client flow: `POST /api/chat/register` → returns `{id, accessToken, displayName}` (anonymous user) → open WS with that token → receive/send message events. Owncast assigns random display names unless an upstream proxy sets `X-Forwarded-User`. [6][12]
- Read history: `GET /api/chat?accessToken=…` (consumer) or `GET /api/integrations/chat` (Bearer, admin scope). Post programmatically: `/api/integrations/chat/send`.
- A React Native chat UI is buildable: register → WS for live messages → integration token for a server-side bot. But **there is no per-app-user identity/auth** — chat users are anonymous tokens, so BibleWay would need to map its own authenticated users onto Owncast display names itself (e.g., proxy-injected `X-Forwarded-User`).
- Chat can be globally disabled in admin config.

### 6. Access control / private & paid streams
- **Not natively supported.** Long-standing gap: issue #489 (password-protected livestream), #630 (private streaming), and **#4344 (a church wanting password-protected + multiple private streams, closed May 2025 as a duplicate of #489)** — directly the BibleWay use case, still unresolved. [7][8][9]
- Recommended pattern = **reverse proxy in front** (Nginx/Caddy/Apache) doing HTTP Basic auth or path-based/token access. Known caveat: **Safari does not send Authorization headers on WebSocket upgrade**, breaking chat under Basic auth. [7][10]
- To gate to BibleWay's authenticated app users you'd build custom glue: a proxy/edge that validates a BibleWay JWT (e.g. signed URL or cookie or header) before proxying `/hls/*`, `/ws`, `/api/*`, and `/embed/*` to Owncast. Owncast has **no billing/entitlement layer**, so "paid streams" = entirely BibleWay's own paywall + proxy. (Inference from docs + issues.)
- Note the RTMP **stream key** protects *ingest* (who can broadcast), not *playback* — playback is open by default.

### 7. ActivityPub / Federation [6]
- **Disabled by default.** Enabled only via Admin → Configuration → Social. When on: instance joins the Fediverse (Mastodon/Pleroma compatible), followers can follow, get auto-notified on go-live, and like/share/follow events surface in the chat feed; admin can post announcements. Requires HTTPS and a fixed username/host (changing it creates a new identity and orphans followers).
- **For BibleWay: leave it off.** It's opt-in, so no privacy leakage unless deliberately enabled; there's no partial/private-federation mode.

### 8. Moderation via API [2][3]
Available programmatically: hide/restore individual messages (`messagevisibility`), enable/disable (ban) users (`users/setenabled`), create IP bans (`ipbans/create`), promote/list moderators (`setmoderator`/`moderators`), delete users. Available through both Admin API (Basic auth) and Integration API (`HAS_ADMIN_ACCESS` bearer token), so BibleWay could drive moderation from its own backend/admin without exposing the Owncast admin UI.

## Implications for BibleWay
- **Playback (vs CF Stream HLS):** technically an easy swap for the *player* — same `expo-av` HLS pattern BibleWay already runs. But BibleWay loses CF's **signed-URL access control** (RS256 JWT on the manifest). Owncast's manifest is public; matching CF's `require_signed` behavior means building a reverse-proxy auth layer per broadcaster. This is real net-new work and a security-review surface.
- **Interactivity (vs Agora):** Owncast cannot replace Agora — it's one-way HLS (multi-second latency) with anonymous chat, no co-host/publish-back, no sub-second path, no per-user identity. (Aligns with R5's lane.)
- **Multi-broadcaster (critical):** every API here is **single-channel per instance**. `/api/status`, `/hls/stream.m3u8`, `/ws`, tokens, webhooks all describe one stream. For BibleWay's N simultaneous independent hosts you need one Owncast instance per live broadcaster and a routing/orchestration layer (R3's lane); the integration API gives you no notion of multiple concurrent channels. Webhooks/tokens must be provisioned per instance.
- **Webhooks:** usable to drive BibleWay's `live_streams` row transitions (STREAM_STARTED/STOPPED) and viewer counts (USER_JOINED/PARTED), replacing CF lifecycle polling — but you'd add your own shared-secret verification since there's no HMAC.
- **Moderation & chat bot:** the integration API is genuinely useful glue (system messages, moderation, bots) if Owncast chat were adopted; but anonymous identity means mapping BibleWay users requires proxy-injected `X-Forwarded-User` or a custom chat entirely.
- **Federation:** off by default — no action needed for a private app; keep it disabled.

## Open questions / uncertainties
- Exact WebSocket path (`/ws?accessToken=`) and register→connect handshake are from the consumer API + known client behavior; the *released* API reference page documents `register`/history but not the WS endpoint explicitly — treat WS path as high-confidence-but-not-quoted-from-docs. [1][12]
- Whether any webhook payload signing/secret was added in recent releases (0.1.x/0.2.x) — docs as read show none; worth confirming against the current changelog before relying on it.
- Whether object-storage/CDN-fronted HLS emits permissive CORS headers by default (matters only for WebView playback, not native RN). Not documented on the pages read.
- No evidence of any native entitlement/paywall/token-on-manifest feature as of Aug 2026; #489 remains the tracking issue.

## Sources
1. Owncast APIs (latest reference) — https://owncast.online/api/latest/
2. Build on top of Owncast — https://owncast.online/thirdparty/
3. APIs & Access Tokens — https://owncast.online/thirdparty/apis/
4. Webhooks — https://owncast.online/thirdparty/webhooks/
5. Embed & playback (HLS `/hls/stream.m3u8`, iframe, chat embeds) — https://owncast.online/docs/embed/
6. Social / Fediverse federation — https://owncast.online/docs/social/
7. Issue #630 — Support streaming privately — https://github.com/owncast/owncast/issues/630
8. Issue #489 — Password protected livestream — https://github.com/owncast/owncast/issues/489
9. Issue #4344 — Multiple streams + password protection (church use case; dup of #489) — https://github.com/owncast/owncast/issues/4344
10. SSL & HTTP Proxies (reverse-proxy + websocket proxying) — https://owncast.online/docs/sslproxies/
11. API documentation overview ("early days" integration hooks) — https://owncast.online/docs/api/
12. Discussion #2645 — Private stream via reverse proxy/Basic auth (Safari WS caveat) — https://github.com/owncast/owncast/discussions/2645
