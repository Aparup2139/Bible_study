/**
 * Auth session wiring (Phase 1).
 *
 * - initAuthBridge(): registers the API client's token provider so every request
 *   carries the current Supabase access token. Safe to call multiple times.
 * - useAuthSession(): React hook exposing the live session + loading state and
 *   keeping them in sync via Supabase's auth state listener.
 */
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import { setAuthTokenProvider } from './api';

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

    return () => {
      active = false;
      sub.subscription.unsubscribe();
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
