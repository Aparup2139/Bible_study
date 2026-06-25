import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env';
import { SupabaseModule } from './supabase/supabase.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { ProfilesModule } from './profiles/profiles.module';
import { DenominationsModule } from './denominations/denominations.module';
import { PodcastsModule } from './podcasts/podcasts.module';
import { AgentModule } from './agent/agent.module';
import { StreamsModule } from './streams/streams.module';
import { RedisModule } from './redis/redis.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // The API runs from backend/api/, but .env lives at the backend/ root.
      // Check both so either location works.
      envFilePath: ['.env', '../.env'],
    }),
    ScheduleModule.forRoot(),
    SupabaseModule,
    RedisModule,
    HealthModule,
    // Phase 1
    AuthModule,
    ProfilesModule,
    // Phase 2
    DenominationsModule,
    // Phase 3
    PodcastsModule,
    // AI Bible agent (NVIDIA-hosted Qwen)
    AgentModule,
    // Phase 4 — Cloudflare Stream (live + on-demand video)
    StreamsModule,
    // Feature modules are added per phase under ./modules/<feature>:
    //   Phase 4  StreamsModule
    //   Phase 5  ChatModule
    //   Phase 6  RoomsModule
    //   Phase 7  SearchModule
  ],
})
export class AppModule {}
