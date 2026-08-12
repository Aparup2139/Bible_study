-- 0011_featured_videos.sql
-- Four fixed "featured YouTube video" slots shown under Streaming Now on Home.
-- youtube_video_id NULL = slot not filled yet (app renders a placeholder window).
-- Content ops: fill a slot with
--   update public.featured_videos set youtube_video_id = '<ID>', title = '<Title>' where slot = 1;

create table if not exists public.featured_videos (
  slot             smallint primary key check (slot between 1 and 4),
  youtube_video_id text,
  title            text not null default ''
);

-- RLS on, no policies: only the service role (the backend API) can read/write.
alter table public.featured_videos enable row level security;

insert into public.featured_videos (slot)
values (1), (2), (3), (4)
on conflict (slot) do nothing;
