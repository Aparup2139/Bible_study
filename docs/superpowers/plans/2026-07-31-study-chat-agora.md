# Study Chat (Agora Audio Room) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the hardcoded `StudyChatScreen` (currently rendering `MOCK_ROOM_PARTICIPANTS`) into one real, live audio room — self-mute, raise-hand, host-approves-to-speak — using the Agora RTC integration the app already has for video live streaming, so this ships with zero new services, zero new native SDKs, and zero new paid accounts.

**Architecture:** One singleton "live" study room at a time (no room list/discovery — the app has exactly one "Study Chat" button, so it needs exactly one room). Tapping it calls `POST /rooms/join`: if no room is live, the caller becomes host and one is created; otherwise they join as a listener. The backend mints an Agora RTC token (reusing the existing `AgoraService`) with publisher privileges for host/speaker and subscriber-only for listeners. Role changes (raise-hand → host promotes, host force-mutes) are plain Postgres rows discovered by polling — the same `refetchInterval` pattern `useLiveStreams.ts` already uses for viewer counts, so no WebSocket/Redis layer is added.

**Tech Stack:** Agora RTC (`react-native-agora` v4.6.2 already installed; `agora-token` v2.0.5 already installed on the backend), NestJS + Supabase (existing `streams` module conventions), React Query polling (existing convention).

