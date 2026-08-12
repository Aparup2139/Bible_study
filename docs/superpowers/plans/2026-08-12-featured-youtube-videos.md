# Featured YouTube Videos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show four YouTube video "windows" under the Home screen's "Streaming Now" section — placeholder cards now, real videos later by filling a DB row (no app rebuild).

**Architecture:** A `featured_videos` table holds exactly 4 slots (video id nullable = placeholder). A tiny public NestJS endpoint (`GET /featured-videos`, mirroring the denominations module) serves them. The frontend renders a 2×2 grid: dashed placeholder window when a slot is empty; YouTube thumbnail (`img.youtube.com`) with a play chip when filled; tapping swaps the thumbnail for an inline `react-native-webview` running the official YouTube embed player. Storing the video id in the DB is the point: the owner later pastes an id via one SQL UPDATE and the app updates within minutes.

**Tech Stack:** NestJS + Supabase (backend, existing patterns), Supabase SQL migration, React Native / Expo + TanStack Query + `react-native-webview` (frontend).

## Global Constraints

- Neither package has unit-test infrastructure (`backend/api` `"test": "echo \"no tests yet\""`; Frontend has none). Verification per task = `npm run typecheck` (backend) / `npx tsc --noEmit` (frontend) + live curl / on-device smoke checks. Do NOT introduce jest.
- Backend module must mirror the existing `denominations` module pattern exactly: controller + service + module under `backend/api/src/featured-videos/`, admin Supabase client, snake_case row interface → camelCase contract mapper.
- Shared API types live in `backend/packages/shared-types/src/` and are re-exported from its `index.ts`. The frontend duplicates the interface in `Frontend/src/types/index.ts` (that is this repo's existing convention — see `UserProfile`).
- Playback must use the official YouTube embed player (`youtube.com/embed/<id>`) inside a WebView. Never extract raw video streams (YouTube ToS).
- Migration file must be numbered `0011` (next after `0010_study_rooms_singleton.sql`).
- Exactly 4 slots, numbered 1–4. `youtube_video_id = NULL` means "placeholder".
- Thumbnail URL format: `https://img.youtube.com/vi/<VIDEO_ID>/hqdefault.jpg`. Embed URL format: `https://www.youtube.com/embed/<VIDEO_ID>?autoplay=1&playsinline=1&rel=0`.
- Frontend visual language: theme tokens from `useTheme()` (`c.surface`, `c.hairline`, `c.hairlineSoft`, `c.ink3`), `Radii.xl` corners, `Fonts` from `../../theme/elegant`, `PressScale` for taps — match `VideoCard.tsx`.
- `react-native-webview` is a native module: after installing, the app needs a dev-build rebuild (`npx expo run:android` / EAS) — Expo Go also works. Note this in the task; do not skip the install.
- Commit after every task. Never commit `backend/.env`.

---

### Task 1: Database migration — `featured_videos` table

**Files:**
- Create: `backend/supabase/migrations/0011_featured_videos.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: table `public.featured_videos(slot smallint PK, youtube_video_id text NULL, title text NOT NULL DEFAULT '')`, seeded with slots 1–4 (all NULL video ids). Task 2's service reads it via the service-role client.

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Push the migration**

From `backend/`: `npx supabase db push --db-url "<SUPABASE_DB_URL from backend/.env>"`.
Known gotcha (see repo memory "Supabase db push recipe"): the password inside `SUPABASE_DB_URL` in `.env` is URL-encoded — the value works as-is as `--db-url`; if you get NXDOMAIN + error 540 the Supabase project is paused — resume it in the dashboard first.
Expected: `0011_featured_videos.sql` applied without error.

- [ ] **Step 3: Verify the seed**

Run in the Supabase dashboard SQL editor (or psql via pooler):
```sql
select slot, youtube_video_id, title from public.featured_videos order by slot;
```
Expected: 4 rows, slots 1–4, all `youtube_video_id` NULL, all `title` `''`.

- [ ] **Step 4: Commit**

```bash
git add backend/supabase/migrations/0011_featured_videos.sql
git commit -m "feat(db): featured_videos table with 4 placeholder slots"
```

---

### Task 2: Backend — shared type + `GET /featured-videos` endpoint

**Files:**
- Create: `backend/packages/shared-types/src/featured-video.ts`
- Modify: `backend/packages/shared-types/src/index.ts` (add one export line)
- Create: `backend/api/src/featured-videos/featured-videos.service.ts`
- Create: `backend/api/src/featured-videos/featured-videos.controller.ts`
- Create: `backend/api/src/featured-videos/featured-videos.module.ts`
- Modify: `backend/api/src/app.module.ts` (register module)

**Interfaces:**
- Consumes: `SupabaseService` from `../supabase/supabase.service` (exists; `.admin` is the service-role client). Table from Task 1.
- Produces: `GET /api/v1/featured-videos` → `FeaturedVideo[]` (4 items, ordered by slot). `interface FeaturedVideo { slot: number; youtubeVideoId: string | null; title: string }` — Tasks 3–5 rely on these exact names.

- [ ] **Step 1: Add the shared type**

`backend/packages/shared-types/src/featured-video.ts`:
```ts
// Featured YouTube videos — four fixed slots shown under "Streaming Now" on Home.
export interface FeaturedVideo {
  /** 1..4 — stable position in the 2x2 grid. */
  slot: number;
  /** YouTube video id (the 11-char id from the embed/watch URL). null = slot not filled yet. */
  youtubeVideoId: string | null;
  /** Optional caption; '' when unset. */
  title: string;
}
```

Append to `backend/packages/shared-types/src/index.ts`:
```ts
export * from './featured-video';
```

- [ ] **Step 2: Write the service**

`backend/api/src/featured-videos/featured-videos.service.ts`:
```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import type { FeaturedVideo } from '@bibleway/shared-types';
import { SupabaseService } from '../supabase/supabase.service';

/** Row shape from public.featured_videos (snake_case). */
interface FeaturedVideoRow {
  slot: number;
  youtube_video_id: string | null;
  title: string;
}

@Injectable()
export class FeaturedVideosService {
  constructor(private readonly supabase: SupabaseService) {}

  /** The four featured slots, ordered. Empty slots come back with youtubeVideoId null. */
  async list(): Promise<FeaturedVideo[]> {
    const { data, error } = await this.supabase.admin
      .from('featured_videos')
      .select('slot, youtube_video_id, title')
      .order('slot', { ascending: true })
      .returns<FeaturedVideoRow[]>();

    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((row) => ({
      slot: row.slot,
      youtubeVideoId: row.youtube_video_id,
      title: row.title,
    }));
  }
}
```

- [ ] **Step 3: Write the controller and module**

`backend/api/src/featured-videos/featured-videos.controller.ts`:
```ts
import { Controller, Get, Header } from '@nestjs/common';
import type { FeaturedVideo } from '@bibleway/shared-types';
import { FeaturedVideosService } from './featured-videos.service';

/**
 * Public content slots. No auth. Short cache so a freshly filled slot
 * appears on devices within ~5 minutes.
 */
@Controller('featured-videos')
export class FeaturedVideosController {
  constructor(private readonly featured: FeaturedVideosService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
  list(): Promise<FeaturedVideo[]> {
    return this.featured.list();
  }
}
```

`backend/api/src/featured-videos/featured-videos.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { FeaturedVideosController } from './featured-videos.controller';
import { FeaturedVideosService } from './featured-videos.service';

@Module({
  controllers: [FeaturedVideosController],
  providers: [FeaturedVideosService],
})
export class FeaturedVideosModule {}
```

- [ ] **Step 4: Register in `app.module.ts`**

Add the import and list it after `RoomsModule`:
```ts
import { FeaturedVideosModule } from './featured-videos/featured-videos.module';
// ...in imports array, after RoomsModule:
    // Featured YouTube videos on Home (4 slots)
    FeaturedVideosModule,
```

- [ ] **Step 5: Typecheck**

Run from `backend/api/`: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 6: Live smoke check**

Start the API from `backend/`: `npm run dev` (or `npm run start:dev` in `backend/api` — use whichever script exists in `backend/package.json`). Then:
```bash
curl -s http://localhost:3000/api/v1/featured-videos
```
Expected: `[{"slot":1,"youtubeVideoId":null,"title":""}, ... slot 4]` (4 items, ordered). Stop the server after.

- [ ] **Step 7: Commit**

```bash
git add backend/packages/shared-types/src/featured-video.ts backend/packages/shared-types/src/index.ts backend/api/src/featured-videos backend/api/src/app.module.ts
git commit -m "feat(api): GET /featured-videos - four YouTube slots for Home"
```

---

### Task 3: Frontend — type, data hook, and the WebView dependency

**Files:**
- Modify: `Frontend/src/types/index.ts` (append interface)
- Create: `Frontend/src/hooks/useFeaturedVideos.ts`
- Modify: `Frontend/package.json` (via `npx expo install react-native-webview`)

**Interfaces:**
- Consumes: `api.get<T>(path)` from `../services/api` (exists — see `useProfile.ts` for the pattern); endpoint from Task 2.
- Produces: `useFeaturedVideos(): UseQueryResult<FeaturedVideo[]>` and the frontend `FeaturedVideo` interface (same fields as Task 2's shared type: `slot`, `youtubeVideoId`, `title`). Tasks 4–5 rely on these exact names.

- [ ] **Step 1: Install the WebView package**

From `Frontend/`: `npx expo install react-native-webview`
Expected: `react-native-webview` appears in `Frontend/package.json` dependencies at the Expo-SDK-matched version. Note for the runner: this is a native module — the on-device check in Task 5 needs a dev-build rebuild (`npx expo run:android`), matching how this project already runs (Agora requires a dev build too).

- [ ] **Step 2: Add the frontend type**

Append to `Frontend/src/types/index.ts` (duplicating the shared type is this repo's convention):
```ts
/** Featured YouTube video slot on Home (mirrors @bibleway/shared-types FeaturedVideo). */
export interface FeaturedVideo {
  slot: number;
  youtubeVideoId: string | null;
  title: string;
}
```

- [ ] **Step 3: Write the hook**

`Frontend/src/hooks/useFeaturedVideos.ts`:
```ts
/**
 * Featured YouTube videos — the four fixed slots under "Streaming Now" (GET /featured-videos).
 * placeholderData renders the 2x2 placeholder grid instantly (and offline) before the fetch lands.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { FeaturedVideo } from '../types';

const EMPTY_SLOTS: FeaturedVideo[] = [1, 2, 3, 4].map((slot) => ({
  slot,
  youtubeVideoId: null,
  title: '',
}));

export function useFeaturedVideos() {
  return useQuery({
    queryKey: ['featured-videos'],
    queryFn: () => api.get<FeaturedVideo[]>('/featured-videos'),
    staleTime: 5 * 60 * 1000,
    placeholderData: EMPTY_SLOTS,
  });
}
```

- [ ] **Step 4: Typecheck**

Run from `Frontend/`: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add Frontend/package.json Frontend/package-lock.json Frontend/src/types/index.ts Frontend/src/hooks/useFeaturedVideos.ts
git commit -m "feat(app): featured-videos hook + react-native-webview dependency"
```

---

### Task 4: Frontend — `FeaturedVideoCard` component (placeholder / thumbnail / inline player)

**Files:**
- Create: `Frontend/src/components/elegant/FeaturedVideoCard.tsx`

**Interfaces:**
- Consumes: `FeaturedVideo` type (Task 3), `useTheme` from `../../theme/ThemeContext`, `Fonts, Radii` from `../../theme/elegant`, `Icon` from `./Icons` (icon names `video` and `play` both exist), `PressScale` from `./Kit`, `WebView` from `react-native-webview`.
- Produces: `function FeaturedVideoCard({ video, width }: { video: FeaturedVideo; width: number })` — Task 5 renders it with `CARD_WIDTH`.

- [ ] **Step 1: Write the component**

`Frontend/src/components/elegant/FeaturedVideoCard.tsx`:
```tsx
import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '../../theme/ThemeContext';
import { Fonts, Radii } from '../../theme/elegant';
import { Icon } from './Icons';
import { PressScale } from './Kit';
import type { FeaturedVideo } from '../../types';

interface Props {
  video: FeaturedVideo;
  /** Card width in px; the window keeps a 16:9 aspect. */
  width: number;
}

/**
 * One featured-video "window" (16:9).
 * - Empty slot  -> dashed placeholder ("Coming Soon").
 * - Filled slot -> free YouTube thumbnail + play chip; tap swaps in the official
 *   embed player in a WebView, playing inline in the same window.
 */
export function FeaturedVideoCard({ video, width }: Props) {
  const { c, elev } = useTheme();
  const [playing, setPlaying] = useState(false);
  const height = Math.round((width * 9) / 16);
  const frame = { width, height, borderRadius: Radii.xl, overflow: 'hidden' as const };

  if (!video.youtubeVideoId) {
    return (
      <View
        style={{
          ...frame,
          borderWidth: 1, borderStyle: 'dashed', borderColor: c.hairline,
          backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        <Icon name="video" size={22} color={c.ink3} strokeWidth={1.4} />
        <Text style={{ fontSize: 9.5, fontFamily: Fonts.sansMed, color: c.ink3, letterSpacing: 1.8, textTransform: 'uppercase' }}>
          Coming Soon
        </Text>
      </View>
    );
  }

  if (playing) {
    return (
      <View style={{ ...frame, backgroundColor: '#000', ...elev.card }}>
        <WebView
          source={{ uri: `https://www.youtube.com/embed/${video.youtubeVideoId}?autoplay=1&playsinline=1&rel=0` }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          style={{ flex: 1, backgroundColor: '#000' }}
        />
      </View>
    );
  }

  return (
    <PressScale onPress={() => setPlaying(true)} to={0.97}>
      <View style={{ ...frame, backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairlineSoft, ...elev.card }}>
        <Image
          source={{ uri: `https://img.youtube.com/vi/${video.youtubeVideoId}/hqdefault.jpg` }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
        <View
          style={{
            position: 'absolute', bottom: 9, right: 9,
            width: 30, height: 30, borderRadius: 15,
            backgroundColor: 'rgba(17,14,14,0.55)',
            borderWidth: 1, borderColor: 'rgba(242,199,190,0.22)',
            alignItems: 'center', justifyContent: 'center', paddingLeft: 2,
          }}
        >
          <Icon name="play" size={11} color="#F2C7BE" />
        </View>
        {video.title !== '' && (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(17,14,14,0.45)', paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text numberOfLines={1} style={{ fontSize: 10.5, fontFamily: Fonts.sansMed, color: '#F5EDEA', letterSpacing: 0.3 }}>
              {video.title}
            </Text>
          </View>
        )}
      </View>
    </PressScale>
  );
}
```

- [ ] **Step 2: Typecheck**

Run from `Frontend/`: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add Frontend/src/components/elegant/FeaturedVideoCard.tsx
git commit -m "feat(app): FeaturedVideoCard - placeholder / thumbnail / inline embed player"
```

---

### Task 5: Frontend — render the 2×2 grid under "Streaming Now" and verify on device

**Files:**
- Modify: `Frontend/src/screens/HomeScreen.tsx`

**Interfaces:**
- Consumes: `useFeaturedVideos` (Task 3), `FeaturedVideoCard` (Task 4), existing `CARD_WIDTH`, `CARD_GAP`, `H_PAD` constants and `SerifTitle` already in the file.
- Produces: the visible feature. Nothing downstream.

- [ ] **Step 1: Wire the section into `HomeScreen.tsx`**

Add imports at the top:
```tsx
import { FeaturedVideoCard } from '../components/elegant/FeaturedVideoCard';
import { useFeaturedVideos } from '../hooks/useFeaturedVideos';
```

Inside `HomeScreen()`, next to the `useLiveStreams()` call:
```tsx
  // Four featured YouTube slots under Streaming Now (GET /featured-videos).
  const { data: featuredVideos = [] } = useFeaturedVideos();
```

In the JSX, directly AFTER the closing `</View>` of the "Streaming Now" section (the one containing the `FlatList`) and still inside `styles.body`'s `<View>`:
```tsx
        <View style={{ paddingHorizontal: H_PAD, gap: 16 }}>
          <SerifTitle size={23}>Featured Videos</SerifTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP }}>
            {featuredVideos.map((video) => (
              <FeaturedVideoCard key={video.slot} video={video} width={CARD_WIDTH} />
            ))}
          </View>
        </View>
```

- [ ] **Step 2: Typecheck**

Run from `Frontend/`: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: On-device smoke check (placeholders)**

Rebuild the dev build so the WebView native module is included: from `Frontend/`, `npx expo run:android` (or the project's usual EAS dev-build flow), with the backend running locally. 
Expected: Home screen shows "Featured Videos" under the Streaming Now grid with four dashed "Coming Soon" windows in a 2×2 layout.

- [ ] **Step 4: On-device smoke check (playback path)**

Temporarily fill slot 1 in the Supabase SQL editor:
```sql
update public.featured_videos set youtube_video_id = 'dQw4w9WgXcQ', title = 'Test video' where slot = 1;
```
Reload the app (or wait out the 5-min staleTime). Expected: slot 1 shows a real YouTube thumbnail with a play chip and "Test video" caption; tapping it plays the video inline in the window. Then reset:
```sql
update public.featured_videos set youtube_video_id = null, title = '' where slot = 1;
```
Expected after reload: slot 1 is a placeholder again.

- [ ] **Step 5: Commit**

```bash
git add Frontend/src/screens/HomeScreen.tsx
git commit -m "feat(app): Featured Videos 2x2 grid under Streaming Now"
```

---

### Task 6: Content-ops doc — how to fill a slot later

**Files:**
- Create: `docs/featured-videos.md`

**Interfaces:**
- Consumes: nothing (pure documentation of Tasks 1–5's system).
- Produces: the instructions the owner follows later when they have real videos.

- [ ] **Step 1: Write the doc**

`docs/featured-videos.md`:
```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/featured-videos.md
git commit -m "docs: how to fill the featured YouTube video slots"
```

---

## Deployment note (after all tasks)

The backend runs on Render (`https://bibleway-api.onrender.com`) with auto-deploy from the repo — the new endpoint goes live when the branch merges and pushes. The migration must be pushed to Supabase (Task 1 does this directly). The frontend needs a dev-build rebuild once for `react-native-webview`; after that, filling video slots is SQL-only.
