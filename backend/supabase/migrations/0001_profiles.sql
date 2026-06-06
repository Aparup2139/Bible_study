-- 0001_profiles.sql
-- Phase 1, steps 2 & 3: profiles table (1:1 with auth.users), auto-insert trigger,
-- and Row Level Security policies.
--
-- Migrations are the source of truth for schema — never edit the DB via the dashboard.

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: profiles table
-- ─────────────────────────────────────────────────────────────────────────────

-- `handle` is a citext so uniqueness is case-insensitive (@Bibleway == @bibleway).
set search_path = public, extensions;

create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  display_name      text        not null default '',
  handle            extensions.citext  not null,
  bio               text        not null default '',
  -- Store only the Storage object path (e.g. "<uid>/avatar.jpg"); the API turns
  -- this into a CDN URL. Never store full URLs (rule #5).
  avatar_path       text,
  -- Denormalized count — updated asynchronously, never via live COUNT(*) (rule #3).
  subscriber_count  integer     not null default 0 check (subscriber_count >= 0),
  denomination_id   uuid,       -- FK added in Phase 2 when `denominations` exists.
  is_verified       boolean     not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Handles are user-facing usernames: 3–30 chars, letters/digits/underscore.
  -- Stored WITHOUT a leading '@' (the frontend adds it for display).
  constraint profiles_handle_format check (handle ~ '^[a-zA-Z0-9_]{3,30}$')
);

-- Case-insensitive unique handle, indexed for fast lookups (rule: index `handle`).
create unique index if not exists profiles_handle_key
  on public.profiles (handle);

comment on table public.profiles is
  'Public user profiles, 1:1 with auth.users. RLS: world-readable, owner-writable.';

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at maintenance
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-insert a profile row whenever a new auth.users row appears
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so the trigger can write to public.profiles regardless of the
-- caller; search_path is pinned to avoid hijacking (security best practice).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  base_handle text;
  final_handle text;
  suffix integer := 0;
begin
  -- Seed display name + handle from OAuth metadata or the email local-part.
  base_handle := lower(
    regexp_replace(
      coalesce(
        new.raw_user_meta_data ->> 'user_name',
        new.raw_user_meta_data ->> 'preferred_username',
        split_part(coalesce(new.email, 'user'), '@', 1),
        'user'
      ),
      '[^a-zA-Z0-9_]', '', 'g'
    )
  );

  -- Enforce the length floor/ceiling the CHECK constraint requires.
  if length(base_handle) < 3 then
    base_handle := 'user' || base_handle;
  end if;
  base_handle := left(base_handle, 30);

  -- Resolve collisions by appending an incrementing numeric suffix.
  final_handle := base_handle;
  while exists (select 1 from public.profiles p where p.handle = final_handle) loop
    suffix := suffix + 1;
    final_handle := left(base_handle, 30 - length(suffix::text)) || suffix::text;
  end loop;

  insert into public.profiles (id, display_name, handle, avatar_path)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    ),
    final_handle,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- Anyone (including anon) may read public profiles.
drop policy if exists "profiles are readable by everyone" on public.profiles;
create policy "profiles are readable by everyone"
  on public.profiles
  for select
  using (true);

-- A user may insert only their OWN profile row (id must equal their auth uid).
-- The trigger above normally creates the row, but this covers manual/edge inserts.
drop policy if exists "users can insert their own profile" on public.profiles;
create policy "users can insert their own profile"
  on public.profiles
  for insert
  with check ((select auth.uid()) = id);

-- A user may update only their own row, and cannot reassign it to another id.
drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile"
  on public.profiles
  for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- NOTE: no DELETE policy — profiles are removed only via auth.users cascade.

-- ─────────────────────────────────────────────────────────────────────────────
-- Protect privileged columns at the database layer
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS lets owners UPDATE their row, but they must NOT be able to self-verify or
-- inflate their subscriber_count. This trigger forces those columns to keep their
-- previous values unless the change comes from the service-role key (the trusted
-- server). It runs BEFORE the row-level updated_at trigger (alphabetical order:
-- "profiles_guard_*" < "profiles_set_*").
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.role() is 'service_role' for the trusted backend, else 'authenticated'.
  if auth.role() is distinct from 'service_role' then
    new.subscriber_count := old.subscriber_count;
    new.is_verified      := old.is_verified;
    new.id               := old.id;          -- belt-and-suspenders: never reassign
    new.created_at       := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged on public.profiles;
create trigger profiles_guard_privileged
  before update on public.profiles
  for each row
  execute function public.guard_profile_privileged_columns();
