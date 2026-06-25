import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import type { HandleAvailability } from '@bibleway/shared-types';
import { AuthService, type SessionTokens } from './auth.service';
import { CheckHandleQueryDto, SignInWithUsernameDto, SignUpDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Public: create an account (no email confirmation) and return a session. */
  @Post('sign-up')
  signUp(@Body() dto: SignUpDto): Promise<SessionTokens> {
    return this.auth.signUp(dto.email, dto.username, dto.displayName, dto.password);
  }

  /** Public: exchange username + password for a Supabase session. */
  @Post('sign-in-with-username')
  signInWithUsername(@Body() dto: SignInWithUsernameDto): Promise<SessionTokens> {
    return this.auth.signInWithUsername(dto.username, dto.password);
  }

  /** Public: is a username/handle available? (signup-time validation) */
  @Get('check-handle')
  checkHandle(@Query() query: CheckHandleQueryDto): Promise<HandleAvailability> {
    return this.auth.checkHandle(query.handle);
  }
}
