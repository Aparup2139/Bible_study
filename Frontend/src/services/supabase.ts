/**
 * Supabase client for the Expo app (Phase 1).
 *
 * Session tokens are persisted with expo-secure-store (encrypted device storage).
 * SecureStore caps a single value at ~2KB, but a Supabase session (access +
 * refresh + user JSON) can exceed that, so we chunk values across keys.
 *
 * Config comes from EXPO_PUBLIC_* env vars (set in Frontend/.env or app config):
 *   EXPO_PUBLIC_SUPABASE_URL
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY   (the publishable / anon key — safe on device)
 */
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 2000; // stay under SecureStore's 2048-byte value limit

/** A SecureStore-backed storage adapter that transparently chunks large values. */
const ChunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const meta = await SecureStore.getItemAsync(key);
    if (meta === null) return null;
    // meta is either the value itself (small) or "chunks:<n>".
    const match = /^chunks:(\d+)$/.exec(meta);
    if (!match) return meta;
    const count = Number(match[1]);
    let out = '';
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part === null) return null; // corrupt — treat as missing
      out += part;
    }
    return out;
  },

  async setItem(key: string, value: string): Promise<void> {
    await this.removeItem(key);
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const count = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(
        `${key}.${i}`,
        value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
      );
    }
    await SecureStore.setItemAsync(key, `chunks:${count}`);
  },

  async removeItem(key: string): Promise<void> {
    const meta = await SecureStore.getItemAsync(key);
    if (meta) {
      const match = /^chunks:(\d+)$/.exec(meta);
      if (match) {
        const count = Number(match[1]);
        for (let i = 0; i < count; i++) {
          await SecureStore.deleteItemAsync(`${key}.${i}`);
        }
      }
    }
    await SecureStore.deleteItemAsync(key);
  },
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as
  | string
  | undefined;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Warn rather than throw so the app still boots on mock data without config.
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY not set — auth is disabled.',
  );
}

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Fall back to harmless placeholders when unconfigured so createClient doesn't
// throw at import time (supabase-js rejects empty URLs). Every real use is gated
// by isSupabaseConfigured, so the placeholder client is never actually called.
export const supabase = createClient(
  SUPABASE_URL ?? 'http://localhost:54321',
  SUPABASE_ANON_KEY ?? 'public-anon-placeholder',
  {
    auth: {
    storage: ChunkedSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    // No URL-based session detection on native (deep-link callback handles OAuth).
    detectSessionInUrl: false,
    },
  },
);
