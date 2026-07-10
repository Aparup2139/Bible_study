-- Agora interactive live streaming. The Agora channel name is live_streams.id;
-- Agora rows have cf_live_input_id NULL (Cloudflare columns stay for VOD/legacy rows).
set search_path = public;

-- Atomic, non-negative viewer counter bump. Called by the API via service-role RPC
-- when a viewer joins/leaves; only live streams are counted.
create or replace function public.bump_viewer_count(stream_id uuid, delta int)
returns int
language sql
security definer
set search_path = public
as $$
  update public.live_streams
     set viewer_count = greatest(0, viewer_count + delta)
   where id = stream_id
     and status = 'live'
  returning viewer_count;
$$;

revoke all on function public.bump_viewer_count(uuid, int) from public, anon, authenticated;
