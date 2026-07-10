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
  // Optional: only needed for LEGACY HS256 projects to enable local JWT verify.
  // Modern projects use asymmetric signing keys (JWKS) and need no secret here.
  SUPABASE_JWT_SECRET: z.string().min(1).optional(),

  // Phase 3: Upstash Redis for buffering playback-progress writes.
  // Optional — when unset, the API falls back to direct Postgres UPSERTs.
  REDIS_URL: z.string().min(1).optional(),

  // AI Bible agent — NVIDIA-hosted GLM (OpenAI-compatible API).
  // Optional: when NVIDIA_API_KEY is unset the /agent/ask endpoint returns 503.
  NVIDIA_API_KEY: z.string().min(1).optional(),
  NVIDIA_BASE_URL: z.string().url().default('https://integrate.api.nvidia.com/v1'),
  NVIDIA_MODEL: z.string().default('z-ai/glm-5.2'),

  // Phase 4 — Cloudflare Stream (live + on-demand video).
  // All optional: when CLOUDFLARE_STREAM_API_TOKEN is unset, /streams endpoints
  // return 503 and the rest of the API is unaffected.
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1).optional(),
  CLOUDFLARE_STREAM_API_TOKEN: z.string().min(1).optional(), // server-side only; Stream Read+Edit
  CLOUDFLARE_STREAM_CUSTOMER_CODE: z.string().min(1).optional(), // the "customer-<CODE>" playback subdomain
  CLOUDFLARE_STREAM_KEY_ID: z.string().min(1).optional(), // signing key id (signed playback)
  CLOUDFLARE_STREAM_KEY_PEM: z.string().min(1).optional(), // base64 PEM from POST /stream/keys
  CLOUDFLARE_STREAM_WEBHOOK_SECRET: z.string().min(1).optional(), // from PUT /stream/webhook

  // Agora Interactive Live Streaming (replaces Cloudflare live; CF stays for VOD).
  // Optional: when unset, go-live/token endpoints return 503 and the rest of the
  // API is unaffected. App Certificate must be enabled on the Agora project.
  AGORA_APP_ID: z.string().min(1).optional(),
  AGORA_APP_CERTIFICATE: z.string().min(1).optional(), // server-side only, never sent to clients
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
