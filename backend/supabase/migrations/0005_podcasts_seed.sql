-- 0005_podcasts_seed.sql
-- Phase 3 seed: demo catalog from the app's mock data. Idempotent.
-- Emoji are written with Postgres Unicode-escape literals (U&'\+0xxxxx') so the
-- file stays pure-ASCII and encoding-independent.
-- Audio paths are empty placeholders (upload real files to the 'podcast-audio'
-- bucket and set audio_path to enable playback).

set search_path = public;

-- Categories ----------------------------------------------------------------
insert into public.podcast_categories (id, name, icon, show_count, sort_order) values
  ('bible-study', 'Bible Study', U&'\+01F4D6',        45, 10),
  ('prayer',      'Prayer',      U&'\+01F64F',        32, 20),
  ('theology',    'Theology',    U&'\271D\FE0F',      28, 30),
  ('worship',     'Worship',     U&'\+01F3B5',        38, 40),
  ('family',      'Family',      U&'\+01F46A',        25, 50),
  ('leadership',  'Leadership',  U&'\+01F4BC',        19, 60),
  ('missions',    'Missions',    U&'\+01F30D',        22, 70),
  ('teaching',    'Teaching',    U&'\+01F4DA',        41, 80)
on conflict (id) do nothing;

-- Channels (subscriber_count + episode_count are denormalized display values) -
insert into public.podcast_channels (id, name, avatar_emoji, episode_count, subscriber_count) values
  ('ch1', 'Faith & Hope Podcast', U&'\+01F399\FE0F', 152, 24000),
  ('ch2', 'Bible Deep Dive',      U&'\+01F4D6',       98, 18000),
  ('ch3', 'Morning Prayer',       U&'\+01F64F',      210, 31000),
  ('ch4', 'Theology Today',       U&'\271D\FE0F',     76, 15000)
on conflict (id) do nothing;

-- Episodes ------------------------------------------------------------------
insert into public.podcast_episodes (id, channel_id, title, duration_seconds, published_at, audio_path) values
  ('ep1', 'ch1', 'Understanding Grace in Daily Life', 2700, now() - interval '2 days', ''),
  ('ep2', 'ch2', 'Psalms 23: The Shepherd''s Care',   1920, now() - interval '5 days', ''),
  ('ep3', 'ch3', 'Starting Your Day with Purpose',     900,  now() - interval '7 days', ''),
  ('ep4', 'ch4', 'Modern Faith Challenges',            3480, now() - interval '3 days', '')
on conflict (id) do nothing;

-- Lock the denormalized episode_count to the curated display values (the insert
-- trigger bumped each channel by +1 for the single seeded episode).
update public.podcast_channels set episode_count = 152 where id = 'ch1';
update public.podcast_channels set episode_count = 98  where id = 'ch2';
update public.podcast_channels set episode_count = 210 where id = 'ch3';
update public.podcast_channels set episode_count = 76  where id = 'ch4';
