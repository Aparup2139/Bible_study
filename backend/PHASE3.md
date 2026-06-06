# Phase 3 — Podcasts (implementation notes)

Status: **code complete.** Apply the two migrations, then it's live. Redis is optional.

## Database (`migrations/0004_podcasts.sql`, seed in `0005_podcasts_seed.sql`)
- Catalog (world-readable): `podcast_categories`, `podcast_channels` (denormalized
  `episode_count` + `subscriber_count`), `podcast_episodes` (`channel_id` FK,
  `duration_seconds`, `audio_path`, generated `search_vector` + GIN index).
- Per-user (owner-only RLS): `channel_subscriptions`, `saved_episodes`,
  `playback_progress`.
- Triggers keep the denormalized channel counts accurate (never live COUNT(*)).
- `podcast-audio` Storage bucket (public-read); uploads are server-side only.
- Seeds the mock catalog (8 categories, 4 channels, 4 episodes, placeholder audio).

## API (`api/src/podcasts/`, `redis/`, `auth/optional-auth.guard.ts`)
- Catalog endpoints use **optional auth** — browsable logged-out, enriched with
  `isSaved` / `isSubscribed` / `playbackPosition` when a token is present.
- `GET /podcasts/categories` (cached), `GET /podcasts/channels` (cursor),
  `GET /podcasts/episodes?channelId=` (cursor).
- `POST|DELETE /podcasts/channels/:id/subscribe`, `POST|DELETE /podcasts/episodes/:id/save`.
- `PUT /podcasts/episodes/:id/progress` — buffered in Redis, flushed to Postgres
  every 30s by a scheduled job. **Degrades gracefully**: with no `REDIS_URL`, it
  writes straight to Postgres via UPSERT.
- `GET /podcasts/downloads` — the user's saved episodes (downloads stay on-device).
- Cursor pagination is keyset-based (no OFFSET): episodes by (published_at desc, id),
  channels by (created_at, id).

## Frontend
- `src/hooks/usePodcasts.ts` — episodes/channels via `useInfiniteQuery` (flattened
  to arrays), categories via `useQuery`, plus `useToggleSubscribe`, `useToggleSave`,
  `useUpdateProgress`.
- `PodcastScreen` now reads the real API; Subscribe and Save toggle through the
  backend (optimistic, with rollback on error); Play records playback position.

## Apply + test

```bash
cd backend
supabase db push        # applies 0004 (schema) + 0005 (seed)
npm run dev
```

Optional (to exercise the buffering path): create an Upstash Redis DB and set
`REDIS_URL=rediss://...` in `backend/.env`, then restart.

```powershell
# catalog (public)
Invoke-RestMethod http://localhost:3000/api/v1/podcasts/categories
Invoke-RestMethod http://localhost:3000/api/v1/podcasts/channels   # { items, nextCursor }
Invoke-RestMethod http://localhost:3000/api/v1/podcasts/episodes

# per-user (needs $TOKEN from Phase 1)
$h = @{ Authorization = "Bearer $TOKEN" }
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/v1/podcasts/channels/ch1/subscribe" -Headers $h
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/v1/podcasts/episodes/ep1/save" -Headers $h
$body = @{ positionSeconds = 120 } | ConvertTo-Json
Invoke-RestMethod -Method Put -Uri "http://localhost:3000/api/v1/podcasts/episodes/ep1/progress" -Headers $h -ContentType "application/json" -Body $body

# verify enrichment: ch1 isSubscribed=true, channel subscriber_count bumped,
# ep1 isSaved=true and playbackPosition=120
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/podcasts/channels" -Headers $h
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/podcasts/episodes" -Headers $h
```
