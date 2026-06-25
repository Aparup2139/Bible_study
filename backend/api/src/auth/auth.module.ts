import { Global, Module } from '@nestjs/common';
import { SupabaseAuthGuard } from './auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ProfilesModule } from '../profiles/profiles.module';

/**
 * Global so any feature module can apply @UseGuards(SupabaseAuthGuard).
 * Imports ProfilesModule for the public handle-availability check.
 */
@Global()
@Module({
  imports: [ProfilesModule],
  controllers: [AuthController],
  providers: [SupabaseAuthGuard, AuthService],
  exports: [SupabaseAuthGuard],
})
export class AuthModule {}
