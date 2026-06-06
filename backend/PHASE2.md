# Phase 2 — Denominations (implementation notes)

Status: **code complete.** Apply the migration, then it's live.

## What was built

### Database (`supabase/migrations/0003_denominations.sql`)
- `public.denominations` table — slug `id` PK (matches the frontend's string ids),
  `name`, `group` (CHECK against the 9 DenominationGroup values), `description`,
  `bible_version`, `founded_year`, `worldwide_members` (bigint, numeric truth),
  `global_followers` (display text), `sort_order`, `created_at`.
- RLS: world-readable; no client write policies (seeded via service role only).
- Idempotent seed of 6 curated denominations (also mirrored in `seed.sql`).
- Wires Phase 1's loose `profiles.denomination_id`: alters it from `uuid` to `text`
  and adds a FK to `denominations(id) on delete set null`, plus an index.

### API (`api/src/denominations/`)
- `GET /denominations` — full list, ordered, public, aggressive `Cache-Control`
  (browser 1h, edge 1d, stale-while-revalidate) + 5-min in-process cache.
  Redis swap-in is isolated to the service (Phase 8, rule #6).
- `GET /denominations/:id` — single lookup by slug.
- Selection reuses `PATCH /profiles/me { denominationId }`; the DTO now validates
  `denominationId` as a slug (was UUID), and the DB FK enforces it really exists.

### Frontend
- `src/hooks/useDenominations.ts` — `GET /denominations` (1h stale time).
- `src/screens/DenominationScreen.tsx` — picker + info panel now driven by the API
  (only DB-backed denominations are selectable, so the FK never rejects a choice);
  selecting one persists via `useUpdateProfile` and reflects the profile's saved value.

## Apply + test

```bash
cd backend
supabase db push          # applies 0003 (table + seed + profiles FK)
npm run dev
```

```powershell
# list (note the Cache-Control header)
Invoke-WebRequest http://localhost:3000/api/v1/denominations | Select-Object -Expand Headers
Invoke-RestMethod  http://localhost:3000/api/v1/denominations

# select one for the signed-in user, then read it back
$patch = @{ denominationId = "lutheran" } | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri "http://localhost:3000/api/v1/profiles/me" -Headers @{ Authorization = "Bearer $TOKEN" } -ContentType "application/json" -Body $patch
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/profiles/me" -Headers @{ Authorization = "Bearer $TOKEN" }

# FK guard: a non-existent slug should fail
$bad = @{ denominationId = "not-a-real-denomination" } | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri "http://localhost:3000/api/v1/profiles/me" -Headers @{ Authorization = "Bearer $TOKEN" } -ContentType "application/json" -Body $bad
```

Expected: the list returns 6 denominations; the PATCH sets `denominationId: lutheran`
and `/profiles/me` reflects it; the bad slug returns a 400 (FK violation).
