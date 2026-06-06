import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { AuthUser } from './auth.guard';

/**
 * Injects the authenticated user into a handler param.
 *
 * - On routes guarded by SupabaseAuthGuard, `req.user` is always present, so the
 *   handler can type the param as `AuthUser`.
 * - On routes guarded by OptionalAuthGuard, anonymous requests have no user, so
 *   this returns `undefined` — type the param as `AuthUser | undefined`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    return req.user;
  },
);
