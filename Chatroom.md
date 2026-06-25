# Chatroom — Study Chat / Audio Rooms (implementation plan)

*Turning the hardcoded `StudyChatScreen` into a real, multi-user, live audio room — plus the
faith-specific features that make it worth opening every day.*

This document is the build-ready expansion of **§7 "Phase 6 — Study Chat / Audio Rooms"** in
`BACKEND_PLAN.md`. It follows the same conventions as `PHASE1.md`–`PHASE3.md` (real SQL, real
endpoints, real frontend wiring) and the 10 golden rules. Read `BACKEND_PLAN.md` first if you
haven't.

---

## 0. Where we are today

| Layer | State |
|---|---|
| `Frontend/src/screens/StudyChatScreen.tsx` | UI is complete and polished, but renders `MOCK_ROOM_PARTICIPANTS`. Mute is local `useState`; "Raise hand", "Share", "+Invite", and 💬 do nothing. No audio. |
| `Frontend/src/types/index.ts` & `backend/packages/shared-types/src/audio-room.ts` | Contracts already exist: `AudioRoom`, `RoomParticipant`, `CreateRoomInput`, `RoomJoinToken`. |
| `Frontend/src/services/websocket.ts` + `useWebSocket.ts` | Reconnecting WS singleton already defined; `WSEventType` already includes `room_participant_update`. |
| `Frontend/src/services/api.ts` | Typed client with auth-token injection + 401 refresh. The React Query → real-API swap pattern is established (see `useLiveStreams.ts`). |
| `backend/` | NestJS API with `auth`, `profiles`, `denominations`, `podcasts`. Supabase + Redis services, cursor pagination, RLS, denormalized-count triggers all in place. **No `rooms` module yet.** |
| `backend/.env.example` | Already has `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `LIVEKIT_URL` placeholders (commented). |

**Decision (from `BACKEND_PLAN.md`, do not re-litigate):** audio media runs on **LiveKit Cloud**
(WebRTC SFU). We own room lifecycle, roles, discovery, and the faith features. We never push audio
bytes ourselves.

Audio Rooms depend only on **Phase 1 (auth)** — not on Live Video (4) or Live Chat (5) — so this can
be built next even though 4/5 aren't done yet.

---

## 1. ⚠️ Reality check before you write any code

**LiveKit's React Native SDK uses native WebRTC modules, so it does NOT run in Expo Go.** The README
says the app currently runs on Expo Go (SDK 54). The moment we add LiveKit, audio rooms require a
**custom development build** via `expo-dev-client` (run locally or with EAS Build).

What this means concretely:

- `npx expo start` + Expo Go keeps working for **every other screen**. Only the audio-room screen
  needs the dev build to function.
- Add `expo-dev-client` and build once: `npx expo run:android` / `npx expo run:ios` (local native
  toolchain) **or** `eas build --profile development`. After that, `npx expo start --dev-client`.
- Plan for an EAS account + iOS/Android signing before TestFlight/Play. This is the single biggest
  logistical change in this phase — surface it to the team early.
- Gracefully degrade: if the LiveKit native module isn't present (e.g. someone opens the room in
  Expo Go), the screen should show a "audio requires the full app build" state rather than crash.

Everything else below is standard.

---

## 2. Architecture at a glance

```
                       ┌─────────────────────────────────────────────┐
   React Native app    │  StudyChatScreen (dev build, LiveKit RN SDK) │
                       └───────────────┬─────────────────┬───────────┘
            REST (api.ts)              │                 │  WebRTC audio (media plane)
   ┌───────────────────────────────────┘                 ▼
   │                                              ┌──────────────────┐
   ▼                                              │  LiveKit Cloud    │
┌───────────────────────────┐   server SDK       │  (SFU + Egress)   │
│  NestJS API (RoomsModule)  │◀──────────────────▶│                  │
│  - create / list rooms      │   webhooks ───────▶└──────────────────┘
│  - mint join token (roles)  │
│  - raise-hand / promote/mute│   ┌──────────┐   ┌─────────────────────┐
│  - webhook receiver         │──▶│  Redis    │   │ Supabase (Postgres) │
│  - presence + counts        │   │ presence  │   │ audio_rooms,        │
└───────────────┬─────────────┘   │ hand queue│   │ prayer_requests,    │
                │  realtime fan-out└──────────┘   │ chat_messages, ...  │
                ▼                                  └─────────────────────┘
        Supabase Realtime Broadcast  ──▶  app (participant updates, reactions, prayer, chat)
