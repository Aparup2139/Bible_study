# Featured YouTube Videos — filling the 4 Home-screen slots

The Home screen shows 4 video windows under "Streaming Now". Each is a row in
the `featured_videos` table. No app rebuild or deploy is needed to change them —
devices pick up changes within ~5 minutes.

## Getting the video id from an iframe embed code

From YouTube: Share → Embed gives you something like:

    <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" ...></iframe>

The video id is the last path segment of the `src` URL: `dQw4w9WgXcQ`.
(From a watch URL it's the `v=` parameter: `youtube.com/watch?v=dQw4w9WgXcQ`.)

## Filling a slot

Supabase dashboard → SQL editor:

    update public.featured_videos
    set youtube_video_id = 'dQw4w9WgXcQ', title = 'Sunday Sermon'
    where slot = 1;   -- slots are 1..4, top-left to bottom-right

## Emptying a slot (back to placeholder)

    update public.featured_videos
    set youtube_video_id = null, title = ''
    where slot = 1;

## Notes

- `title` is optional — '' shows no caption overlay.
- Videos whose owners disabled embedding will show "Watch on YouTube" instead
  of playing inline; pick a different video or ask the channel to allow embeds.
