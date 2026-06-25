import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import { SupabaseService } from '../supabase/supabase.service';
import type { Env } from '../config/env';

/** The authenticated principal attached to the request. */
export interface AuthUser {
  id: string;
  email: string | null;
  /** The raw access token, so handlers can build a user-scoped Supabase client. */
  token: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

/**
 * Verifies the `Authorization: Bearer <jwt>` access token and attaches the user.
 *
 * Two-tier verification:
 *  1. FAST PATH — verify the JWT signature + claims LOCALLY (no network) using the
 *     project's JWKS (asymmetric signing keys) or, for legacy HS256 projects, the
 *     SUPABASE_JWT_SECRET. Requires the `jose` package (loaded dynamically so the
 *     app still builds/boots before `npm install`).
 *  2. FALLBACK — ask Supabase to validate the token (`auth.getUser`). Always
 *     correct; used when local verification is unavailable or fails to configure.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);
  private jwks: unknown = null;
  private jwksInitTried = false;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const token = extractBearer(req.headers.authorization);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    if (!this.supabase.isConfigured()) {
      throw new UnauthorizedException('Auth is not configured on the server');
    }

    // 1) Fast path: local signature + claims verification.
    const local = await this.verifyLocally(token);
    if (local) {
      req.user = local;
      return true;
    }

    // 2) Fallback: Supabase validates the token.
    const { data, error } = await this.supabase.admin.auth.getUser(token);
    if (error || !data?.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    req.user = { id: data.user.id, email: data.user.email ?? null, token };
    return true;
  }

  /** Returns the user if the token verifies locally, else null (caller falls back). */
  private async verifyLocally(token: string): Promise<AuthUser | null> {
    const url = this.config.get('SUPABASE_URL', { infer: true });
    if (!url) return null;
    const issuer = `${url}/auth/v1`;

    // jose is loaded dynamically and typed as any so the project builds without it
    // installed; once `npm install` adds it, the fast path activates automatically.
    let jose: any;
    try {
      jose = await import('jose' as string);
    } catch {
      return null; // not installed yet → fallback
    }

    // Asymmetric (JWKS) — the modern default.
    try {
      const jwks = this.getJwks(jose, url);
      if (jwks) {
        const { payload } = await jose.jwtVerify(token, jwks, { issuer, audience: 'authenticated' });
        return toUser(payload, token);
      }
    } catch {
      // signature/claims invalid for JWKS — try HS256 below, else fall back.
    }

    // Symmetric (HS256) — legacy projects with SUPABASE_JWT_SECRET.
    const secret = this.config.get('SUPABASE_JWT_SECRET', { infer: true });
    if (secret) {
      try {
        const key = new TextEncoder().encode(secret);
        const { payload } = await jose.jwtVerify(token, key, { issuer, audience: 'authenticated' });
        return toUser(payload, token);
      } catch {
        // fall through
      }
    }
    return null;
  }

  private getJwks(jose: any, url: string): unknown {
    if (this.jwks) return this.jwks;
    if (this.jwksInitTried) return null;
    this.jwksInitTried = true;
    try {
      this.jwks = jose.createRemoteJWKSet(
        new URL(`${url}/auth/v1/.well-known/jwks.json`),
      );
      return this.jwks;
    } catch (err) {
      this.logger.warn(
        `JWKS init failed — using getUser fallback: ${(err as Error).message}`,
      );
      return null;
    }
  }
}

function toUser(payload: Record<string, unknown>, token: string): AuthUser | null {
  const sub = payload?.['sub'];
  if (!sub) return null;
  const email = payload?.['email'];
  return {
    id: String(sub),
    email: typeof email === 'string' ? email : null,
    token,
  };
}

function extractBearer(header?: string): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) return null;
  return value.trim();
}