```

**Division of labor:**

- **LiveKit** = the audio itself, active-speaker detection, mute state, recording (Egress).
- **Our API** = who's allowed to publish (roles), raise-hand → promote flow, room metadata,
  discovery list, denormalized counts, and all persistent faith data.
- **Redis** = ephemeral hot state (raise-hand queue, presence) — never a hot Postgres table (rule #4).
- **Postgres** = durable data (room records, prayer requests, chat history, recordings/recaps).

---

## 3. Data model

New migration. Number it after the current highest (`0005_podcasts_seed.sql`); if Phase 4/5 land
first, bump accordingly. Mirrors the exact style of `0004_podcasts.sql` (RLS on every table,
denormalized counts via `security definer` triggers, cursor-friendly indexes).

**Design note:** live participant state (who's speaking, hands raised) is **ephemeral** and lives in
LiveKit + Redis, *not* in a hot Postgres table (golden rule #4). Postgres stores only durable things:
the room record, prayer requests, chat history, and recordings/recaps.

```sql
-- 0006_audio_rooms.sql
-- Phase 6: audio rooms ("Study Chat"). The room record + durable faith data live here;
-- live participant/hand state is ephemeral (LiveKit + Redis). Counts are denormalized.

set search_path = public;

-- ===========================================================================
-- Rooms
-- ===========================================================================
create table if not exists public.audio_rooms (
  id                 uuid        primary key default gen_random_uuid(),
  host_id            uuid        not null references auth.users (id) on delete cascade,
  title              text        not null,
  subtitle           text        not null default '',
  -- The LiveKit room name we create + mint tokens against.
  livekit_room       text        not null unique,
  status             text        not null default 'scheduled'
                       check (status in ('scheduled','live','ended')),
  -- Faith features:
  denomination_id    text        references public.denominations (id) on delete set null,
  active_passage     text        not null default '',   -- e.g. 'Matthew 5:1-12' (the "Now reading")
  scheduled_start_at timestamptz,                        -- null = ad-hoc / "go live now"
  recurrence_rule    text,                               -- optional iCal RRULE for recurring rooms
  is_recording       boolean     not null default false,
  recording_egress_id text,                              -- LiveKit Egress id while recording
  recording_path     text,                               -- Storage path once the recording lands
  -- Denormalized display counts (rule #3) — updated async from webhooks, never COUNT(*) live.
  speaker_count      integer     not null default 0 check (speaker_count  >= 0),
  listener_count     integer     not null default 0 check (listener_count >= 0),
  started_at         timestamptz,
  ended_at           timestamptz,
  created_at         timestamptz not null default now()
);

-- Discovery: live rooms first, then soonest-scheduled. Supports the cursor list.
create index if not exists audio_rooms_status_idx on public.audio_rooms (status, started_at desc, id);
create index if not exists audio_rooms_schedule_idx on public.audio_rooms (scheduled_start_at) where status = 'scheduled';
create index if not exists audio_rooms_host_idx on public.audio_rooms (host_id);

-- ===========================================================================
-- Prayer requests (durable; a core faith feature, see §8)
-- ===========================================================================
create table if not exists public.prayer_requests (
  id          uuid        primary key default gen_random_uuid(),
  room_id     uuid        not null references public.audio_rooms (id) on delete cascade,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  text        text        not null check (char_length(text) between 1 and 500),
  prayed_count integer    not null default 0 check (prayed_count >= 0),  -- "🙏 I prayed" taps
  created_at  timestamptz not null default now()
);
create index if not exists prayer_requests_room_idx on public.prayer_requests (room_id, created_at desc, id);

-- "I prayed for this" — one per user per request (also drives prayed_count).
create table if not exists public.prayer_prayed (
  request_id uuid        not null references public.prayer_requests (id) on delete cascade,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

-- ===========================================================================
-- In-room text chat (the 💬 button). Shares the Phase 5 ChatMessage shape,
-- keyed by room_id — works for audio rooms and live streams alike.
-- ===========================================================================
create table if not exists public.chat_messages (
  id         uuid        primary key default gen_random_uuid(),
  room_id    text        not null,                 -- audio_rooms.id::text or a stream id
  user_id    uuid        not null references auth.users (id) on delete cascade,
  text       text        not null check (char_length(text) between 1 and 1000),
  sent_at    timestamptz not null default now()
);
create index if not exists chat_messages_room_idx on public.chat_messages (room_id, sent_at desc, id);

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table public.audio_rooms     enable row level security;
alter table public.prayer_requests enable row level security;
alter table public.prayer_prayed   enable row level security;
alter table public.chat_messages   enable row level security;

-- Rooms: anyone signed in can discover/read; only the host row-owner can create/update via RLS,
-- though most writes go through the service role in the API.
drop policy if exists "rooms readable by authed" on public.audio_rooms;
create policy "rooms readable by authed" on public.audio_rooms
  for select using (auth.uid() is not null);

drop policy if exists "host manages own rooms" on public.audio_rooms;
create policy "host manages own rooms" on public.audio_rooms
  for all using ((select auth.uid()) = host_id) with check ((select auth.uid()) = host_id);

-- Prayer requests + chat: readable by any authed participant; insert as yourself only.
drop policy if exists "prayer readable by authed" on public.prayer_requests;
create policy "prayer readable by authed" on public.prayer_requests
  for select using (auth.uid() is not null);
drop policy if exists "insert own prayer" on public.prayer_requests;
create policy "insert own prayer" on public.prayer_requests
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "own prayed" on public.prayer_prayed;
create policy "own prayed" on public.prayer_prayed
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "chat readable by authed" on public.chat_messages;
create policy "chat readable by authed" on public.chat_messages
  for select using (auth.uid() is not null);
drop policy if exists "insert own chat" on public.chat_messages;
create policy "insert own chat" on public.chat_messages
  for insert with check ((select auth.uid()) = user_id);

-- ===========================================================================
-- Denormalized prayed_count trigger (security definer; same pattern as 0004).
-- ===========================================================================
create or replace function public.bump_prayed_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.prayer_requests set prayed_count = prayed_count + 1 where id = new.request_id;
  elsif tg_op = 'DELETE' then
    update public.prayer_requests set prayed_count = greatest(prayed_count - 1, 0) where id = old.request_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_prayed_count on public.prayer_prayed;
create trigger trg_prayed_count
  after insert or delete on public.prayer_prayed
  for each row execute function public.bump_prayed_count();
```

Update the data-model diagram in `BACKEND_PLAN.md §11`:

```
audio_rooms (host_id → profiles, livekit_room, denormalized speaker/listener counts)
  ├─ prayer_requests ─< prayer_prayed   (durable)
  ├─ chat_messages (room_id)            (durable history; realtime via Broadcast)
  └─ live participant/hand state        (ephemeral: LiveKit + Redis)
```

---

## 4. Backend — `RoomsModule`

Create `backend/api/src/rooms/` (flat, like `auth/`, `podcasts/`, `denominations/` — ignore the
`./modules/<feature>` comment in `app.module.ts`; the real convention is flat). Register it in
`app.module.ts` alongside the others.

### 4.1 Dependencies & env

```bash
cd backend && npm install livekit-server-sdk --workspace @bibleway/api
```

Add to `backend/api/src/config/env.ts` (uncomment the matching lines in `.env.example`):

```ts
  // Phase 6 — LiveKit (audio rooms). Required for rooms to function.
  LIVEKIT_URL: z.string().url().optional(),        // wss://<project>.livekit.cloud
  LIVEKIT_API_KEY: z.string().min(1).optional(),
  LIVEKIT_API_SECRET: z.string().min(1).optional(),
  // Where Egress writes recordings (S3-compatible — Supabase Storage works). Optional (Tier 3).
  LIVEKIT_EGRESS_BUCKET: z.string().min(1).optional(),
```

Keep them `.optional()` so the API still boots before LiveKit is configured (same graceful-degrade
philosophy as `SupabaseService` / `RedisService`).

### 4.2 `livekit.service.ts` — thin SDK wrapper

```ts
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken, RoomServiceClient, WebhookReceiver, type VideoGrant,
} from 'livekit-server-sdk';
import type { Env } from '../config/env';
import type { ParticipantRole } from '@bibleway/shared-types';

// Grants per role. Listeners may publish *data* (reactions, raise-hand) but not audio.
const GRANTS: Record<ParticipantRole, Partial<VideoGrant>> = {
  host:     { canPublish: true,  canSubscribe: true, canPublishData: true, roomAdmin: true },
  speaker:  { canPublish: true,  canSubscribe: true, canPublishData: true },
  listener: { canPublish: false, canSubscribe: true, canPublishData: true },
};

@Injectable()
export class LiveKitService {
  private readonly logger = new Logger(LiveKitService.name);
  private _svc: RoomServiceClient | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {}

  private cfg<K extends keyof Env>(k: K): string {
    const v = this.config.get(k, { infer: true }) as string | undefined;
    if (!v) throw new ServiceUnavailableException(`${k} not configured — audio rooms are unavailable`);
    return v;
  }

  private get svc(): RoomServiceClient {
    if (!this._svc) {
      this._svc = new RoomServiceClient(this.cfg('LIVEKIT_URL'), this.cfg('LIVEKIT_API_KEY'), this.cfg('LIVEKIT_API_SECRET'));
    }
    return this._svc;
  }

  /** Create the LiveKit room. emptyTimeout closes it shortly after everyone leaves. */
  async createRoom(name: string): Promise<void> {
    await this.svc.createRoom({ name, emptyTimeout: 120, maxParticipants: 0 /* unlimited */ });
  }

  /** Mint a join token whose grants match the participant's role. */
  async mintToken(opts: {
    room: string; identity: string; displayName: string; avatarEmoji: string; role: ParticipantRole;
  }): Promise<string> {
    const at = new AccessToken(this.cfg('LIVEKIT_API_KEY'), this.cfg('LIVEKIT_API_SECRET'), {
      identity: opts.identity,
      name: opts.displayName,
      metadata: JSON.stringify({ avatarEmoji: opts.avatarEmoji, role: opts.role }),
      ttl: '4h',
    });
    at.addGrant({ roomJoin: true, room: opts.room, ...GRANTS[opts.role] });
    return at.toJwt(); // async in current SDK
  }

  /** Promote a listener → speaker (or demote) by updating their publish permission. */
  async setCanPublish(room: string, identity: string, canPublish: boolean): Promise<void> {
    await this.svc.updateParticipant(room, identity, undefined, { canPublish, canSubscribe: true, canPublishData: true });
  }

  /** Host force-mutes a speaker's audio track. */
  async muteTrack(room: string, identity: string, trackSid: string): Promise<void> {
    await this.svc.mutePublishedTrack(room, identity, trackSid, true);
  }

  async removeParticipant(room: string, identity: string): Promise<void> {
    await this.svc.removeParticipant(room, identity);
  }

  async endRoom(room: string): Promise<void> {
    await this.svc.deleteRoom(room);
  }

  /** Verify + parse a LiveKit webhook (Authorization header + raw body). */
  async receiveWebhook(body: string, authHeader: string) {
    const receiver = new WebhookReceiver(this.cfg('LIVEKIT_API_KEY'), this.cfg('LIVEKIT_API_SECRET'));
    return receiver.receive(body, authHeader);
  }
}
```

### 4.3 `rooms.service.ts` — lifecycle, roles, discovery

Key responsibilities (mirror `podcasts.service.ts` conventions — `supabase.admin`, cursor pagination,
`Paginated<T>`, Redis for hot state):

- **`createRoom(hostId, input)`** — generate `livekit_room` (e.g. `room_<uuid>`), call
  `livekit.createRoom`, insert the `audio_rooms` row (`status` = `'live'` for go-now or `'scheduled'`),
  return the `AudioRoom`.
- **`listLive(cursor)`** — `GET /rooms?live=true`; cursor-paginated, **cached in Redis** (short TTL
  ~5–10 s — everyone hits discovery). Invalidate on room start/end webhooks (rule #6).
- **`getJoinToken(roomId, user)`** — resolve the user's role (host if `host_id` matches, else
  `listener` by default; speakers are listeners who were promoted), load their profile
  (`display_name`, `avatar_emoji`), call `livekit.mintToken`, return `RoomJoinToken` `{ roomId, token,
  url: LIVEKIT_URL, role }`.
- **Raise-hand queue (Redis, ephemeral):** `raiseHand(roomId, userId)` → `RPUSH room:<id>:hands
  <userId>` (+ broadcast `room_hand_raised`); `listHands` → `LRANGE`; host **`approveSpeaker`** →
  `livekit.setCanPublish(room, identity, true)`, `LREM` the hand, broadcast `room_role_changed`.
- **`muteParticipant` / `removeParticipant` / `endRoom`** — host-only (check `host_id`), delegate to
  `LiveKitService`, broadcast the update.
- **`setActivePassage(roomId, host, passage)`** — host updates `active_passage`; broadcast
  `room_passage_changed` so every client's "Now reading" banner updates live.
- **Counts from webhooks:** on `participant_joined` / `participant_left` / role change, recompute
  `speaker_count` / `listener_count` and `UPDATE audio_rooms` (denormalized — never `COUNT(*)`).

> **Realtime fan-out:** reuse **Supabase Realtime Broadcast** on channel `room:<id>` (same approach
> the Phase 5 chat plan specifies). The frontend already has `wsService`; point it at the room channel
> and keep the existing `WSEvent` envelope. At tens-of-thousands concurrent, move fan-out to a Redis
> pub/sub + WS gateway (rule #4) — `wsService` won't need to change.

### 4.4 `rooms.controller.ts` — endpoints

| Method & path | Guard | Purpose |
|---|---|---|
| `POST /rooms` | `SupabaseAuthGuard` | Create a room (host). Body: `CreateRoomInput` (+ optional `scheduledStartAt`, `denominationId`). |
| `GET /rooms` | `OptionalAuthGuard` | Discovery list (`?live=true`, cursor). Cached. |
| `GET /rooms/:id` | `OptionalAuthGuard` | Room detail (title, subtitle, counts, `activePassage`). |
| `POST /rooms/:id/token` | `SupabaseAuthGuard` | Mint a LiveKit join token for the caller → `RoomJoinToken`. |
| `POST /rooms/:id/raise-hand` | `SupabaseAuthGuard` | Listener requests to speak. |
| `GET /rooms/:id/hands` | `SupabaseAuthGuard` | Host reads the raised-hand queue. |
| `POST /rooms/:id/speakers/:userId` | `SupabaseAuthGuard` | Host approves → promotes to speaker. |
| `DELETE /rooms/:id/speakers/:userId` | `SupabaseAuthGuard` | Host demotes a speaker back to listener. |
| `POST /rooms/:id/mute/:userId` | `SupabaseAuthGuard` | Host force-mutes a speaker. |
| `DELETE /rooms/:id/participants/:userId` | `SupabaseAuthGuard` | Host removes a participant. |
| `PATCH /rooms/:id/passage` | `SupabaseAuthGuard` | Host sets the "Now reading" passage. |
| `POST /rooms/:id/end` | `SupabaseAuthGuard` | Host ends the room. |
| `GET /rooms/:id/messages` | `OptionalAuthGuard` | In-room chat history (cursor). |
| `POST /rooms/:id/messages` | `SupabaseAuthGuard` | Send chat (rate-limited; persisted + broadcast). |
| `GET /rooms/:id/prayers` | `OptionalAuthGuard` | List prayer requests (cursor). |
| `POST /rooms/:id/prayers` | `SupabaseAuthGuard` | Post a prayer request (rate-limited). |
| `POST /rooms/:id/prayers/:prayerId/prayed` | `SupabaseAuthGuard` | "🙏 I prayed" (idempotent upsert). |
| `POST /webhooks/livekit` | none (signature-verified) | LiveKit room/participant events. |

Use `class-validator` DTOs exactly like `podcasts.dto.ts`. The webhook route must read the **raw
body** (configure Fastify raw-body for that path) and verify via `WebhookReceiver` — never trust it
unsigned.

### 4.5 Safety & abuse (from day one — rule #5 area)

- **Rate-limit** chat + prayer posts with a Redis token bucket (e.g. 5 msgs / 10 s) — `RedisService`
  is already present; add an `incr`+`expire` helper.
- **Profanity filter** + a `banned_users` check before persisting chat/prayer.
- **Report / block**, and host **mute / remove** (endpoints above). Faith communities are high-trust
  but not immune — moderation must ship with v1, not later.

---

## 5. Realtime event contract

Extend the `WSEventType` union in **both** places (they're intentionally duplicated and must stay in
sync): `backend/packages/shared-types/src/realtime.ts` and `Frontend/src/types/index.ts`.

```ts
export type WSEventType =
  | 'chat_message'
  | 'viewer_count_update'
  | 'stream_started'
  | 'stream_ended'
  | 'room_participant_update'   // already exists — join/leave/mute/speaking snapshot
  | 'room_hand_raised'          // { userId, displayName }
  | 'room_role_changed'         // { userId, role: 'speaker' | 'listener' }
  | 'room_passage_changed'      // { activePassage }
  | 'room_reaction'             // { userId, emoji }  (🙏 ❤️ 🔥 — ephemeral, not persisted)
  | 'prayer_added'              // { prayer: PrayerRequest }
  | 'room_ended';
```

All keep the existing `WSEvent<T>` envelope (`{ type, payload, roomId, timestamp }`), so `wsService`
and `useWebSocket` need **no structural change** — just new `on(...)` handlers.

Add a `PrayerRequest` type to `shared-types` (and mirror in frontend):

```ts
export interface PrayerRequest {
  id: string; roomId: string; userId: string; displayName: string;
  text: string; prayedCount: number; createdAt: string;
}
```

---

## 6. Frontend — make `StudyChatScreen` real

### 6.1 Install + configure (one-time, enables the dev build)

```bash
cd Frontend
npm install --legacy-peer-deps \
  livekit-client @livekit/react-native @livekit/react-native-webrtc \
  @livekit/react-native-expo-plugin @config-plugins/react-native-webrtc \
  expo-dev-client
```

Add the config plugins to `app.json` (or `app.config.js`) and set the iOS background-audio mode so a
room keeps playing when the screen locks:

```jsonc
{
  "expo": {
    "plugins": [
      "@livekit/react-native-expo-plugin",
      "@config-plugins/react-native-webrtc"
    ],
    "ios":     { "infoPlist": { "UIBackgroundModes": ["audio", "voip"] } },
    "android": { "permissions": ["RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS"] }
  }
}
```

Call `registerGlobals()` once at app entry (e.g. top of `Frontend/app/_layout.tsx`):

```ts
import { registerGlobals } from '@livekit/react-native';
registerGlobals();
```

Then build the dev client: `npx expo run:ios` / `npx expo run:android` (or `eas build --profile
development`), and from then on `npx expo start --dev-client`.

### 6.2 New files (match existing patterns)

- **`src/hooks/useAudioRoom.ts`** — owns the LiveKit `Room` lifecycle. Fetch a token from
  `POST /rooms/:id/token`, start the audio session, connect, and translate LiveKit room state into
  `RoomParticipant[]`:

```ts
import { useEffect, useRef, useState } from 'react';
import { AudioSession } from '@livekit/react-native';
import { Room, RoomEvent } from 'livekit-client';
import { api } from '../services/api';
import type { RoomParticipant, RoomJoinToken } from '../types';

function toParticipant(p: any): RoomParticipant {
  const meta = p.metadata ? JSON.parse(p.metadata) : {};
  return {
    id: p.identity,
    displayName: p.name || p.identity,
    avatarEmoji: meta.avatarEmoji ?? '🙂',
    role: p.permissions?.canPublish ? (meta.role === 'host' ? 'host' : 'speaker') : 'listener',
    isMuted: !p.isMicrophoneEnabled,
    isSpeaking: p.isSpeaking,
  };
}

export function useAudioRoom(roomId: string | null) {
  const roomRef = useRef<Room | null>(null);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (!roomId) return;
    let room: Room;
    (async () => {
      const join = await api.post<RoomJoinToken>(`/rooms/${roomId}/token`);
      await AudioSession.startAudioSession();
      room = new Room();
      roomRef.current = room;
      const sync = () =>
        setParticipants([room.localParticipant, ...room.remoteParticipants.values()].map(toParticipant));
      room
        .on(RoomEvent.ParticipantConnected, sync)
        .on(RoomEvent.ParticipantDisconnected, sync)
        .on(RoomEvent.ActiveSpeakersChanged, sync)
        .on(RoomEvent.TrackMuted, sync)
        .on(RoomEvent.TrackUnmuted, sync)
        .on(RoomEvent.ParticipantPermissionsChanged, sync);
      await room.connect(join.url, join.token);
      await room.localParticipant.setMicrophoneEnabled(false); // join muted
      sync();
    })();
    return () => { roomRef.current?.disconnect(); AudioSession.stopAudioSession(); };
  }, [roomId]);

  const toggleMute = async () => {
    const room = roomRef.current; if (!room) return;
    const next = !muted; setMuted(next);
    await room.localParticipant.setMicrophoneEnabled(!next);
  };
  const raiseHand = () => api.post(`/rooms/${roomId}/raise-hand`);
  return { participants, muted, toggleMute, raiseHand };
}
```

- **`src/store/useRoomStore.ts`** — zustand store (mirror `useLiveStore.ts`) for room-level realtime
  state the audio SDK doesn't own: `activePassage`, `handQueue`, `prayers`, `reactions`, chat
  `messages`. Fed by `wsService.on('room_passage_changed' | 'room_hand_raised' | 'prayer_added' |
  'room_reaction' | 'chat_message', ...)` in a `useRoomEvents(roomId)` hook (model on `useWebSocket`).

- **`src/hooks/useAudioRooms.ts`** — discovery list (React Query, mirror `useLiveStreams.ts`,
  `refetchInterval: 15_000`), so the Home feed can show *real* live rooms instead of a single
  hardcoded entry.

### 6.3 Rewrite `StudyChatScreen.tsx`

Keep the exact UI/markup — only swap the data source and wire the buttons. The screen is opened as a
full-screen `Modal` from `app/index.tsx` driven by `useAppStore` `activeScreen === 'studychat'`; it
needs the room id, so extend the store to carry `activeRoomId` (or pass it as a prop alongside
`onClose`).

```tsx
// const participants = MOCK_ROOM_PARTICIPANTS;   ← delete
const { participants, muted, toggleMute, raiseHand } = useAudioRoom(roomId);
const { activePassage } = useRoomStore();
// ...
<Text style={styles.roomSubtitle}>{activePassage || subtitle}</Text>   // live "Now reading"
// Footer mic button:
onPress={toggleMute}   // was: setIsMuted((m) => !m)
// Status bar:
<TouchableOpacity onPress={raiseHand}><Text style={styles.statusAction}>Raise hand ✋</Text></TouchableOpacity>
// 💬 button → open the in-room chat sheet (useRoomStore.messages + POST /rooms/:id/messages)
// "Share" / "+Invite" → deep link rooms/:id (expo-linking is already a dependency)
```

The existing speaking-border animation and mute-badge already react to `isSpeaking` / `isMuted`, so
they "just work" once `participants` comes from `useAudioRoom`. Add a host-only control sheet
(approve raised hands, mute/remove) shown when the local participant's role is `host`.

---

## 7. The impactful features

Three tiers. Tier 1 is "make the current screen genuinely work." Tiers 2–3 are what make a faith
audio room worth opening daily instead of just being a Clubhouse clone.

### Tier 1 — Make it real (this is the MVP; covered by §4–6)

Real WebRTC audio · speaker / listener roles enforced by token grants · **raise-hand → host promotes
to speaker** · self-mute + host force-mute / remove · live presence + denormalized counts ·
live-rooms discovery on the Home feed · working **Share / +Invite** deep links (`expo-linking` is
already installed). Nothing here is net-new infra beyond LiveKit; it's the screen doing what it
already pretends to do.

### Tier 2 — Faith features that ship with (or just after) v1

**① Live "Now Reading" scripture sync.** The subtitle *"Understanding the Beatitudes • Matthew 5"* is
the whole point of a *Bible* study room — make it live. Host sets the active passage
(`PATCH /rooms/:id/passage` → `room_passage_changed`); every participant's banner updates instantly
and is **tappable** to open the passage. *Build:* `active_passage` column + event already speced; add
a passage picker for the host and a reader sheet (your own scripture data or a Bible API). *Effort: S.*

**② Prayer requests + "🙏 I prayed".** Uniquely faith, and the highest-retention idea here: listeners
who'll never grab the mic still participate, and requests **persist after the room ends**. Tables
(`prayer_requests`, `prayer_prayed`) + endpoints + `prayer_added` event are speced in §3–4. Show a
prayer panel; tapping 🙏 increments the count (idempotent) and can notify the requester later.
*Effort: M.*

**③ Live reactions (🙏 ❤️ 🔥 Amen).** Lightweight, ephemeral floating emojis so a 500-person room
*feels* alive without 500 mics. Send over LiveKit's **data channel** (listeners have `canPublishData`)
or `room_reaction` broadcast — no DB writes. *Effort: S.*

**④ In-room text chat (the 💬 button).** Back the existing chat icon with the `chat_messages` table
(keyed by `room_id`, shared with Phase 5) + Supabase Realtime Broadcast, rate-limited and
profanity-filtered. *Effort: M.*

**⑤ Denomination-scoped discovery.** You already have denominations + a per-user `denominationId`. Tag
rooms (`denomination_id`) and let discovery filter/sort by the user's tradition, so a Catholic sees
Catholic studies first. *Effort: S.*

### Tier 3 — Retention & reach

**⑥ Record → replay as a podcast.** The biggest content flywheel: start LiveKit **Egress** (audio-only
composite) when a room goes live, write the file to Storage, and on `egress_ended` create a
`podcast_episodes` row — so finished study rooms automatically become **on-demand episodes** in the
podcasts feature you already built. Turns ephemeral conversation into a durable, discoverable library.
*Build:* `EgressClient.startRoomCompositeEgress` (audio-only), `recording_*` columns (§3), an
`egress_ended` webhook handler, reuse podcasts ingestion. *Effort: L.*

**⑦ Scheduled & recurring rooms + reminders.** Recurring Bible studies are inherently calendar events.
`scheduled_start_at` + `recurrence_rule` (iCal RRULE) are in the schema; show upcoming rooms, let
users RSVP, and send **Expo Push** reminders ("Beatitudes study starts in 10 min") — push is already
on the Phase 8 hardening list. Drives the return visits a live-only product can't. *Effort: M.*

**⑧ AI study recap.** After a recorded room ends, run an async job (pg-boss / QStash, per
`BACKEND_PLAN.md`): transcribe the Egress audio (Whisper / Deepgram) → generate a summary, extract the
**scripture references** discussed, and save a shareable recap attached to the room/episode. Great for
accessibility and for the 90% who couldn't attend live. *Effort: L.*

---

## 8. Build order & effort

| # | Step | Depends on | Effort | Notes |
|---|------|-----------|--------|-------|
| A | LiveKit Cloud project + `expo-dev-client` dev build | — | M | The unblock-everything step. Do first. |
| B | `0006_audio_rooms.sql` migration | A | S | Tables, RLS, triggers. |
| C | `RoomsModule`: create / discovery / **join token** | B | M | Get audio working end-to-end for the host. |
| D | Frontend: `useAudioRoom` + rewrite `StudyChatScreen` | C | M | Real audio + participant list. **Tier 1 demo.** |
| E | Raise-hand → promote, host mute / remove | C,D | M | Roles become interactive. |
| F | Discovery on Home feed + Share/Invite deep links | C,D | S | Real rooms replace the mock entry. |
| G | Now-Reading sync · reactions · prayer · in-room chat | D,E | M | **Tier 2** faith features. |
| H | Record → replay-as-podcast | C | L | **Tier 3.** Reuses podcasts. |
| I | Scheduled/recurring + push reminders | C | M | **Tier 3.** |
| J | AI study recap | H | L | **Tier 3.** Async job + transcription. |

**Recommended sequence:** A → B → C → D → E → F (ship Tier 1 + start Tier 2) → G → then H/I/J as
capacity allows. Hardening (rate limits, moderation, load test) runs alongside, not after.

## 9. Task checklist

**Foundations**
- [ ] Create LiveKit Cloud project; copy `LIVEKIT_URL` / `API_KEY` / `API_SECRET` into `backend/.env`.
- [ ] Add LiveKit vars to `config/env.ts` (optional, graceful-degrade).
- [ ] Add `expo-dev-client` + LiveKit RN packages; add config plugins to `app.json`; `registerGlobals()`.
- [ ] Produce a dev build (`expo run:*` or EAS) and confirm the app launches off Expo Go for this screen.

**Backend**
- [ ] Write + apply `0006_audio_rooms.sql`; verify RLS + the `prayed_count` trigger.
- [ ] Add `RoomsModule` (`livekit.service.ts`, `rooms.service.ts`, `rooms.controller.ts`, DTOs); register in `app.module.ts`.
- [ ] Implement create / discovery (Redis-cached) / join-token.
- [ ] Implement raise-hand queue (Redis) + approve/promote + host mute/remove + end-room.
- [ ] Implement `PATCH /passage`, prayer endpoints, in-room chat endpoints (rate-limited + filtered).
- [ ] Implement `POST /webhooks/livekit` (raw body + `WebhookReceiver`); update counts + invalidate cache.

**Frontend**
- [ ] Extend `WSEventType` (shared-types **and** `Frontend/src/types`); add `PrayerRequest`.
- [ ] Add `useAudioRoom`, `useRoomStore`, `useRoomEvents`, `useAudioRooms`.
- [ ] Rewrite `StudyChatScreen` off `useAudioRoom` (delete `MOCK_ROOM_PARTICIPANTS` usage); wire mute, raise-hand, 💬, Share/Invite.
- [ ] Host control sheet (approve hands, mute, remove).
- [ ] Live rooms on the Home feed; deep-link `rooms/:id`.

**Tier 2 / 3**
- [ ] Now-Reading picker + reader sheet; reactions; prayer panel; in-room chat sheet.
- [ ] Denomination-tagged discovery filter.
- [ ] Egress recording → `podcast_episodes`; scheduled/recurring + Expo Push; AI recap job.

**Hardening (alongside)**
- [ ] Redis token-bucket rate limits on chat + prayer; `banned_users` check; report/block.
- [ ] `k6` load test (a viral room: thousands joining + discovery + chat fan-out).
- [ ] Budget alerts on LiveKit usage (media is the top cost lever).

## 10. Scale & cost notes

- **LiveKit Cloud scales the rooms/participants** — your scale concerns are only token minting
  (stateless, cheap), role transitions, and the discovery list (Redis-cached, rule #6).
- **Never `COUNT(*)`** speakers/listeners live — counts are denormalized columns updated from webhooks
  (rule #3).
- **Don't fan realtime through Postgres** at high volume — Supabase Broadcast first, Redis pub/sub + WS
  gateway when a single room hits tens of thousands (rule #4). `wsService` stays the same.
- **Media is the biggest cost lever.** Audio is far cheaper than video, but recording (Egress) + AI
  transcription add up — gate Tier 3 behind budget alerts and only record rooms whose host opts in.

## 11. Verification (definition of done)

- **Two real devices**, two accounts: host goes live, listener joins and hears audio; listener raises
  hand, host approves, listener's mic now publishes and the speaking border animates on the host's
  screen. Host mutes them; badge flips. Host ends room; both clients clean up.
- **Token grants enforced server-side:** a listener token cannot publish audio even if the client
  tries (verify in LiveKit, not just the UI).
- **Webhook → counts:** join/leave moves `speaker_count` / `listener_count`; discovery cache
  invalidates within its TTL.
- **RLS:** a non-participant can't read another room's chat/prayers via the REST API; rate limits trip
  on rapid chat/prayer spam.
- **Degrade:** with `LIVEKIT_*` unset the API still boots and `/health` is green; opening the room in
  Expo Go shows the "needs full build" state, not a crash.

## 12. Open decisions

1. **Scripture source** for Now-Reading / recap references — your own seeded data vs. a licensed Bible
   API (watch translation licensing). Affects feature ①/⑧.
2. **Who can host?** Anyone, verified users only (`profiles.is_verified` exists), or denomination
   leaders? Drives the `POST /rooms` guard.
3. **Record by default or opt-in?** Recommend **opt-in** (host toggle) — consent + cost. Affects ⑥/⑧.
4. **EAS vs. local builds** for distributing the dev/preview app to testers.

---

*This plan reuses what's already built — `api.ts`, `wsService`, React Query hooks, the NestJS module
pattern, RLS + denormalized-count conventions, and the podcasts pipeline — so most of the work is
LiveKit integration + the faith features, not new infrastructure.*



