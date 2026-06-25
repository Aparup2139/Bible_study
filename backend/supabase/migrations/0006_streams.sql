-- 0006_streams.sql
-- Phase 4: live + on-demand video, backed by Cloudflare Stream.
-- ADDITIVE: creates one new table; touches no existing tables. Live participant
-- state is owned by Cloudflare; this table holds lifecycle + discovery metadata.
-- Denormalized viewer_count (rule #3) is refreshed async from Cloudflare, never COUNT(*).

set search_path = public;

create table if not exists public.live_streams (
  id               uuid        primary key default gen_random_uuid(),
  host_id          uuid        not null references auth.users (id) on delete cascade,
  title            text        not null,
  subtitle         text        not null default '',
  denomination_id  text        references public.denominations (id) on delete set null,
  -- Cloudflare Stream handles:
  cf_live_input_id text        unique,            -- persistent live input (channel) uid
  cf_video_uid     text,                          -- current/last broadcast or VOD video uid
  customer_code    text        not null default '', -- the customer-<CODE> playback subdomain
  require_signed   boolean     not null default false,
  -- lifecycle + discovery:
  status           text        not null default 'idle'
                     check (status in ('idle','live','ended')),
  viewer_count     integer     not null default 0 check (viewer_count >= 0),
  is_public        boolean     not null default true,
  started_at       timestamptz,
  ended_at         timestamptz,
  recording_uid    text,                          -- VOD uid once the live recording is ready
  recording_ready  boolean     not null default false,
  created_at       timestamptz not null default now()
);

-- Discovery: live first, newest first; supports cursor pagination by (started_at desc, id).
create index if not exists live_streams_status_idx on public.live_streams (status, started_at desc, id);
create index if not exists live_streams_host_idx   on public.live_streams (host_id);

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table public.live_streams enable row level security;

-- Public/live streams are readable by any signed-in user; private rows still readable
-- (playback itself is gated by Cloudflare signed tokens, minted server-side).
drop policy if exists "streams readable by authed" on public.live_streams;
create policy "streams readable by authed" on public.live_streams
  for select using (auth.uid() is not null);

-- Only the host can create/update/delete their own stream rows via RLS.
-- (Most writes go through the API using the service role.)
drop policy if exists "host manages own streams" on public.live_streams;
create policy "host manages own streams" on public.live_streams
  for all using ((select auth.uid()) = host_id) with check ((select auth.uid()) = host_id);
