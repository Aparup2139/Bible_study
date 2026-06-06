# Phase 1 — Auth & User Profiles (implementation notes)

Status: **code complete.** What remains are account/dashboard actions only you can do
(create OAuth credentials, apply migrations against your hosted DB, set env vars).

## What was built

### Database (`backend/supabase/migrations/`)
- `0001_profiles.sql`
  - `public.profiles` table, 1:1 with `auth.users` (cascade delete). Case-insensitive
    unique `handle` (citext) with a format CHECK and a unique index.
  - `handle_new_user()` trigger: auto-creates a profile row on signup, deriving a unique
    handle + display name from OAuth metadata or the email local-part.
  - `set_updated_at()` trigger to maintain `updated_at`.
  - RLS: world-readable; owner-only insert/update.
  - `guard_profile_privileged_columns()` trigger: blocks non-service-role callers from
    changing `subscriber_count` / `is_verified` / `id` / `created_at` (defense in depth).
- `0002_avatars_storage.sql`
  - Public-read `avatars` bucket (5 MB cap, jpeg/png/webp).
  - Storage RLS so a user may only write under their own `"<uid>/..."` folder.

### Edge Function (`backend/supabase/functions/resize-avatar/`)
- Downloads an uploaded avatar, produces a centered 256x256 webp thumbnail, writes it back.

### API (`backend/api/src/`)
- `auth/` — `SupabaseAuthGuard` (verifies the Bearer token via Supabase) + `@CurrentUser()`.
- `profiles/` — endpoints (under the `/api/v1` prefix):
  - `GET  /profiles/:handle`     — public profile by handle
  - `GET  /profiles/me`          — current user's profile (auth)
  - `PATCH /profiles/me`         — update own profile (auth; whitelisted fields)
  - `GET  /profiles/check-handle?handle=` — availability check (auth)
  - Updates go through a **user-scoped** Supabase client so RLS + the guard trigger apply.

### Frontend (`Frontend/`)
- `src/services/supabase.ts` — Supabase client with a chunked expo-secure-store adapter.
- `src/services/session.ts` — restores the session, wires the API token provider.
- `src/hooks/useProfile.ts` — `useMyProfile`, `useUpdateProfile`, `useCheckHandle`,
  `useSyncProfileToStore` (hydrates the Zustand store, replacing the placeholder profile).
- `app/_layout.tsx` — mounts an `AuthBridge` inside the QueryClientProvider.
- `src/screens/EditProfileScreen.tsx` — Save now calls `PATCH /profiles/me`.
- New deps: `@supabase/supabase-js`, `expo-secure-store`, `react-native-url-polyfill`.

## Manual steps you must do

1. **Apply the migrations** to your Supabase project:
   ```bash
   cd backend
   supabase link --project-ref cdrigufdimzswbaalafo   # if not already linked
   supabase db push
   ```
2. **Enable OAuth providers** in the dashboard (Authentication -> Providers): Apple + Google.
   Paste each provider's client id/secret there (they can't live in the committed config).
   Email/password is already on.
3. **Deploy the Edge Function** (optional until you wire avatar upload UI):
   ```bash
   supabase functions deploy resize-avatar
   ```
4. **Backend env** — already set in `backend/.env` (URL + keys). No change needed for the API.
5. **Frontend env** — create `Frontend/.env` from `Frontend/.env.example`:
   ```
   EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
   EXPO_PUBLIC_SUPABASE_URL=https://cdrigufdimzswbaalafo.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<your publishable/anon key>
   ```
6. **Install the new frontend deps** (pin to SDK-correct versions):
   ```bash
   cd Frontend
   npx expo install @supabase/supabase-js expo-secure-store react-native-url-polyfill
   ```

## How to test end-to-end
- Start the API: `cd backend && npm run dev` -> `GET /health` returns ok.
- Create a user (email/password) via Supabase, then in the app the profile row should
  auto-exist; `GET /api/v1/profiles/me` (with the user's bearer token) returns it.
- Edit the profile in the app -> `PATCH /profiles/me` persists; try a taken handle to see the 409.
