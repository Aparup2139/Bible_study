/**
 * Auth session wiring (Phase 1).
 *
 * - initAuthBridge(): registers the API client's token provider so every request
 *   carries the current Supabase access token. Safe to call multiple times.
 * - useAuthSession(): React hook exposing the live session + loading state and
 *   keeping them in sync via Supabase's auth state listener.
 */
import { useEffect, useState } from 'react';
import { Alert, AppState, type AppStateStatus } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import { api } from './api';
import { setAuthTokenProvider, setUnauthorizedHandler } from './api';

let bridged = false;

/** Make api.ts pull the access token from the live Supabase session. */
export function initAuthBridge(): void {
  if (bridged) return;
  bridged = true;
  setAuthTokenProvider(async () => {
    if (!isSupabaseConfigured) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  });

  // On a 401, attempt a refresh; if it fails, sign out (the gate shows AuthScreen).
  setUnauthorizedHandler(async () => {
    if (!isSupabaseConfigured) return false;
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session) {
      await supabase.auth.signOut();
      return false;
    }
    return true;
  });
}

export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initAuthBridge();

    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    // Refresh tokens while the app is foregrounded; pause when backgrounded.
    supabase.auth.startAutoRefresh();
    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    };
    const appSub = AppState.addEventListener('change', onAppState);

    return () => {
      active = false;
      sub.subscription.unsubscribe();
      appSub.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  return { session, loading, isAuthenticated: Boolean(session) };
}


// ===== Auth actions (Phase 1 UI) =========================================

export interface AuthResult {
  ok: boolean;
  /** True for sign-up when email confirmation is required (no session yet). */
  needsConfirmation?: boolean;
  error?: string;
}

/** Email/password sign in. */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<AuthResult> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Auth is not configured.' };
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: Boolean(data.session) };
}

/** Email/password sign up. */
export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<AuthResult> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Auth is not configured.' };
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
  });
  if (error) return { ok: false, error: error.message };
  // With email confirmation ON, there is no session until the user confirms.
  return { ok: true, needsConfirmation: !data.session };
}

/** Sign the current user out. */
export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured) return;
  await supabase.auth.signOut();
}


// ===== Auth actions (full flow) ==========================================

export interface HandleAvailability {
  handle: string;
  available: boolean;
}

/** Public username-availability check (signup-time). */
export async function checkHandleAvailable(handle: string): Promise<boolean> {
  try {
    const res = await api.get<HandleAvailability>('/auth/check-handle', {
      query: { handle: handle.replace(/^@/, '') },
    });
    return res.available;
  } catch {
    return false; // be conservative: treat errors as "unavailable"
  }
}

/** Sign up with email + username + display name.
 *  Goes through the backend, which creates an ALREADY-CONFIRMED user (no email
 *  confirmation) and returns a session — so the user lands on the home page
 *  immediately. The DB trigger stores the profile + handle. */
export async function signUpWithUsername(
  email: string,
  username: string,
  displayName: string,
  password: string,
): Promise<AuthResult> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Auth is not configured.' };
  try {
    const tokens = await api.post<{ accessToken: string; refreshToken: string }>(
      '/auth/sign-up',
      {
        email: email.trim(),
        username: username.replace(/^@/, ''),
        displayName: displayName.trim(),
        password,
      },
    );
    const { error } = await supabase.auth.setSession({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Sign up failed.',
    };
  }
}

/** Sign in with either an email or a username (+ password). */
export async function signInWithIdentifier(
  identifier: string,
  password: string,
): Promise<AuthResult> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Auth is not configured.' };
  const id = identifier.trim();

  // Email path → Supabase directly.
  if (id.includes('@')) {
    return signInWithPassword(id, password);
  }

  // Username path → backend shim returns tokens; set the session locally.
  try {
    const tokens = await api.post<{ accessToken: string; refreshToken: string }>(
      '/auth/sign-in-with-username',
      { username: id.replace(/^@/, ''), password },
    );
    const { error } = await supabase.auth.setSession({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Invalid credentials',
    };
  }
}

/** Step 1 of password reset: email a 6-digit recovery code. */
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Auth is not configured.' };
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Permanently delete the signed-in user's account (server-side, cascades all
 *  data), then clear the local session so the auth gate returns to sign-in. */
export async function deleteAccount(): Promise<AuthResult> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Auth is not configured.' };
  try {
    await api.delete('/auth/account');
    await supabase.auth.signOut();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not delete the account.',
    };
  }
}

/** Step 2 of password reset: verify the code and set a new password. */
export async function confirmPasswordReset(
  email: string,
  token: string,
  newPassword: string,
): Promise<AuthResult> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Auth is not configured.' };
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: 'recovery',
  });
  if (verifyErr) return { ok: false, error: verifyErr.message };
  const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
  if (updErr) {
    // verifyOtp already signed the user in (the gate unmounted AuthScreen), so
    // a returned error would render nowhere. Sign out so the gate goes back to
    // sign-in with the password UNCHANGED, and surface the failure globally.
    await supabase.auth.signOut();
    Alert.alert(
      'Password not updated',
      `${updErr.message}\n\nYour password was not changed. Please request a new code and try again.`,
    );
    return { ok: false, error: updErr.message };
  }
  return { ok: true };
}