**Why Agora, not the LiveKit plan in `Chatroom.md`:** `Chatroom.md` specs a LiveKit-based audio-room build (new SDK, new dev-build config, new server SDK, webhooks). That was never started — no `0006_audio_rooms.sql` exists, no LiveKit package is installed. Since the app already ships Agora for live video (dev build, native module wrapper, token minting, the exact join/renew/teardown pattern this plan reuses), building audio rooms on Agora instead is strictly less new surface area and literally free to try (Agora's free tier is 10,000 RTC minutes/month, and this reuses the *same* App ID already configured — no new account, no new bill). This plan supersedes `Chatroom.md`'s architecture choice; `Chatroom.md`'s Tier 2/3 ideas (Now-Reading sync, prayer requests, recordings, scheduling) are unaffected and can still be layered on later regardless of which RTC vendor is under the hood.

## Global Constraints

- Reuse the existing Agora App ID / certificate (`AGORA_APP_ID`, `AGORA_APP_CERTIFICATE` in `backend/api/src/config/env.ts`) — do not provision a new Agora project.
- Reuse `AgoraService.buildRtcToken()` as-is (`backend/api/src/streams/agora.service.ts`) — it is already generic over channel name/uid/role/ttl; **do not modify it**.
- Audio only. Do not call `enableVideo()` — this room has no camera.
- No Redis, no WebSocket gateway, no Supabase Realtime for this feature. Traffic is one small room; plain Postgres rows + 4–5s polling (matching `useStreamDetail`'s existing 4s interval) is sufficient. Note where this would need to change if traffic grows (golden rule #4 in `BACKEND_PLAN.md`) but do not build that now.
- No automated test suite exists in this repo (`backend/api`'s `test` script is a no-op; the frontend has none). Follow the codebase's existing convention: verify each backend task with `curl` against a running `npm run dev`, and each frontend task by running the dev build on a device/emulator. Do not introduce a new test framework as part of this plan.
- Out of scope for this plan (explicitly cut, revisit later if wanted): the 💬 in-room text chat button, Share/+Invite deep links, room discovery/list UI, scheduling, prayer requests, recording, denomination filtering, remote "is speaking" ring animation (Agora's active-speaker event isn't wired to a uid→user mapping yet — see Task 6 note).

---

## File Structure

**Backend (new):**
- `backend/supabase/migrations/0009_study_rooms.sql` — `study_rooms` + `study_room_participants` tables + RLS.
- `backend/api/src/rooms/rooms.service.ts` — join/create-or-join, token re-mint, raise-hand, promote, force-mute, leave, end, stale-room sweep.
- `backend/api/src/rooms/rooms.controller.ts` — HTTP endpoints.
- `backend/api/src/rooms/rooms.module.ts` — wires the above; imports `StreamsModule` to reuse `AgoraService`.
- `backend/api/src/rooms/dto/rooms.dto.ts` — `JoinRoomDto`, `MuteDto`.

**Backend (modified):**
- `backend/packages/shared-types/src/audio-room.ts` — replace the LiveKit-flavored types with the Agora-flavored ones this plan actually uses.
- `backend/api/src/streams/streams.module.ts` — export `AgoraService` (one line) so `RoomsModule` can reuse it.
- `backend/api/src/app.module.ts` — register `RoomsModule`.

**Frontend (new):**
- `Frontend/src/hooks/useStudyRoom.ts` — join/detail/participants/raise-hand/promote/mute/leave/end hooks (mirrors `useLiveStreams.ts`).

**Frontend (modified):**
- `Frontend/src/types/index.ts` — extend `RoomParticipant` (`handRaised`), simplify `AudioRoom` (`status` instead of `isLive`).
- `Frontend/src/screens/StudyChatScreen.tsx` — delete `MOCK_ROOM_PARTICIPANTS` usage; join a real Agora channel; wire mute, raise-hand, host promote/mute controls, leave/end.

---

## Task 1: Agora-flavored shared types

**Files:**
- Modify: `backend/packages/shared-types/src/audio-room.ts`

**Interfaces:**
- Produces: `ParticipantRole`, `StudyRoomSummary`, `StudyRoomParticipant`, `JoinRoomResult` — consumed by Task 3's `RoomsService`/`RoomsController`.

- [ ] **Step 1: Replace the file contents**

```ts
// Study Chat (audio room) — backed by Agora RTC, reusing the same App ID as
// video live streaming (see streams/agora.service.ts). One room is live at a
// time; joining auto-hosts if none exists (no discovery/list UI for this).

export type ParticipantRole = 'host' | 'speaker' | 'listener';

export interface StudyRoomSummary {
  id: string;
  title: string;
  subtitle: string;
  status: 'live' | 'ended';
  speakerCount: number;
  listenerCount: number;
}

export interface StudyRoomParticipant {
  userId: string;
  displayName: string;
  avatarEmoji: string;
  role: ParticipantRole;
  handRaised: boolean;
  forceMuted: boolean;
}

/** Returned by POST /rooms/join and POST /rooms/:id/token — what the client needs to join the Agora channel. */
export interface JoinRoomResult {
  roomId: string;
  /** Agora channel name (== roomId). */
  channel: string;
  /** Wildcard uid — Agora assigns the session's actual uid on join. */
  uid: number;
  token: string;
  appId: string;
  role: ParticipantRole;
}
```

- [ ] **Step 2: Rebuild the package and typecheck**

Run: `cd backend && npm run build:types && npm run typecheck --workspace @bibleway/api`
Expected: no errors (nothing imports the old `AudioRoom`/`RoomParticipant`/`CreateRoomInput`/`RoomJoinToken` names yet, so this is a clean swap).

- [ ] **Step 3: Commit**

```bash
git add backend/packages/shared-types/src/audio-room.ts
git commit -m "feat(rooms): switch shared audio-room types from LiveKit to Agora shape"
```

---

## Task 2: `study_rooms` / `study_room_participants` migration

**Files:**
- Create: `backend/supabase/migrations/0009_study_rooms.sql`

**Interfaces:**
- Produces: tables `public.study_rooms`, `public.study_room_participants` — consumed by Task 3's `RoomsService` (via `supabase.admin`).

- [ ] **Step 1: Write the migration**

```sql
-- Study Chat: a single live audio room at a time, backed by Agora RTC (same
-- App ID as video live streaming — see 0007_streams_agora.sql). Role/hand-raise/
-- mute state is small and low-traffic enough to live directly in Postgres; no
-- Redis needed at this scale (see rooms.service.ts for the reasoning).
set search_path = public;

create table if not exists public.study_rooms (
  id             uuid        primary key default gen_random_uuid(),
  host_id        uuid        not null references auth.users (id) on delete cascade,
  title          text        not null default 'Bible Study Discussion',
  subtitle       text        not null default '',
  status         text        not null default 'live' check (status in ('live','ended')),
  speaker_count  integer     not null default 0 check (speaker_count >= 0),
  listener_count integer     not null default 0 check (listener_count >= 0),
  started_at     timestamptz not null default now(),
  ended_at       timestamptz
);

-- "Find the live room" is the hot read (every join + every detail poll).
create index if not exists study_rooms_status_idx on public.study_rooms (status, started_at desc);

create table if not exists public.study_room_participants (
  room_id      uuid        not null references public.study_rooms (id) on delete cascade,
  user_id      uuid        not null references auth.users (id) on delete cascade,
  display_name text        not null,
  avatar_emoji text        not null default '🙂',
  role         text        not null default 'listener' check (role in ('host','speaker','listener')),
  hand_raised  boolean     not null default false,
  force_muted  boolean     not null default false,
  joined_at    timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists study_room_participants_room_idx on public.study_room_participants (room_id, joined_at);

alter table public.study_rooms             enable row level security;
alter table public.study_room_participants enable row level security;

-- Reads only — all writes go through the API's service-role client
-- (supabase.admin), same convention as live_streams (0006_streams.sql).
drop policy if exists "rooms readable by authed" on public.study_rooms;
create policy "rooms readable by authed" on public.study_rooms
  for select using (auth.uid() is not null);

drop policy if exists "participants readable by authed" on public.study_room_participants;
create policy "participants readable by authed" on public.study_room_participants
  for select using (auth.uid() is not null);
```

- [ ] **Step 2: Apply the migration**

Run: `cd backend && npx supabase db push` (or the project's existing migration-apply command — check `Readme.md` / `BACKEND_PLAN.md` §1 for whichever the team already uses for `0001`–`0008`).
Expected: migration `0009_study_rooms.sql` applies with no errors; `supabase db diff` (or the dashboard's Table Editor) shows both new tables with RLS enabled.

- [ ] **Step 3: Verify RLS manually**

Run in the Supabase SQL editor: `select * from public.study_rooms;` while authenticated as the `anon` role (no `auth.uid()`).
Expected: 0 rows returned (not an error) — the `auth.uid() is not null` policy blocks anonymous reads, confirming RLS is active.

- [ ] **Step 4: Commit**

```bash
git add backend/supabase/migrations/0009_study_rooms.sql
git commit -m "feat(rooms): add study_rooms and study_room_participants tables"
```

---

## Task 3: `RoomsModule` — service, controller, DTOs, registration

**Files:**
- Modify: `backend/api/src/streams/streams.module.ts`
- Create: `backend/api/src/rooms/dto/rooms.dto.ts`
- Create: `backend/api/src/rooms/rooms.service.ts`
- Create: `backend/api/src/rooms/rooms.controller.ts`
- Create: `backend/api/src/rooms/rooms.module.ts`
- Modify: `backend/api/src/app.module.ts`

**Interfaces:**
- Consumes: `AgoraService.appId`, `AgoraService.buildRtcToken(channel, uid, role, ttlSeconds?)` (from Task-0 existing code, `backend/api/src/streams/agora.service.ts:44-63`); `ParticipantRole`, `StudyRoomSummary`, `StudyRoomParticipant`, `JoinRoomResult` (Task 1); `study_rooms`/`study_room_participants` tables (Task 2); `SupabaseAuthGuard`, `OptionalAuthGuard`, `CurrentUser`, `AuthUser` (existing `backend/api/src/auth/*`).
- Produces: `POST /rooms/join`, `POST /rooms/:id/token`, `GET /rooms/:id`, `GET /rooms/:id/participants`, `POST /rooms/:id/raise-hand`, `POST /rooms/:id/promote/:userId`, `POST /rooms/:id/mute/:userId`, `POST /rooms/:id/leave`, `POST /rooms/:id/end` — consumed by Task 4's frontend hooks.

- [ ] **Step 1: Export `AgoraService` from `StreamsModule`**

In `backend/api/src/streams/streams.module.ts`, change:

```ts
  exports: [StreamsService],
```
to:
```ts
  exports: [StreamsService, AgoraService],
```

- [ ] **Step 2: Write the DTOs**

```ts
// backend/api/src/rooms/dto/rooms.dto.ts
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** POST /rooms/join */
export class JoinRoomDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8)
  avatarEmoji!: string;
}

/** POST /rooms/:id/mute/:userId */
export class MuteDto {
  @IsOptional()
  @IsBoolean()
  muted?: boolean;
}
```

- [ ] **Step 3: Write `rooms.service.ts`**

```ts
// backend/api/src/rooms/rooms.service.ts
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { JoinRoomResult, ParticipantRole, StudyRoomParticipant, StudyRoomSummary } from '@bibleway/shared-types';
import { SupabaseService } from '../supabase/supabase.service';
import { AgoraService } from '../streams/agora.service';

/** Agora assigns the actual session uid on join when the token uses this wildcard. */
const WILDCARD_UID = 0;

interface RoomRow {
  id: string;
  host_id: string;
  title: string;
  subtitle: string;
  status: 'live' | 'ended';
  speaker_count: number;
  listener_count: number;
  started_at: string;
  ended_at: string | null;
}

interface ParticipantRow {
  room_id: string;
  user_id: string;
  display_name: string;
  avatar_emoji: string;
  role: ParticipantRole;
  hand_raised: boolean;
  force_muted: boolean;
}

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly agora: AgoraService,
  ) {}

  /** Enter the singleton Study Chat room — auto-hosts if none is live. */
  async join(userId: string, displayName: string, avatarEmoji: string): Promise<JoinRoomResult> {
    const appId = this.agora.appId; // fail before touching the DB if Agora isn't configured
    const room = await this.findOrCreateLiveRoom(userId);
    const role = await this.upsertParticipant(room, userId, displayName, avatarEmoji);
    return this.mintJoinResult(room.id, role, appId);
  }

  /** Re-mint a token for the caller's CURRENT role — called after a promotion. */
  async getToken(roomId: string, userId: string): Promise<JoinRoomResult> {
    const room = await this.findRoom(roomId);
    if (room.status === 'ended') throw new BadRequestException('Room has ended');
    const participant = await this.findParticipant(roomId, userId);
    return this.mintJoinResult(roomId, participant.role, this.agora.appId);
  }

  async getRoom(roomId: string): Promise<StudyRoomSummary> {
    return this.toSummary(await this.findRoom(roomId));
  }

  async listParticipants(roomId: string): Promise<StudyRoomParticipant[]> {
    const { data, error } = await this.supabase.admin
      .from('study_room_participants')
      .select('*')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true })
      .returns<ParticipantRow[]>();
    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((p) => this.toParticipant(p));
  }

  /** Only listeners can raise a hand — speakers/host already have the mic. */
  async raiseHand(roomId: string, userId: string): Promise<void> {
    const { error } = await this.supabase.admin
      .from('study_room_participants')
      .update({ hand_raised: true })
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .eq('role', 'listener');
    if (error) throw new BadRequestException(error.message);
  }

  /** Host approves a raised hand: listener → speaker. */
  async promote(roomId: string, hostId: string, userId: string): Promise<void> {
    await this.assertHost(roomId, hostId);
    const { error } = await this.supabase.admin
      .from('study_room_participants')
      .update({ role: 'speaker', hand_raised: false })
      .eq('room_id', roomId)
      .eq('user_id', userId);
    if (error) throw new BadRequestException(error.message);
    await this.recountRoles(roomId);
  }

  /** Host force-mutes/unmutes a speaker; the speaker's client discovers this on its next poll. */
  async setForceMuted(roomId: string, hostId: string, userId: string, muted: boolean): Promise<void> {
    await this.assertHost(roomId, hostId);
    const { error } = await this.supabase.admin
      .from('study_room_participants')
      .update({ force_muted: muted })
      .eq('room_id', roomId)
      .eq('user_id', userId);
    if (error) throw new BadRequestException(error.message);
  }

  /** The host leaving ends the room — no orphaned rooms with no one in control. */
  async leave(roomId: string, userId: string): Promise<void> {
    const room = await this.findRoom(roomId);
    if (room.host_id === userId) {
      await this.end(roomId, userId);
      return;
    }
    const { error } = await this.supabase.admin
      .from('study_room_participants')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', userId);
    if (error) throw new BadRequestException(error.message);
    await this.recountRoles(roomId);
  }

  async end(roomId: string, hostId: string): Promise<void> {
    await this.assertHost(roomId, hostId);
    const { error } = await this.supabase.admin
      .from('study_rooms')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', roomId);
    if (error) throw new BadRequestException(error.message);
  }

  /** Safety net: auto-end a room whose host crashed without calling /end. */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async sweepStaleRooms(): Promise<void> {
    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { error } = await this.supabase.admin
      .from('study_rooms')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('status', 'live')
      .lt('started_at', cutoff);
    if (error) this.logger.warn(`Stale-room sweep failed: ${error.message}`);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private async findOrCreateLiveRoom(hostIdIfCreating: string): Promise<RoomRow> {
    const { data: existing, error: findErr } = await this.supabase.admin
      .from('study_rooms')
      .select('*')
      .eq('status', 'live')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findErr) throw new BadRequestException(findErr.message);
    if (existing) return existing as RoomRow;

    const { data: created, error: createErr } = await this.supabase.admin
      .from('study_rooms')
      .insert({
        host_id: hostIdIfCreating,
        title: 'Bible Study Discussion',
        subtitle: 'Understanding the Beatitudes · Matthew 5',
      })
      .select('*')
      .single();
    if (createErr || !created) throw new BadRequestException(createErr?.message ?? 'Failed to create room');
    return created as RoomRow;
  }

  /** Idempotent: a rejoining participant keeps whatever role they already had. */
  private async upsertParticipant(
    room: RoomRow,
    userId: string,
    displayName: string,
    avatarEmoji: string,
  ): Promise<ParticipantRole> {
    const existing = await this.findParticipant(room.id, userId).catch(() => null);
    if (existing) return existing.role;

    const role: ParticipantRole = room.host_id === userId ? 'host' : 'listener';
    const { error } = await this.supabase.admin
      .from('study_room_participants')
      .insert({ room_id: room.id, user_id: userId, display_name: displayName, avatar_emoji: avatarEmoji, role });
    if (error) throw new BadRequestException(error.message);
    await this.recountRoles(room.id);
    return role;
  }

  private mintJoinResult(roomId: string, role: ParticipantRole, appId: string): JoinRoomResult {
    const agoraRole = role === 'listener' ? ('subscriber' as const) : ('publisher' as const);
    const t = this.agora.buildRtcToken(roomId, WILDCARD_UID, agoraRole);
    return { roomId, channel: roomId, uid: WILDCARD_UID, token: t.token, appId, role };
  }

  /** Denormalized counts (golden rule #3) — recomputed after any role/participant change, never COUNT(*) live on read. */
  private async recountRoles(roomId: string): Promise<void> {
    const { data, error } = await this.supabase.admin
      .from('study_room_participants')
      .select('role')
      .eq('room_id', roomId)
      .returns<{ role: ParticipantRole }[]>();
    if (error) return;
    const speakerCount = (data ?? []).filter((p) => p.role === 'host' || p.role === 'speaker').length;
    const listenerCount = (data ?? []).filter((p) => p.role === 'listener').length;
    await this.supabase.admin
      .from('study_rooms')
      .update({ speaker_count: speakerCount, listener_count: listenerCount })
      .eq('id', roomId);
  }

  private async assertHost(roomId: string, userId: string): Promise<void> {
    const room = await this.findRoom(roomId);
    if (room.host_id !== userId) throw new ForbiddenException('Only the host can do that');
  }

  private async findRoom(id: string): Promise<RoomRow> {
    const { data, error } = await this.supabase.admin.from('study_rooms').select('*').eq('id', id).single();
    if (error || !data) throw new NotFoundException('Room not found');
    return data as RoomRow;
  }

  private async findParticipant(roomId: string, userId: string): Promise<ParticipantRow> {
    const { data, error } = await this.supabase.admin
      .from('study_room_participants')
      .select('*')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .single();
    if (error || !data) throw new NotFoundException('Not a participant in this room');
    return data as ParticipantRow;
  }

  private toSummary(r: RoomRow): StudyRoomSummary {
    return {
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      status: r.status,
      speakerCount: r.speaker_count,
      listenerCount: r.listener_count,
    };
  }

  private toParticipant(p: ParticipantRow): StudyRoomParticipant {
    return {
      userId: p.user_id,
      displayName: p.display_name,
      avatarEmoji: p.avatar_emoji,
      role: p.role,
      handRaised: p.hand_raised,
      forceMuted: p.force_muted,
    };
  }
}
```

- [ ] **Step 4: Write `rooms.controller.ts`**

```ts
// backend/api/src/rooms/rooms.controller.ts
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { JoinRoomResult, StudyRoomParticipant, StudyRoomSummary } from '@bibleway/shared-types';
import { SupabaseAuthGuard, type AuthUser } from '../auth/auth.guard';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RoomsService } from './rooms.service';
import { JoinRoomDto, MuteDto } from './dto/rooms.dto';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  /** Enter the Study Chat — auto-hosts if no room is currently live. */
  @Post('join')
  @UseGuards(SupabaseAuthGuard)
  join(@Body() dto: JoinRoomDto, @CurrentUser() user: AuthUser): Promise<JoinRoomResult> {
    return this.rooms.join(user.id, dto.displayName, dto.avatarEmoji);
  }

  /** Re-mint a token for the caller's current role (used after a promotion). */
  @Post(':id/token')
  @UseGuards(SupabaseAuthGuard)
  token(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<JoinRoomResult> {
    return this.rooms.getToken(id, user.id);
  }

  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  detail(@Param('id') id: string): Promise<StudyRoomSummary> {
    return this.rooms.getRoom(id);
  }

  @Get(':id/participants')
  @UseGuards(OptionalAuthGuard)
  participants(@Param('id') id: string): Promise<StudyRoomParticipant[]> {
    return this.rooms.listParticipants(id);
  }

  @Post(':id/raise-hand')
  @UseGuards(SupabaseAuthGuard)
  async raiseHand(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.rooms.raiseHand(id, user.id);
    return { ok: true };
  }

  @Post(':id/promote/:userId')
  @UseGuards(SupabaseAuthGuard)
  async promote(@Param('id') id: string, @Param('userId') userId: string, @CurrentUser() user: AuthUser) {
    await this.rooms.promote(id, user.id, userId);
    return { ok: true };
  }

  @Post(':id/mute/:userId')
  @UseGuards(SupabaseAuthGuard)
  async mute(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: MuteDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.rooms.setForceMuted(id, user.id, userId, dto.muted !== false);
    return { ok: true };
  }

  @Post(':id/leave')
  @UseGuards(SupabaseAuthGuard)
  async leave(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.rooms.leave(id, user.id);
    return { ok: true };
  }

  @Post(':id/end')
  @UseGuards(SupabaseAuthGuard)
  async end(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.rooms.end(id, user.id);
    return { id, status: 'ended' as const };
  }
}
```

- [ ] **Step 5: Write `rooms.module.ts`**

```ts
// backend/api/src/rooms/rooms.module.ts
import { Module } from '@nestjs/common';
import { StreamsModule } from '../streams/streams.module';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [StreamsModule], // reuses AgoraService — no second Agora integration
  controllers: [RoomsController],
  providers: [RoomsService],
})
export class RoomsModule {}
```

- [ ] **Step 6: Register `RoomsModule` in `app.module.ts`**

In `backend/api/src/app.module.ts`, add the import and slot it into `imports`:

```ts
import { RoomsModule } from './rooms/rooms.module';
```

```ts
    // Phase 4 — video: Agora live streaming + Cloudflare Stream VOD
    StreamsModule,
    // Study Chat — audio room on the same Agora integration as StreamsModule
    RoomsModule,
```

- [ ] **Step 7: Typecheck and boot the API**

Run: `cd backend && npm run build:types && npm run dev --workspace @bibleway/api` (Ctrl+C once it logs "Nest application successfully started").
Expected: no compile errors; the log shows the new `/rooms/*` routes mapped (Nest logs each controller route on boot).

- [ ] **Step 8: Manual end-to-end curl check (two users)**

With the API running and two valid Supabase access tokens (`$TOKEN_A` = will become host, `$TOKEN_B` = joins second):

```bash
curl -s -X POST localhost:3000/api/v1/rooms/join -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" -d '{"displayName":"Pastor James","avatarEmoji":"👨‍💼"}'
# Expect: { "roomId": "...", "channel": "...", "uid": 0, "token": "...", "appId": "...", "role": "host" }

curl -s -X POST localhost:3000/api/v1/rooms/join -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" -d '{"displayName":"Grace_M","avatarEmoji":"👩"}'
# Expect: same roomId, "role": "listener"

curl -s localhost:3000/api/v1/rooms/<roomId>/participants
# Expect: 2 rows — host + listener

curl -s -X POST localhost:3000/api/v1/rooms/<roomId>/raise-hand -H "Authorization: Bearer $TOKEN_B"
# Expect: { "ok": true }; participants list now shows handRaised: true for the listener

curl -s -X POST localhost:3000/api/v1/rooms/<roomId>/promote/<userB-id> -H "Authorization: Bearer $TOKEN_A"
# Expect: { "ok": true }; participants list now shows role: "speaker", handRaised: false for user B;
# GET /rooms/<roomId> shows speakerCount: 2, listenerCount: 0

curl -s -X POST localhost:3000/api/v1/rooms/<roomId>/end -H "Authorization: Bearer $TOKEN_A"
# Expect: { "id": "...", "status": "ended" }
```

- [ ] **Step 9: Commit**

```bash
git add backend/api/src/streams/streams.module.ts backend/api/src/rooms backend/api/src/app.module.ts
git commit -m "feat(rooms): add RoomsModule — join/token/participants/raise-hand/promote/mute/end"
```

---

## Task 4: Frontend types + `useStudyRoom` hooks

**Files:**
- Modify: `Frontend/src/types/index.ts`
- Create: `Frontend/src/hooks/useStudyRoom.ts`

**Interfaces:**
- Consumes: `POST /rooms/join`, `POST /rooms/:id/token`, `GET /rooms/:id`, `GET /rooms/:id/participants`, `POST /rooms/:id/raise-hand`, `POST /rooms/:id/promote/:userId`, `POST /rooms/:id/mute/:userId`, `POST /rooms/:id/leave`, `POST /rooms/:id/end` (Task 3); `api` client (`Frontend/src/services/api.ts`).
- Produces: `JoinRoomResult`, `useJoinRoom()`, `useRtcRoomToken()`, `useRoomDetail(roomId, enabled)`, `useRoomParticipants(roomId, enabled)`, `useRaiseHand()`, `usePromoteParticipant()`, `useSetForceMuted()`, `useLeaveRoom()`, `useEndRoom()` — consumed by Task 5's `StudyChatScreen`.

- [ ] **Step 1: Update `Frontend/src/types/index.ts`**

Replace the existing `AudioRoom`/`RoomParticipant` block (currently at lines 59–77) with:

```ts
// ─── Study Chat (Audio Room) ──────────────────────────────────────────────────

export interface AudioRoom {
  id: string;
  title: string;
  subtitle: string;
  status: 'live' | 'ended';
  speakerCount: number;
  listenerCount: number;
}

export interface RoomParticipant {
  id: string;
  displayName: string;
  avatarEmoji: string;
  role: 'host' | 'speaker' | 'listener';
  isMuted: boolean;
  isSpeaking: boolean;
  handRaised: boolean;
}
```

- [ ] **Step 2: Write `Frontend/src/hooks/useStudyRoom.ts`**

```ts
/**
 * Study Chat — real Agora audio room, brokered by our backend.
 *
 * There is one live room at a time; POST /rooms/join auto-hosts if none
 * exists. Role changes (raise-hand → promote, force-mute) are discovered by
 * polling — the same low-effort pattern useLiveStreams.ts uses for viewer
 * counts. No WebSocket/Redis needed at this scale.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { AudioRoom, RoomParticipant } from '../types';

export interface JoinRoomResult {
  roomId: string;
  /** Agora channel name (== roomId). */
  channel: string;
  /** Wildcard uid — Agora assigns the session's actual uid on join. */
  uid: number;
  token: string;
  appId: string;
  role: 'host' | 'speaker' | 'listener';
}

interface ParticipantDto {
  userId: string;
  displayName: string;
  avatarEmoji: string;
  role: 'host' | 'speaker' | 'listener';
  handRaised: boolean;
  forceMuted: boolean;
}

function toParticipant(p: ParticipantDto): RoomParticipant {
  return {
    id: p.userId,
    displayName: p.displayName,
    avatarEmoji: p.avatarEmoji,
    role: p.role,
    isMuted: p.forceMuted,
    isSpeaking: false, // remote active-speaker highlighting isn't wired yet (needs uid→user mapping)
    handRaised: p.handRaised,
  };
}

/** Enter the singleton Study Chat room. */
export function useJoinRoom() {
  return useMutation({
    mutationFn: (input: { displayName: string; avatarEmoji: string }) =>
      api.post<JoinRoomResult>('/rooms/join', input),
  });
}

/** Re-mint a token for the caller's current role — used after a promotion and on token-expiry renewal. */
export function useRtcRoomToken() {
  return useMutation({
    mutationFn: (roomId: string) => api.post<JoinRoomResult>(`/rooms/${roomId}/token`),
  });
}

/** Poll room status/counts (5s) — detects when the host ends the room. */
export function useRoomDetail(roomId: string | null, enabled: boolean) {
  return useQuery<AudioRoom>({
    queryKey: ['room', roomId],
    queryFn: () => api.get<AudioRoom>(`/rooms/${roomId}`),
    enabled: enabled && Boolean(roomId),
    refetchInterval: 5_000,
  });
}

/** Poll the participant roster (4s) — roles, hand-raises, force-mutes. */
export function useRoomParticipants(roomId: string | null, enabled: boolean) {
  return useQuery<RoomParticipant[]>({
    queryKey: ['room-participants', roomId],
    queryFn: async () => {
      const rows = await api.get<ParticipantDto[]>(`/rooms/${roomId}/participants`);
      return rows.map(toParticipant);
    },
    enabled: enabled && Boolean(roomId),
    refetchInterval: 4_000,
  });
}

export function useRaiseHand() {
  return useMutation({
    mutationFn: (roomId: string) => api.post(`/rooms/${roomId}/raise-hand`),
  });
}

export function usePromoteParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { roomId: string; userId: string }) =>
      api.post(`/rooms/${vars.roomId}/promote/${vars.userId}`),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['room-participants', vars.roomId] }),
  });
}

export function useSetForceMuted() {
  return useMutation({
    mutationFn: (vars: { roomId: string; userId: string; muted: boolean }) =>
      api.post(`/rooms/${vars.roomId}/mute/${vars.userId}`, { muted: vars.muted }),
  });
}

export function useLeaveRoom() {
  return useMutation({
    mutationFn: (roomId: string) => api.post(`/rooms/${roomId}/leave`),
  });
}

export function useEndRoom() {
  return useMutation({
    mutationFn: (roomId: string) => api.post(`/rooms/${roomId}/end`),
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `cd Frontend && npm run type-check`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "Frontend/src/types/index.ts" "Frontend/src/hooks/useStudyRoom.ts"
git commit -m "feat(rooms): add useStudyRoom hooks and Agora-shaped frontend types"
```

---

## Task 5: Rewire `StudyChatScreen` — real audio join, mute, leave (MVP)

**Files:**
- Modify: `Frontend/src/screens/StudyChatScreen.tsx`

**Interfaces:**
- Consumes: `useJoinRoom`, `useRtcRoomToken`, `useRoomDetail`, `useRoomParticipants`, `useLeaveRoom`, `useEndRoom` (Task 4); `getAgora`, `getEngine`, `destroyEngine`, `isAgoraAvailable` (existing `Frontend/src/services/agoraEngine.ts`); `useAppStore` profile (existing).
- Produces: a working audio room for host + listeners (raise-hand/promote UI comes in Task 6).

- [ ] **Step 1: Replace the top of the file**

Replace the imports and the `export function StudyChatScreen` body's setup (lines 1–19 and 105–113 of the current file) with:

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, PermissionsAndroid, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IRtcEngine, IRtcEngineEventHandler } from 'react-native-agora';
import { useAppStore } from '../store/useAppStore';
import {
  useEndRoom,
  useJoinRoom,
  useLeaveRoom,
  useRoomDetail,
  useRoomParticipants,
} from '../hooks/useStudyRoom';
import { destroyEngine, getAgora, getEngine, isAgoraAvailable } from '../services/agoraEngine';
import { useTheme } from '../theme/ThemeContext';
import { Deep, Fonts, Radii } from '../theme/elegant';
import { Icon } from '../components/elegant/Icons';
import { GlassCircle, PressScale, SectionLabel } from '../components/elegant/Kit';
import type { RoomParticipant } from '../types';

interface Props {
  onClose: () => void;
}

/** Agora does not request runtime permissions itself. */
async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  return res === PermissionsAndroid.RESULTS.GRANTED;
}
```

(Keep `initialsOf`, `SpeakerAvatar`, `ListenerAvatar` exactly as they are — they only need real data, not new markup.)

- [ ] **Step 2: Replace the component body**

Replace `export function StudyChatScreen({ onClose }: Props) { ... }` entirely with:

```tsx
export function StudyChatScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const profile = useAppStore((s) => s.profile);

  const joinRoom = useJoinRoom();
  const leaveRoom = useLeaveRoom();
  const endRoom = useEndRoom();

  const [phase, setPhase] = useState<'connecting' | 'live' | 'ended' | 'error'>('connecting');
  const [error, setError] = useState('');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [role, setRole] = useState<'host' | 'speaker' | 'listener'>('listener');
  const [muted, setMuted] = useState(true);

  const engineRef = useRef<IRtcEngine | null>(null);
  const handlerRef = useRef<IRtcEngineEventHandler | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const isHostRef = useRef(false);

  const agoraReady = isAgoraAvailable();
  const { data: detail } = useRoomDetail(roomId, phase !== 'error');
  const { data: participants = [] } = useRoomParticipants(roomId, phase === 'live');

  const teardown = useCallback((endOnServer: boolean) => {
    const engine = engineRef.current;
    if (engine) {
      try {
        if (handlerRef.current) engine.unregisterEventHandler(handlerRef.current);
        engine.leaveChannel();
      } catch {
        /* engine may already be gone */
      }
    }
    destroyEngine();
    engineRef.current = null;
    handlerRef.current = null;
    if (roomIdRef.current) {
      if (endOnServer && isHostRef.current) endRoom.mutate(roomIdRef.current);
      else if (endOnServer) leaveRoom.mutate(roomIdRef.current);
    }
    roomIdRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!agoraReady) return;
    const agora = getAgora()!;
    let cancelled = false;

    (async () => {
      try {
        if (!(await ensureMicPermission())) {
          setPhase('error');
          setError('Microphone permission is required to join Study Chat. Enable it in Settings.');
          return;
        }
        const res = await joinRoom.mutateAsync({ displayName: profile.displayName, avatarEmoji: '🙂' });
        if (cancelled) return;
        roomIdRef.current = res.roomId;
        isHostRef.current = res.role === 'host';
        setRoomId(res.roomId);
        setRole(res.role);

        const engine = getEngine(res.appId);
        engineRef.current = engine;
        const isPublisher = res.role !== 'listener';
        const handler: IRtcEngineEventHandler = { onJoinChannelSuccess: () => setPhase('live') };
        handlerRef.current = handler;
        engine.registerEventHandler(handler);
        engine.enableAudio();
        engine.joinChannel(res.token, res.channel, res.uid, {
          clientRoleType: isPublisher ? agora.ClientRoleType.ClientRoleBroadcaster : agora.ClientRoleType.ClientRoleAudience,
          publishMicrophoneTrack: isPublisher,
          autoSubscribeAudio: true,
        });
        if (isPublisher) engine.muteLocalAudioStream(true); // join muted, matches the footer's default
      } catch (e) {
        if (!cancelled) {
          setPhase('error');
          setError(e instanceof Error ? e.message : 'Could not join Study Chat.');
        }
      }
    })();

    return () => {
      cancelled = true;
      teardown(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agoraReady]);

  useEffect(() => {
    if (detail?.status === 'ended' && phase === 'live') setPhase('ended');
  }, [detail?.status, phase]);

  const toggleMute = useCallback(() => {
    if (role === 'listener') return; // listeners never publish audio
    const engine = engineRef.current;
    if (!engine) return;
    const next = !muted;
    setMuted(next);
    engine.muteLocalAudioStream(next);
  }, [muted, role]);

  const handleClose = useCallback(() => {
    teardown(true);
    onClose();
  }, [teardown, onClose]);

  const myId = profile.id;
  const displayParticipants: RoomParticipant[] = participants.map((p) =>
    p.id === myId ? { ...p, isMuted: role === 'listener' ? true : muted } : p,
  );
  const speakers = displayParticipants.filter((p) => p.role === 'host' || p.role === 'speaker');
  const listeners = displayParticipants.filter((p) => p.role === 'listener');

  const headerPill = {
    backgroundColor: 'rgba(244,232,205,0.1)',
    borderWidth: 1, borderColor: 'rgba(232,203,143,0.28)',
    paddingHorizontal: 17, paddingVertical: 9, borderRadius: Radii.pill,
  } as const;

  if (!agoraReady) {
    return (
      <View style={{ flex: 1, backgroundColor: c.sheet, paddingTop: insets.top + 12, alignItems: 'center', justifyContent: 'center', gap: 15, paddingHorizontal: 34 }}>
        <GlassCircle icon="x" onPress={onClose} onDeep />
        <Text style={{ fontFamily: Fonts.serif, fontSize: 25, color: c.ink, textAlign: 'center' }}>Study Chat needs the dev build</Text>
        <Text style={{ color: c.ink2, fontSize: 13, fontFamily: Fonts.sansLight, textAlign: 'center', lineHeight: 22 }}>
          Study Chat uses Agora, the same native module as Live video. Install the custom dev build to join.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.sheet }}>
      <LinearGradient colors={[...Deep.chatHeaderStops]} style={{ paddingHorizontal: 20, paddingBottom: 22, paddingTop: insets.top }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, marginBottom: 22 }}>
          <GlassCircle icon="x" onPress={handleClose} onDeep />
          <View style={{ flexDirection: 'row', gap: 9 }}>
            <PressScale to={0.94}>
              <View style={headerPill}>
                <Text style={{ color: '#EEDFBE', fontSize: 11.5, fontFamily: Fonts.sansMed, letterSpacing: 0.6 }}>Share</Text>
              </View>
            </PressScale>
            <PressScale to={0.94}>
              <View style={headerPill}>
                <Text style={{ color: '#EEDFBE', fontSize: 11.5, fontFamily: Fonts.sansMed, letterSpacing: 0.6 }}>+ Invite</Text>
              </View>
            </PressScale>
          </View>
        </View>
        <View style={{ gap: 7 }}>
          <Text style={{ fontFamily: Fonts.serif, fontSize: 26, color: Deep.onDeep, letterSpacing: 0.3 }}>
            {detail?.title ?? 'Bible Study Discussion'}
          </Text>
          <Text style={{ fontSize: 11.5, fontFamily: Fonts.sansLight, color: Deep.onDeepFaint, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            {phase === 'connecting' ? 'Connecting…' : detail?.subtitle ?? 'Understanding the Beatitudes · Matthew 5'}
          </Text>
        </View>
      </LinearGradient>

      {phase === 'error' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 34 }}>
          <Text style={{ fontFamily: Fonts.serif, fontSize: 22, color: c.ink, textAlign: 'center' }}>Couldn't join</Text>
          <Text style={{ color: c.ink2, fontSize: 13, fontFamily: Fonts.sansLight, textAlign: 'center', lineHeight: 22 }}>{error}</Text>
        </View>
      ) : phase === 'ended' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Text style={{ fontFamily: Fonts.serif, fontSize: 22, color: c.ink }}>Room ended</Text>
          <PressScale onPress={onClose} to={0.94}>
            <View style={headerPill}><Text style={{ color: c.gold, fontSize: 12, fontFamily: Fonts.sansMed }}>Back to Home</Text></View>
          </PressScale>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 24 }} showsVerticalScrollIndicator={false}>
          <View style={{ marginBottom: 16 }}>
            <SectionLabel>Speakers · {speakers.length}</SectionLabel>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginBottom: 26 }}>
            {speakers.map((p) => <SpeakerAvatar key={p.id} participant={p} />)}
          </View>

          <View
            style={{
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairlineSoft,
              borderRadius: Radii.md, paddingHorizontal: 17, paddingVertical: 14, marginBottom: 26,
            }}
          >
            <Text style={{ color: c.ink3, fontSize: 12, fontFamily: Fonts.sansLight, letterSpacing: 0.3 }}>
              {listeners.length} others listening
            </Text>
          </View>

          <View style={{ marginBottom: 16 }}>
            <SectionLabel>Listeners · {listeners.length}</SectionLabel>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
            {listeners.map((p) => <ListenerAvatar key={p.id} participant={p} />)}
          </View>
          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      {phase === 'live' && (
        <View
          style={{
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            paddingHorizontal: 22, paddingTop: 15, paddingBottom: insets.bottom + 15,
            borderTopWidth: 1, borderTopColor: c.hairlineSoft,
          }}
        >
          <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
            <Text style={{ color: c.live, fontSize: 12.5, fontFamily: Fonts.sansMed, letterSpacing: 0.5 }}>Leave quietly</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 13 }}>
            {role !== 'listener' && (
              <PressScale onPress={toggleMute} to={0.9}>
                <View
                  style={{
                    width: 46, height: 46, borderRadius: 23,
                    backgroundColor: muted ? 'rgba(224,106,80,0.13)' : c.surface2,
                    borderWidth: 1, borderColor: muted ? 'rgba(224,106,80,0.4)' : c.hairlineSoft,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Icon name={muted ? 'micOff' : 'mic'} size={17} color={muted ? c.live : c.gold} strokeWidth={1.6} />
                </View>
              </PressScale>
            )}
            <PressScale to={0.9}>
              <LinearGradient
                colors={[c.goldBright, c.gold]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="chat" size={17} color={c.onGold} strokeWidth={1.6} />
              </LinearGradient>
            </PressScale>
          </View>
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 3: Remove the now-unused mock import**

Delete `import { MOCK_ROOM_PARTICIPANTS } from '../services/mockData';` if it's still present (it's replaced by real `participants` from `useRoomParticipants`). Leave `MOCK_ROOM_PARTICIPANTS` itself in `mockData.ts` alone — other screens don't use it, but deleting unused exports is a separate cleanup, not part of this task.

- [ ] **Step 4: Typecheck**

Run: `cd Frontend && npm run type-check`
Expected: no errors.

- [ ] **Step 5: Manual verification — build and run on a dev-build device**

Run: `cd Frontend && npx expo run:android` (or `run:ios`) — this screen requires the dev build, same as Live (per `Chatroom.md` §1 and the existing `agoraEngine.ts` guard).
Steps: sign in as two different accounts on two devices/emulators. On device A, tap "Study Chat" — it should show "Connecting…" then the room with device A listed as a Speaker (host). On device B, tap "Study Chat" — same room, device B listed as a Listener. On device A, tap the mic button — the badge should flip to muted/unmuted and (once Task 6 lands) be audible to device B.
Expected: no crash; both devices see the same room; device A is a Speaker, device B is a Listener; "Leave quietly" and the header X both close the screen and end/leave via the API (verify with `GET /rooms/:id` after closing — host's leave sets `status: "ended"`).

- [ ] **Step 6: Commit**

```bash
git add "Frontend/src/screens/StudyChatScreen.tsx"
git commit -m "feat(rooms): wire StudyChatScreen to real Agora audio via useStudyRoom"
```

---

## Task 6: Raise-hand → host promotes, host force-mute

**Files:**
- Modify: `Frontend/src/screens/StudyChatScreen.tsx`

**Interfaces:**
- Consumes: `useRaiseHand`, `usePromoteParticipant`, `useSetForceMuted`, `useRtcRoomToken` (Task 4).
- Produces: a tappable "Raise hand" action for listeners; host sees raised hands and can approve them; approved listeners automatically start publishing audio.

- [ ] **Step 1: Add the new hooks and promotion-detection state**

In the imports, add:

```tsx
import {
  useEndRoom,
  useJoinRoom,
  useLeaveRoom,
  usePromoteParticipant,
  useRaiseHand,
  useRoomDetail,
  useRoomParticipants,
  useRtcRoomToken,
  useSetForceMuted,
} from '../hooks/useStudyRoom';
```

Inside the component, alongside the other hooks:

```tsx
const raiseHand = useRaiseHand();
const promoteParticipant = usePromoteParticipant();
const setForceMuted = useSetForceMuted();
const rtcToken = useRtcRoomToken();
const wasListenerRef = useRef(true);
```

- [ ] **Step 2: Detect my own promotion and switch the Agora role live**

Add this effect right after the `useEffect` that watches `detail?.status`:

```tsx
useEffect(() => {
  if (phase !== 'live' || !roomId) return;
  const me = participants.find((p) => p.id === myId);
  if (!me) return;

  if (wasListenerRef.current && me.role !== 'listener') {
    wasListenerRef.current = false;
    setRole(me.role);
    (async () => {
      const engine = engineRef.current;
      const agora = getAgora();
      if (!engine || !agora) return;
      const t = await rtcToken.mutateAsync(roomId);
      engine.renewToken(t.token);
      engine.setClientRole(agora.ClientRoleType.ClientRoleBroadcaster);
      engine.updateChannelMediaOptions({ publishMicrophoneTrack: true });
      engine.muteLocalAudioStream(true); // promoted while muted, same as an initial join
      setMuted(true);
    })();
  } else if (me.role === 'listener') {
    wasListenerRef.current = true;
  }

  if (me.forceMuted && !muted) {
    setMuted(true);
    engineRef.current?.muteLocalAudioStream(true);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [participants, phase, roomId, myId]);
```

- [ ] **Step 3: Wire "Raise hand" for listeners**

Replace the listener-count bar (the `View` showing "N others listening") with a tappable raise-hand action for non-hosts:

```tsx
<View
  style={{
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairlineSoft,
    borderRadius: Radii.md, paddingHorizontal: 17, paddingVertical: 14, marginBottom: 26,
  }}
>
  <Text style={{ color: c.ink3, fontSize: 12, fontFamily: Fonts.sansLight, letterSpacing: 0.3 }}>
    {listeners.length} others listening
  </Text>
  {role === 'listener' && (
    <TouchableOpacity activeOpacity={0.7} onPress={() => roomId && raiseHand.mutate(roomId)} disabled={raiseHand.isPending}>
      <Text style={{ color: c.gold, fontSize: 12, fontFamily: Fonts.sansMed, letterSpacing: 0.4 }}>
        {participants.find((p) => p.id === myId)?.handRaised ? 'Hand raised ✋' : 'Raise hand'}
      </Text>
    </TouchableOpacity>
  )}
</View>
```

- [ ] **Step 4: Host controls — approve a raised hand, force-mute a speaker**

`ListenerAvatar` needs a host-only "approve" affordance. Update its signature and body:

```tsx
function ListenerAvatar({ participant, onApprove }: { participant: RoomParticipant; onApprove?: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', width: 62, gap: 6 }}>
      <View
        style={{
          width: 54, height: 54, borderRadius: 27,
          backgroundColor: c.surface, borderWidth: 1, borderColor: participant.handRaised ? c.gold : c.hairlineSoft,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Text style={{ fontFamily: Fonts.serif, fontSize: 19, color: c.ink3 }}>
          {initialsOf(participant.displayName)}
        </Text>
      </View>
      <Text numberOfLines={1} style={{ fontSize: 10, fontFamily: Fonts.sansLight, color: c.ink3, textAlign: 'center', maxWidth: 62 }}>
        {participant.displayName}
      </Text>
      {participant.handRaised && onApprove ? (
        <TouchableOpacity onPress={onApprove} activeOpacity={0.7}>
          <Text style={{ color: c.gold, fontSize: 9.5, fontFamily: Fonts.sansMed }}>✋ Approve</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
```

Then in the render, pass `onApprove` only when the local user is the host:

```tsx
{listeners.map((p) => (
  <ListenerAvatar
    key={p.id}
    participant={p}
    onApprove={
      role === 'host' && roomId
        ? () => promoteParticipant.mutate({ roomId, userId: p.id })
        : undefined
    }
  />
))}
```

Add a host-only force-mute tap on `SpeakerAvatar` (skip the host's own avatar). Replace the whole function with:

```tsx
function SpeakerAvatar({ participant, onForceMute }: { participant: RoomParticipant; onForceMute?: () => void }) {
  const { c } = useTheme();
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!participant.isSpeaking) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ring, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(ring, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [participant.isSpeaking, ring]);

  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.28] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  const avatarBody = (
    <View style={{ alignItems: 'center', width: 82, gap: 9 }}>
      <View style={{ width: 72, height: 72 }}>
        {participant.isSpeaking ? (
          <Animated.View
            style={{
              position: 'absolute', top: 0, left: 0, width: 72, height: 72, borderRadius: 36,
              borderWidth: 1.5, borderColor: c.gold,
              transform: [{ scale: ringScale }], opacity: ringOpacity,
            }}
          />
        ) : null}
        <View
          style={{
            width: 72, height: 72, borderRadius: 36,
            backgroundColor: c.surface2,
            borderWidth: participant.isSpeaking ? 1.5 : 1,
            borderColor: participant.isSpeaking ? c.gold : c.hairlineSoft,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: Fonts.serif, fontSize: 23, color: c.gold }}>
            {initialsOf(participant.displayName)}
          </Text>
        </View>
        <View
          style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 24, height: 24, borderRadius: 12,
            backgroundColor: c.surface2, borderWidth: 1, borderColor: c.hairline,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon name={participant.isMuted ? 'micOff' : 'mic'} size={10} color={participant.isMuted ? c.live : c.gold} strokeWidth={1.8} />
        </View>
      </View>
      <Text numberOfLines={1} style={{ fontSize: 11, fontFamily: Fonts.sans, color: c.ink2, textAlign: 'center', letterSpacing: 0.3, maxWidth: 82 }}>
        {participant.displayName}
      </Text>
    </View>
  );

  return onForceMute ? (
    <PressScale onPress={onForceMute} to={0.95}>{avatarBody}</PressScale>
  ) : (
    avatarBody
  );
}
```

This is a mechanical refactor (extract the existing JSX into `avatarBody`, optionally wrap it) — no visual change when `onForceMute` is `undefined`.

And in the render:

```tsx
{speakers.map((p) => (
  <SpeakerAvatar
    key={p.id}
    participant={p}
    onForceMute={
      role === 'host' && p.id !== myId && roomId
        ? () => setForceMuted.mutate({ roomId, userId: p.id, muted: !p.isMuted })
        : undefined
    }
  />
))}
```

- [ ] **Step 5: Typecheck**

Run: `cd Frontend && npm run type-check`
Expected: no errors.

- [ ] **Step 6: Manual verification — two devices**

Steps: device B (listener) taps "Raise hand" → label flips to "Hand raised ✋" and, within ~4s, device A (host) sees a gold-ringed avatar with "✋ Approve" under it in the Listeners row. Device A taps Approve → within ~4s device B moves to the Speakers row, and its Agora role switches to broadcaster (confirm by unmuting on device B and having device A/a third device hear it). Device A taps a speaker's avatar (not itself) → that speaker's mic force-mutes; the speaker's own screen should reflect the muted badge on its next poll.
Expected: all of the above happens without a crash or a stuck "Connecting…" state.

- [ ] **Step 7: Commit**

```bash
git add "Frontend/src/screens/StudyChatScreen.tsx"
git commit -m "feat(rooms): wire raise-hand, host promote, and host force-mute"
```

---

## Task 7: Definition of done

No new files — this is the final manual sign-off pass, run after Tasks 1–6 are all committed.

- [ ] **Backend boots clean:** `cd backend && npm run build && npm run start --workspace @bibleway/api` — no errors, `/health` is green.
- [ ] **Degrade gracefully:** temporarily unset `AGORA_APP_ID`/`AGORA_APP_CERTIFICATE` in `backend/.env`, restart — the API still boots (`/health` green), and `POST /rooms/join` returns a clean 503 (`AgoraService`'s existing `ServiceUnavailableException`), not a crash. Restore the env vars afterward.
- [ ] **RLS holds:** as an anonymous (no-token) request, `GET /rooms/:id` and `GET /rooms/:id/participants` should still work (they use `OptionalAuthGuard`, matching the streams feed's public-read convention), but a direct Supabase client query with the anon key and no session should return 0 rows for both tables (re-run Task 2 Step 3 as a final check).
- [ ] **Two real devices, two accounts:** host goes in, listener joins and hears nothing (correctly — listeners don't publish); listener raises hand, host approves, listener's mic now publishes and the host hears them; host force-mutes them, badge flips and audio stops; host taps "Leave quietly" — both clients land back on Home and a fresh `POST /rooms/join` from either device starts a **new** room (confirms `end()` really flipped `status`).
- [ ] **Stale-room sweep:** manually set a `study_rooms` row's `started_at` to 7 hours ago via SQL, wait for (or manually trigger in a one-off script) `RoomsService.sweepStaleRooms()` — confirm it flips to `status: 'ended'`.
- [ ] **Cost check:** confirm in the Agora Console that Study Chat usage lands in the same project/App ID as Live video, so it draws from the same free 10,000-minutes/month RTC allotment rather than a second one.

---

## Explicitly out of scope (revisit later if wanted)

- **💬 in-room text chat** — the chat-bubble icon is still a no-op. Wiring it means a `study_room_messages` table + polling or Realtime Broadcast + rate-limiting/profanity-filter (`BACKEND_PLAN.md` §5.2) — real scope, not "one single easiest thing."
- **Share / +Invite** — still static buttons. Needs a deep-link scheme decision (`expo-linking` is already installed, per `Chatroom.md` §7 Tier 1).
- **Remote "is speaking" ring** — every participant's ring animation currently reflects only local knowledge (always off for remote users). Wiring it needs the client to report its assigned Agora uid back to the backend so `onActiveSpeaker(uid)` can be mapped to a `userId`.
- **Room discovery / list / scheduling / denomination tagging / prayer requests / recording** — all still apply from `Chatroom.md` Tier 2/3 if the product direction wants them; none are needed to make the existing single Study Chat button work for real.
