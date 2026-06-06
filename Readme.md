# BibleWay — Faith-Based Multimedia Platform

A real-time multimedia platform for faith communities: live video streaming, Clubhouse-style
audio study rooms, podcasts, live chat, denomination discovery, and community profiles.

This repository is a **monorepo**:

```
Bible_Read/
├── Frontend/          # React Native + Expo app (built — runs on Expo Go)
├── backend/           # Node.js + TypeScript backend (in progress — Phase 0)
├── BACKEND_PLAN.md    # The full, authoritative backend roadmap (read this first)
└── Readme.md          # You are here
```

---

## 📍 RESUME HERE (context for picking this up later)

> **If you are an AI assistant or a developer starting fresh, read this section first, then
> `BACKEND_PLAN.md`.** It captures everything decided so far so work can continue without the
> original chat history.

### What this project is
BibleWay started as a **frontend-only** Expo app using mock data (`Frontend/src/services/mockData.ts`).
The goal now is to build a **scalable backend** that replaces the mock data and supports millions of
users without breaking — smooth, fast, real-time.

### Current state
- **Frontend:** Complete and running on **Expo SDK 54** (upgraded from 52). Uses mock data for all
  features. Runs on Expo Go (`cd Frontend && npx expo start`).
  - Note: `react-native-track-player` was removed (incompatible with Expo Go); podcast playback will
    use `expo-av`. `react-native-worklets` + `babel-preset-expo` + `expo-linking` were added during
    the SDK 54 upgrade. Frontend installs require `npm install --legacy-peer-deps` (React 19 peer graph).
- **Backend:** Being built now, starting with **Phase 0 (Foundations)**.

### Decided backend stack (do not re-litigate without reason)
| Concern | Choice |
|---|---|
| Core platform | **Supabase** (Postgres + Auth + Storage + Realtime + Edge Functions) |
| Custom API | **Node.js + TypeScript** with **NestJS** (Fastify adapter) |
| Live video | **Mux** (RTMP ingest → HLS playback + recordings) |
| Audio rooms | **LiveKit Cloud** (WebRTC SFU) |
| Live chat / presence | **Supabase Realtime** first → dedicated WS gateway (Redis pub/sub) at scale |
| Cache / rate-limit | **Upstash Redis** |
| Search | Postgres full-text → **Typesense/Algolia** later |
| Jobs/queue | **pg-boss** or Upstash QStash |
| Philosophy | **Managed-first** — don't self-host media; lean on hosted infra |

### The 10 golden rules (why it won't break at scale) — enforced in every phase
1. Always use the **connection pooler** (Supabase transaction pooler / PgBouncer).
2. **Cursor pagination**, never `OFFSET`.
3. **Never `COUNT(*)` live** for hot numbers — denormalize counts, update async.
4. **Don't fan out real-time through Postgres** at high volume — move to Redis + WS gateway.
5. **CDN** for every non-dynamic byte (media, thumbnails, avatars, reference data).
6. **Cache hot reads** in Redis (feeds, counts, denominations).
7. **Everything slow is async** (transcoding callbacks, notifications, reconciliation).
8. **RLS on every table** — security at the database.
9. **Stateless API** behind a load balancer — scale horizontally.
10. **Observability from day one** (errors, metrics, tracing, load tests).

### Build order (each phase ships a working feature) — see BACKEND_PLAN.md for full detail
| Phase | Feature | Status |
|---|---|---|
| **0** | Foundations (Supabase projects, NestJS API, migrations, CI, shared types) | 🟡 **In progress** |
| 1 | Auth & Profiles | 🟡 **Code complete — needs migrations applied + env set** |
| 2 | Denominations (warm-up) | 🟡 **Code complete — needs `supabase db push`** |
| 3 | Podcasts | 🟡 **Code complete — needs `supabase db push`** |
| 4 | Live Video (Mux) | ⬜ Not started |
| 5 | Live Chat | ⬜ Not started |
| 6 | Audio Rooms (LiveKit) | ⬜ Not started |
| 7 | Search & Discovery | ⬜ Not started |
| 8 | Hardening for millions | ⬜ Ongoing |

