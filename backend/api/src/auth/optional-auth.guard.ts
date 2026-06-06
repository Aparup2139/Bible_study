import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * Like SupabaseAuthGuard, but never rejects: if a valid Bearer token is present
 * it attaches req.user; otherwise the request proceeds anonymously. Lets the
 * podcast catalog enrich with per-user state (isSaved/isSubscribed/progress)
 * when logged in, while staying browsable when logged out.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const token = extractBearer(req.headers.authorization);
    if (!token || !this.supabase.isConfigured()) return true;

    try {
      const { data, error } = await this.supabase.admin.auth.getUser(token);
      if (!error && data?.user) {
        req.user = { id: data.user.id, email: data.user.email ?? null, token };
      }
    } catch {
      // Ignore — treat as anonymous.
    }
    return true;
  }
}

function extractBearer(header?: string): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) return null;
  return value.trim();
}
