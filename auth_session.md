# BibleWay — Auth & Session Management (Supabase) — Build Context & Plan

> **Purpose.** Authoritative, self-contained plan to finish **authentication + session
> management end-to-end on Supabase Auth** (no Clerk/third-party). Written so an AI
> assistant or developer can execute it cold with no prior chat history.
>
> **Status:** Partially built (see §2). Remaining work is specced in §4 and not yet built.
> Execute on owner approval.

---

## 0. Decisions (locked — do not re-litigate without reason)

| Question | Decision |
|---|---|
| Auth provider | **Supabase Auth only** (no Clerk). The whole backend is already integrated with it (auth.users, RLS `auth.uid()`, profiles trigger, JWT verify). |
| Login identifier | **Email OR username** (username is a login identifier, not just a profile field). Needs a backend shim because Supabase logs in by email/phone only. |
| Email confirmation | **OFF for now** (instant sign-in during dev). Deep-link email verification deferred to a later pass. |
| Scope | **Core only:** sign up, sign in, sign out, **Google + Apple** OAuth, **password reset**. No change-email/change-password/delete-account yet. |
| Token model | **Supabase-managed.** Supabase issues + rotates the JWT access token (~1h) + refresh token; `supabase-js` persists/refreshes them (SecureStore adapter). Backend **verifies** the JWT. We do NOT hand-roll a separate token/session system. |
| Google lib (default) | `@react-native-google-signin/google-signin` (native id-token flow). Alternative: `expo-auth-session`. |

### Why NOT Clerk (for the record)
Clerk manages users in its own system and issues its own JWTs; it does not populate
Supabase `auth.users`. Adopting it would force re-keying `profiles.id` (uuid→text) and
every user FK (`channel_subscriptions`, `saved_episodes`, `playback_progress`,
`live_streams.host_id`), rewriting RLS, moving profile creation to a Clerk webhook, and
swapping the NestJS verifier — a large migration of Phases 1–3 foundations for little gain,
since Supabase already supports Google + Apple + email/password.

---

## 1. CRITICAL doc clarification — "OAuth Server" vs "Social Login"

These sound alike but are opposites. Do not confuse them:
- **Social Login (OAuth)** = Supabase as the OAuth **client** → *your users sign into your
  app with Google/Apple*. **THIS is what BibleWay wants.** Docs: `/auth/social-login/auth-google`, `/auth/social-login/auth-apple`.
- **OAuth 2.1 Server** (`/auth/oauth-server`) = Supabase turning *your* app into an OAuth
  **provider** so OTHER apps can "Sign in with BibleWay" (e.g. MCP auth). **NOT what we want.**

---

## 2. Current state (already built across Phases 0–1 + Auth-screen pass)

Backend (`backend/api/src/`):
- `auth/auth.guard.ts` — `SupabaseAuthGuard`: verifies `Authorization: Bearer <jwt>` via `supabase.auth.getUser(token)` (network call per request — to be hardened, see §4 B1).
- `auth/optional-auth.guard.ts` — `OptionalAuthGuard`: attaches user if a valid token is present, else proceeds anonymous.
- `auth/current-user.decorator.ts` — `@CurrentUser()` returns `AuthUser | undefined`.
- `profiles/` — `GET /profiles/:handle`, `GET /profiles/me`, `PATCH /profiles/me`, `GET /profiles/check-handle` (AUTH-GATED currently).
- DB: `profiles` 1:1 with `auth.users`; `handle_new_user()` trigger auto-creates a profile on signup, deriving `handle` from `raw_user_meta_data` (`user_name`/`preferred_username`) or email; unique citext `handle`.

