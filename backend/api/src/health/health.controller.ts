import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import type { Env } from '../config/env';

interface HealthResponse {
  status: 'ok';
  service: string;
  env: string;
  supabaseConfigured: boolean;
  uptimeSeconds: number;
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly supabase: SupabaseService,
  ) {}

  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      service: '@bibleway/api',
      env: this.config.get('NODE_ENV', { infer: true }),
      supabaseConfigured: this.supabase.isConfigured(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
