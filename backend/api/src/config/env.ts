import { z } from 'zod';

/**
 * Environment schema. Validated once at boot — the app refuses to start with a
 * bad/missing config rather than failing mysteriously at runtime.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // Phase 3: Upstash Redis for buffering playback-progress writes.
  // Optional — when unset, the API falls back to direct Postgres UPSERTs.
  REDIS_URL: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Used by @nestjs/config's `validate` hook. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