Frontend (`Frontend/`):
- `src/services/supabase.ts` — Supabase client; **chunked expo-secure-store** storage adapter; `autoRefreshToken: true`, `persistSession: true`, `detectSessionInUrl: false`; crash-proof placeholder when env unset; `isSupabaseConfigured`.
- `src/services/session.ts` — `initAuthBridge()` (wires API token provider to live session), `useAuthSession()` (session + loading + onAuthStateChange), and `signInWithPassword` / `signUpWithPassword` / `signOut`.
- `src/screens/AuthScreen.tsx` — email/password sign-in ⇄ sign-up toggle, validation, error/info states.
- `app/_layout.tsx` — **auth gate**: loading → spinner; no session → `AuthScreen`; signed in → app (`useSyncProfileToStore` hydrates the store).
- `src/screens/EditProfileScreen.tsx` — **Sign Out** button.
- `src/hooks/useProfile.ts` — `useMyProfile`, `useUpdateProfile`, `useCheckHandle`, `useSyncProfileToStore`.
- `Frontend/.env` — `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (generated from backend/.env).

**Gaps to close (this plan):** OAuth (Google/Apple) buttons, username-or-email login,
public handle check for signup, password reset, local JWT verification, foreground
token refresh + 401 handling.

---

## 3. The mobile-correct OAuth flow (native, NOT web redirect)

For React Native / Expo, use the platform's **native** sign-in to obtain an ID token, then
exchange it with Supabase via `signInWithIdToken` — **no redirect/deep-linking needed**
(fits "email confirmation/deep-links deferred").

```ts
// Apple (expo-apple-authentication)
const cred = await AppleAuthentication.signInAsync({
  requestedScopes: [
    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
    AppleAuthentication.AppleAuthenticationScope.EMAIL,
  ],
});
const { data, error } = await supabase.auth.signInWithIdToken({
  provider: 'apple',
  token: cred.identityToken!,
});
// Apple returns fullName ONLY on first sign-in → persist it then:
if (cred.fullName?.givenName) {
  await supabase.auth.updateUser({ data: {
    full_name: `${cred.fullName.givenName} ${cred.fullName.familyName ?? ''}`.trim(),
  }});
}

