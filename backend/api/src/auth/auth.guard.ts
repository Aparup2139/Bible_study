import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { SupabaseService } from '../supabase/supabase.service';

/** The authenticated principal attached to the request by SupabaseAuthGuard. */
export interface AuthUser {
  id: string;
  email: string | null;
  /** The raw access token, so handlers can build a user-scoped Supabase client. */
  token: string;
}

/** Augment Fastify's request with the resolved user. */
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

/**
 * Verifies the `Authorization: Bearer <jwt>` header against Supabase Auth and
 * attaches the user to the request. Reject if missing/invalid.
 *
 * Phase 1 verifies the token by asking Supabase (`auth.getUser`). This is correct
 * and simple; at scale, switch to local JWT signature verification (with the
 * project's JWT secret) to avoid a network hop per request.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);

  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const token = extractBearer(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    if (!this.supabase.isConfigured()) {
      // Fail loudly rather than silently letting requests through.
      throw new UnauthorizedException('Auth is not configured on the server');
    }

    const { data, error } = await this.supabase.admin.auth.getUser(token);
    if (error || !data?.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    req.user = {
      id: data.user.id,
      email: data.user.email ?? null,
      token,
    };
    return true;
  }
}

function extractBearer(header?: string): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) return null;
  return value.trim();
}
