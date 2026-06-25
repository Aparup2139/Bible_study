import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../config/env';

/**
 * Provides Supabase clients.
 *
 * - `admin` uses the service-role key and BYPASSES Row Level Security. Use it only
 *   for trusted server-side operations (never expose it to clients).
 * - `forUser(accessToken)` returns a client scoped to an end-user's JWT, so RLS
 *   policies apply as that user — this is what most request handlers should use.
 *
 * Clients are created lazily so the API can boot (and serve /health) before
 * Supabase credentials are configured during Phase 0.
 */
@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private adminClient: SupabaseClient | null = null;
  private anonClient: SupabaseClient | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    const url = this.config.get('SUPABASE_URL', { infer: true });
    if (!url) {
      this.logger.warn(
        'SUPABASE_URL not set — Supabase clients are unavailable until configured (.env). ' +
          'This is expected during Phase 0 before a Supabase project exists.',
      );
    }
  }

  /** Service-role client. Bypasses RLS — server-side trusted use only. */
  get admin(): SupabaseClient {
    if (!this.adminClient) {
      const url = this.requireConfig('SUPABASE_URL');
      const key = this.requireConfig('SUPABASE_SERVICE_ROLE_KEY');
      this.adminClient = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
    return this.adminClient;
  }

  /**
   * Anon client (publishable key, no user session). Used for server-side calls
   * that must run as "anon", e.g. password sign-in on behalf of a username.
   */
  get anon(): SupabaseClient {
    if (!this.anonClient) {
      const url = this.requireConfig('SUPABASE_URL');
      const key = this.requireConfig('SUPABASE_ANON_KEY');
      this.anonClient = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
    return this.anonClient;
  }

  /** Client scoped to an end-user's access token, so RLS applies as that user. */
  forUser(accessToken: string): SupabaseClient {
    const url = this.requireConfig('SUPABASE_URL');
    const anon = this.requireConfig('SUPABASE_ANON_KEY');
    return createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  /** True once Supabase credentials are present. */
  isConfigured(): boolean {
    return Boolean(this.config.get('SUPABASE_URL', { infer: true }));
  }

  private requireConfig(key: keyof Env): string {
    const value = this.config.get(key, { infer: true }) as string | undefined;
    if (!value) {
      throw new Error(
        `${key} is not configured. Set it in backend/.env before using Supabase.`,
      );
    }
    return value;
  }
}