// Google (@react-native-google-signin/google-signin)
const { idToken } = await GoogleSignin.signIn();
await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
```
Both return a normal Supabase session; the `on_auth_user_created` trigger auto-creates the profile.

---

## 4. The plan (workstreams)

### A. Dashboard / provider setup (HUMAN; not pure-dashboard — external apps required)
1. **Google** — In **Google Cloud Console** create OAuth client IDs: **Web** (for Supabase),
   **iOS**, and **Android**. In Supabase → Auth → Providers → **Google**: enable, paste the
   **Web** client ID + secret, and add the **iOS/Android** client IDs under "Authorized Client IDs"
   (required for native id-token validation). Free.
2. **Apple** — Requires a **paid Apple Developer account ($99/yr)**. Create:
   - **Team ID** (10-char, Apple Developer console).
   - **App ID** = bundle id (e.g. `com.bibleway.app`) with the **Sign in with Apple** capability.
   - (Only for web/OAuth flow) a **Services ID** + a signing **Key (.p8)** to generate the client
     secret. **Apple client secret must be rotated every 6 months** — set a reminder. Keep the `.p8` safe.
   - In Supabase → Auth → Providers → **Apple**: enable; for **native** sign-in add the bundle id /
     Services ID under **Client IDs**. (Native-only does NOT require the 6-month secret rotation.)
   - Caveat: Apple's identity token has the **full name only on the first authorization** → capture
     and save via `updateUser` (see §3).
3. **Email confirmation** — keep **OFF**: Auth → Providers → Email → disable "Confirm email".
4. **Password-reset email template** — edit to include the `{{ .Token }}` **6-digit code** so reset
   works via code entry (no deep-linking). Auth → Email Templates → Reset Password.
5. (Optional) These can also be set via the Supabase **Management API** (`external_google_enabled`,
   `external_apple_enabled`, etc.) with a personal access token.

### B. Backend (NestJS)
1. **Local JWT verification (hardening).** Replace per-request `auth.getUser` with **local
   verification** of the access-token JWT using `jose` + the project **JWKS**
   (`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`) — modern Supabase uses asymmetric signing keys.
   Keep `getUser` as a fallback if local verify can't be configured. Attach `{ id, email, token }`.
   New dep: `jose` (HUMAN runs `npm install`).
   - Add `SUPABASE_JWT_SECRET` to env **only** if the project uses legacy HS256; prefer JWKS.
2. **Username login shim** — `POST /auth/sign-in-with-username { username, password }`:
   look up the user's email by `profiles.handle` **server-side with the service role** (so emails are
   never exposed / no enumeration endpoint), call `signInWithPassword` on a server client, return
   `{ access_token, refresh_token }`. Frontend then calls `supabase.auth.setSession(...)`.
   (Consider basic rate-limiting; Supabase also rate-limits sign-in.)
3. **Public handle-availability check** — `GET /auth/check-handle?handle=` (NO auth) for signup-time
   validation. (The existing `/profiles/check-handle` is auth-gated; this is the public variant.)
4. New `AuthController` + module for B2/B3; register in `app.module.ts` (it's in the `AuthModule` slot already).
5. No change to the profiles trigger — pass the chosen username via signup metadata
   (`signUp(..., { data: { user_name: username, full_name: displayName } })`) so the trigger sets `handle`.

### C. Frontend (Expo)
1. **Signup**: add **username** + display-name fields to `AuthScreen`; validate via the public
   check-handle endpoint; pass `user_name`/`full_name` in `signUp` metadata.
2. **Login**: identifier field accepts **email or username** — if it contains `@`, `signInWithPassword`;
   else call the username shim → `supabase.auth.setSession`.
3. **Google + Apple buttons** via native id-token flow (§3). Apple button shown on iOS only.
4. **Forgot password** (code-based, no deep link): enter email → `resetPasswordForEmail` → enter the
   6-digit code + new password → `verifyOtp({ type: 'recovery', email, token })` → `updateUser({ password })`.
5. New frontend deps (HUMAN installs on Windows): `expo-apple-authentication`,
   `@react-native-google-signin/google-signin` (or `expo-auth-session` + `expo-web-browser`).

### D. Session robustness
1. **Foreground auto-refresh**: wire React Native `AppState` →
   `supabase.auth.startAutoRefresh()` on active, `stopAutoRefresh()` on background.
2. **401 handling in `api.ts`**: on 401, attempt one `supabase.auth.refreshSession()` + retry once;
   if still 401 → `signOut()` (gate returns to AuthScreen). Prevents stuck/expired sessions.
3. Confirm persistence/restore survives app restarts with all new flows.

### E. Verify
- Backend typecheck/build (dist-path workaround — see §6).
- Manual matrix: email signup→login; **username** login; **Google** + **Apple** (on a dev build);
  **password reset** via code; **token expiry → refresh → retry**; **sign-out → gate**. `/profiles/me`
  resolves on every path.

---

## 5. Env vars, deps, and platform caveats

### New env (backend/.env + .env.example) — all OPTIONAL in the Zod schema (graceful boot)
```
# Only if project uses legacy HS256 JWTs (prefer JWKS, which needs no secret):
SUPABASE_JWT_SECRET=
```
(Frontend OAuth client IDs are configured in Supabase + the native libs' config, not in app env, except any Google webClientId the lib needs — keep in app config/EXPO_PUBLIC if required by the chosen lib.)

### New deps (HUMAN runs `npm install` — never from the sandbox; it breaks the Windows junction)
- Backend: `jose`.
- Frontend: `expo-apple-authentication`, `@react-native-google-signin/google-signin` (or `expo-auth-session` + `expo-web-browser`).

### Expo Go vs dev build (sequencing matters)
- **Works in Expo Go now:** email/username/password sign-up + sign-in, password reset, session handling.
- **Needs a custom dev build (`npx expo run:android` / `run:ios`), NOT Expo Go:** native **Google** sign-in.
- **Apple sign-in:** testable in **Expo Go** per Supabase docs, but needs a real iOS device + paid Apple Developer account for full setup; mandatory before App Store release if Google is offered.
- → Build the email/username path + reset first (testable immediately); add OAuth buttons once provider apps are registered and a dev build exists.

---

## 6. Conventions & gotchas (carried over from Phases 1–3 — READ before building)
- **Write files via shell heredocs** (`cat > file <<'EOF'`); the file tools truncate on this mount. Verify each file's last line after writing.
- **Backend typecheck** can't use a normal build in the sandbox (the `@bibleway/shared-types` workspace symlink is a Windows junction that doesn't resolve in Linux). Use a throwaway `api/tsconfig.verify.json` with `paths` → `../packages/shared-types/dist/index.d.ts`, run `npx tsc -p tsconfig.verify.json --noEmit`, then delete it (`mcp__cowork__allow_cowork_file_delete` if `rm` is blocked).
- **NEVER run `npm install` for the backend from the sandbox** — it rewrites `node_modules/@bibleway/*` as Linux symlinks and breaks `nest start` on Windows. Add deps to `package.json`; the HUMAN runs `npm install` on Windows.
- **Hosted Supabase project** had email confirmation ON by default — for testing, confirm a user via SQL Editor: `update auth.users set email_confirmed_at = now() where email = '...';` (or toggle confirmation off).
- **New Supabase API keys**: `sb_publishable_...` (client/anon) and `sb_secret_...` (service role). Secret keys are rejected in "browser-like" requests — only use them server-side (NestJS), never from the app or `Invoke-RestMethod`.
- RLS owner pattern: `(select auth.uid()) = <user col>`; privileged columns protected by `SECURITY DEFINER` triggers checking `auth.role() = 'service_role'`.

---

## 7. Reference links
- Social Login overview: https://supabase.com/docs/guides/auth/social-login
- Google: https://supabase.com/docs/guides/auth/social-login/auth-google
- Apple: https://supabase.com/docs/guides/auth/social-login/auth-apple
- Expo + Social Auth quickstart: https://supabase.com/docs/guides/auth/quickstarts/with-expo-react-native-social-auth
- Passwords / password reset: https://supabase.com/docs/guides/auth/passwords
- Sessions: https://supabase.com/docs/guides/auth/sessions
- JWT signing keys / JWKS: https://supabase.com/docs/guides/auth/signing-keys
- Redirect URLs (for later deep-link/email work): https://supabase.com/docs/guides/auth/redirect-urls
- Rate limits: https://supabase.com/docs/guides/auth/rate-limits
- (NOT this — provider server, different feature): https://supabase.com/docs/guides/auth/oauth-server

---

## 8. Build task checklist (when executing)
- [ ] A. Dashboard: enable Google + Apple providers (register Google Cloud + Apple Developer apps); confirm email OFF; reset-email template includes token code.
- [x] B1. Backend: local JWT verification via JWKS (`jose`) in `SupabaseAuthGuard`, getUser fallback. (add dep; human installs)
- [x] B2. Backend: `POST /auth/sign-in-with-username` shim (service-role email lookup).
- [x] B3. Backend: public `GET /auth/check-handle`.
- [x] C1. Frontend: signup username + displayName fields + availability check + metadata.
- [x] C2. Frontend: email-or-username login (detect `@`, else shim → setSession).
- [x] C3. (code done; needs deps install + dashboard + dev build to TEST) Frontend: Google + Apple buttons via `signInWithIdToken` (+ Apple full-name capture). (add deps; human installs; needs dev build)
- [x] C4. Frontend: forgot-password (code-based reset).
- [x] D1. Frontend: AppState start/stopAutoRefresh.
- [x] D2. Frontend: 401 → refresh → retry → signOut in `api.ts`.
- [x] E. (typechecks pass; manual matrix pending live run) Verify: typecheck + manual matrix.
