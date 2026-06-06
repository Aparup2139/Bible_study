-- 0004_podcasts.sql
-- Phase 3: podcasts. Catalog (categories/channels/episodes) is world-readable
-- reference-ish data; per-user state (subscriptions/saves/progress) is owner-only.
-- Denormalized counts (rule #3) are maintained by triggers, never live COUNT(*).

set search_path = public;

-- ===========================================================================
-- Catalog tables (world-readable)
-- ===========================================================================

create table if not exists public.podcast_categories (
  id          text        primary key,            -- slug, e.g. 'bible-study'
  name        text        not null,
  icon        text        not null default '',
  show_count  integer     not null default 0,     -- denormalized display number
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.podcast_channels (
  id               text        primary key,        -- slug, e.g. 'ch1'
  name             text        not null,
  avatar_emoji     text        not null default '',
  episode_count    integer     not null default 0 check (episode_count >= 0),
  subscriber_count integer     not null default 0 check (subscriber_count >= 0),
  created_at       timestamptz not null default now()
);

create table if not exists public.podcast_episodes (
  id               text        primary key,        -- slug, e.g. 'ep1'
  channel_id       text        not null references public.podcast_channels (id) on delete cascade,
  title            text        not null,
  duration_seconds integer     not null default 0 check (duration_seconds >= 0),
  published_at     timestamptz not null default now(),
  -- Supabase Storage object path in the 'podcast-audio' bucket (empty until uploaded).
  audio_path       text        not null default '',
  created_at       timestamptz not null default now(),
  -- Full-text search over the title (Phase 7). Generated + GIN-indexed.
  search_vector    tsvector    generated always as (to_tsvector('english', coalesce(title, ''))) stored
);

create index if not exists podcast_episodes_channel_idx on public.podcast_episodes (channel_id);
-- Cursor pagination orders by (published_at desc, id) — index supports it.
create index if not exists podcast_episodes_published_idx on public.podcast_episodes (published_at desc, id);
create index if not exists podcast_episodes_search_idx on public.podcast_episodes using gin (search_vector);

-- ===========================================================================
-- Per-user state tables (owner-only)
-- ===========================================================================

create table if not exists public.channel_subscriptions (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  channel_id text        not null references public.podcast_channels (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);
create index if not exists channel_subscriptions_channel_idx on public.channel_subscriptions (channel_id);

create table if not exists public.saved_episodes (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  episode_id text        not null references public.podcast_episodes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, episode_id)
);

create table if not exists public.playback_progress (
  user_id          uuid        not null references auth.users (id) on delete cascade,
  episode_id       text        not null references public.podcast_episodes (id) on delete cascade,
  position_seconds integer     not null default 0 check (position_seconds >= 0),
  updated_at       timestamptz not null default now(),
  primary key (user_id, episode_id)
);

-- ===========================================================================
-- Row Level Security
-- ===========================================================================

-- Catalog: world-readable, no client writes (service role seeds it).
alter table public.podcast_categories enable row level security;
alter table public.podcast_channels   enable row level security;
alter table public.podcast_episodes   enable row level security;

drop policy if exists "categories readable by everyone" on public.podcast_categories;
create policy "categories readable by everyone" on public.podcast_categories for select using (true);

drop policy if exists "channels readable by everyone" on public.podcast_channels;
create policy "channels readable by everyone" on public.podcast_channels for select using (true);

drop policy if exists "episodes readable by everyone" on public.podcast_episodes;
create policy "episodes readable by everyone" on public.podcast_episodes for select using (true);

-- Per-user: owner-only for every operation.
alter table public.channel_subscriptions enable row level security;
alter table public.saved_episodes        enable row level security;
alter table public.playback_progress     enable row level security;

drop policy if exists "own subscriptions" on public.channel_subscriptions;
create policy "own subscriptions" on public.channel_subscriptions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own saved episodes" on public.saved_episodes;
create policy "own saved episodes" on public.saved_episodes
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own playback progress" on public.playback_progress;
create policy "own playback progress" on public.playback_progress
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ===========================================================================
-- Denormalized-count triggers (SECURITY DEFINER so they can update the
-- world-readable channels table despite its lack of a client write policy).
-- ===========================================================================

create or replace function public.bump_channel_subscriber_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.podcast_channels set subscriber_count = subscriber_count + 1 where id = new.channel_id;
  elsif tg_op = 'DELETE' then
    update public.podcast_channels set subscriber_count = greatest(subscriber_count - 1, 0) where id = old.channel_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_channel_sub_count on public.channel_subscriptions;
create trigger trg_channel_sub_count
  after insert or delete on public.channel_subscriptions
  for each row execute function public.bump_channel_subscriber_count();

create or replace function public.bump_channel_episode_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.podcast_channels set episode_count = episode_count + 1 where id = new.channel_id;
  elsif tg_op = 'DELETE' then
    update public.podcast_channels set episode_count = greatest(episode_count - 1, 0) where id = old.channel_id;
  elsif tg_op = 'UPDATE' and new.channel_id is distinct from old.channel_id then
    update public.podcast_channels set episode_count = greatest(episode_count - 1, 0) where id = old.channel_id;
    update public.podcast_channels set episode_count = episode_count + 1 where id = new.channel_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_channel_episode_count on public.podcast_episodes;
create trigger trg_channel_episode_count
  after insert or delete or update of channel_id on public.podcast_episodes
  for each row execute function public.bump_channel_episode_count();

-- ===========================================================================
-- Audio storage bucket (public-read; served via CDN).
-- ===========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('podcast-audio', 'podcast-audio', true, 524288000,  -- 500 MB cap
        array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "podcast audio publicly readable" on storage.objects;
create policy "podcast audio publicly readable"
  on storage.objects for select using (bucket_id = 'podcast-audio');
-- No client write policy: uploads happen server-side via the service role.
