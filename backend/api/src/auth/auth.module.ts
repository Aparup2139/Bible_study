import { Global, Module } from '@nestjs/common';
import { SupabaseAuthGuard } from './auth.guard';

/**
 * Auth wiring for Phase 1. SupabaseModule is @Global, so the guard can inject
 * SupabaseService. Exported so feature modules can apply @UseGuards(SupabaseAuthGuard).
 */
@Global()
@Module({
  providers: [SupabaseAuthGuard],
  exports: [SupabaseAuthGuard],
})
export class AuthModule {}