### Phase 0 progress (what's been scaffolded)
- `backend/` isolated npm-workspaces project (kept separate from Frontend so the Expo app is untouched).
- `backend/packages/shared-types/` — domain types (single source of truth).
- `backend/api/` — NestJS + Fastify app with env config, Supabase client module, and `/health`.
- `backend/supabase/` — CLI config + migrations folder + initial extensions migration.
- `.github/workflows/backend-ci.yml` — typecheck/build CI.
- `Frontend/src/services/api.ts` — zero-dependency typed API client (reads `EXPO_PUBLIC_API_URL`).

### Manual steps the human must do (need their accounts — can't be automated)
1. Create Supabase projects (`dev`, `staging`, `prod`) at supabase.com; copy the URL + anon + service-role keys into `backend/.env` (see `backend/.env.example`).
2. Install the Supabase CLI and run `supabase link` + `supabase db push` to apply migrations.
3. Create Mux, LiveKit, and Upstash accounts when their phases arrive (4, 6, 8).

### How to continue right now
```bash
cd backend
npm install
npm run dev        # starts the API; GET http://localhost:3000/health → { status: "ok" }
```
Then begin **Phase 1 (Auth & Profiles)** as described in `BACKEND_PLAN.md §2`.

---

## Frontend (built)

| Layer | Library |
|---|---|
| Framework | React Native 0.81 + **Expo SDK 54** |
| Routing | Expo Router v6 (file-based) |
| Server state | TanStack Query v5 |
| Client state | Zustand v5 |
| Podcast playback | expo-av (track-player removed for Expo Go compatibility) |
| Real-time | WebSocket (custom service in `src/services/websocket.ts`) |
| Animations | React Native Animated API + Reanimated 4 (worklets) |
| Gradients | expo-linear-gradient |
| Styling | StyleSheet (no third-party UI library) |

### Frontend structure
```
Frontend/
  app/
    _layout.tsx          # QueryClientProvider + SafeAreaProvider + StatusBar
    index.tsx            # Root: HomeScreen + Modal overlays for each feature screen
  src/
    components/          # VideoPlayer, ProfileSection, ActionButtons, ui/ primitives
    screens/             # Home, LiveStream, StudyChat, Podcast, Denomination, EditProfile
    store/               # Zustand: useAppStore, useLiveStore, usePodcastStore
    services/            # queryClient, websocket, mockData, api (new)
    hooks/               # useWebSocket, useLiveStreams, usePodcasts
    theme/               # colors, typography, spacing design tokens
    types/               # All TypeScript interfaces & enums
```

### Run the frontend
```bash
cd Frontend
npm install --legacy-peer-deps    # React 19 peer graph requires the flag
npx expo start                    # scan QR with Expo Go (SDK 54)
```

---

## Backend (in progress)

See **`BACKEND_PLAN.md`** for the complete feature-by-feature roadmap, data model, and scaling
strategy. Quickstart:

```bash
cd backend
npm install
npm run dev          # NestJS API on http://localhost:3000
npm run build        # compile all workspaces
npm run typecheck    # type-check without emit
```

### Backend structure (target)
```
backend/
  api/                       # NestJS + Fastify HTTP API
    src/
      main.ts                # bootstrap
      app.module.ts          # root module
      config/                # env loading + validation
      supabase/              # Supabase client provider
      health/                # /health endpoint
      modules/               # feature modules added per phase (auth, profiles, ...)
  packages/
    shared-types/            # domain types shared across backend
  supabase/
    config.toml              # Supabase CLI config
    migrations/              # versioned SQL migrations (source of truth for schema)
    seed.sql                 # seed/reference data
```

---

## Real-Time Architecture (frontend contract)

- **WebSocket service** (`Frontend/src/services/websocket.ts`) — reconnecting singleton with
  exponential backoff. `WSEvent` types already defined: `chat_message`, `viewer_count_update`,
  `stream_started`, `stream_ended`, `room_participant_update` — these map directly onto the
  Mux/LiveKit webhooks the backend will emit.
- **TanStack Query** handles REST data with centralised query keys (`Frontend/src/services/queryClient.ts`).
- **Zustand** manages UI-local state.

When wiring real data, swap the `queryFn` bodies in `Frontend/src/hooks/` from `mockData` to calls
through `Frontend/src/services/api.ts`.
