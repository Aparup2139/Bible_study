import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env';
import { SupabaseModule } from './supabase/supabase.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    SupabaseModule,
    HealthModule,
    // Feature modules are added per phase under ./modules/<feature>:
    //   Phase 1  AuthModule, ProfilesModule
    //   Phase 2  DenominationsModule
    //   Phase 3  PodcastsModule
    //   Phase 4  StreamsModule
    //   Phase 5  ChatModule
    //   Phase 6  RoomsModule
    //   Phase 7  SearchModule
  ],
})
export class AppModule {}
