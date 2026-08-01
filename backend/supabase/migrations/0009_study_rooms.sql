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
