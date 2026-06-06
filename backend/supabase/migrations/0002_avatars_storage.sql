-- 0002_avatars_storage.sql
-- Phase 1, step 4: avatar uploads.
--
-- Bucket layout convention: each user's avatar lives under a folder named with
-- their uid, e.g.  avatars/<auth.uid>/avatar.jpg
-- This lets us write tight RLS: a user may only write inside their own folder.

-- ─────────────────────────────────────────────────────────────────────────────
-- Create the bucket (public-read). Idempotent via on conflict.
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,                                   -- public read → served via CDN URL
  5242880,                                -- 5 MB upload cap
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage RLS policies on storage.objects, scoped to the 'avatars' bucket.
-- storage.foldername(name)[1] is the first path segment (the owner's uid).
-- ─────────────────────────────────────────────────────────────────────────────

-- Public read of avatar objects (bucket is public, but objects still need a
-- SELECT policy for the storage API to list/serve them under RLS).
drop policy if exists "avatar images are publicly readable" on storage.objects;
create policy "avatar images are publicly readable"
  on storage.objects
  for select
  using (bucket_id = 'avatars');

-- Owner-write: a user may upload only into their own "<uid>/..." folder.
drop policy if exists "users can upload their own avatar" on storage.objects;
create policy "users can upload their own avatar"
  on storage.objects
  for insert
  with check (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

-- Owner-update (overwrite existing avatar).
drop policy if exists "users can update their own avatar" on storage.objects;
create policy "users can update their own avatar"
  on storage.objects
  for update
  using (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

-- Owner-delete.
drop policy if exists "users can delete their own avatar" on storage.objects;
create policy "users can delete their own avatar"
  on storage.objects
  for delete
  using (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
