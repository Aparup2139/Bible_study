import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  HandleAvailability,
  UserProfile,
} from '@bibleway/shared-types';
import { SupabaseAuthGuard, type AuthUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CheckHandleDto, UpdateProfileDto } from './dto/update-profile.dto';
import { ProfilesService } from './profiles.service';

@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  /** Current user's profile. Auth required. Declared before ':handle' to win routing. */
  @Get('me')
  @UseGuards(SupabaseAuthGuard)
  getMe(@CurrentUser() user: AuthUser): Promise<UserProfile> {
    return this.profiles.getById(user.id);
  }

  /** Handle-availability check for the edit screen. Auth required (knows the owner). */
  @Get('check-handle')
  @UseGuards(SupabaseAuthGuard)
  checkHandle(
    @Query() query: CheckHandleDto,
    @CurrentUser() user: AuthUser,
  ): Promise<HandleAvailability> {
    return this.profiles.checkHandle(query.handle, user.id);
  }

  /** Update the current user's profile. Auth required. */
  @Patch('me')
  @UseGuards(SupabaseAuthGuard)
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfile> {
    return this.profiles.updateOwn(user.id, user.token, dto);
  }

  /** Public profile by handle. No auth. Keep LAST so it doesn't shadow /me etc. */
  @Get(':handle')
  getByHandle(@Param('handle') handle: string): Promise<UserProfile> {
    return this.profiles.getByHandle(handle);
  }
}
