import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { JoinRoomResult, StudyRoomParticipant, StudyRoomSummary } from '@bibleway/shared-types';
import { SupabaseAuthGuard, type AuthUser } from '../auth/auth.guard';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RoomsService } from './rooms.service';
import { JoinRoomDto, MuteDto } from './dto/rooms.dto';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  /** Enter the Study Chat — auto-hosts if no room is currently live. */
  @Post('join')
  @UseGuards(SupabaseAuthGuard)
  join(@Body() dto: JoinRoomDto, @CurrentUser() user: AuthUser): Promise<JoinRoomResult> {
    return this.rooms.join(user.id, dto.displayName, dto.avatarEmoji);
  }

  /** Re-mint a token for the caller's current role (used after a promotion). */
  @Post(':id/token')
  @UseGuards(SupabaseAuthGuard)
  token(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<JoinRoomResult> {
    return this.rooms.getToken(id, user.id);
  }

  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  detail(@Param('id') id: string): Promise<StudyRoomSummary> {
    return this.rooms.getRoom(id);
  }

  @Get(':id/participants')
  @UseGuards(OptionalAuthGuard)
  participants(@Param('id') id: string): Promise<StudyRoomParticipant[]> {
    return this.rooms.listParticipants(id);
  }

  @Post(':id/raise-hand')
  @UseGuards(SupabaseAuthGuard)
  async raiseHand(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.rooms.raiseHand(id, user.id);
    return { ok: true };
  }

  @Post(':id/promote/:userId')
  @UseGuards(SupabaseAuthGuard)
  async promote(@Param('id') id: string, @Param('userId') userId: string, @CurrentUser() user: AuthUser) {
    await this.rooms.promote(id, user.id, userId);
    return { ok: true };
  }

  @Post(':id/mute/:userId')
  @UseGuards(SupabaseAuthGuard)
  async mute(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: MuteDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.rooms.setForceMuted(id, user.id, userId, dto.muted !== false);
    return { ok: true };
  }

  @Post(':id/leave')
  @UseGuards(SupabaseAuthGuard)
  async leave(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.rooms.leave(id, user.id);
    return { ok: true };
  }

  @Post(':id/end')
  @UseGuards(SupabaseAuthGuard)
  async end(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.rooms.end(id, user.id);
    return { id, status: 'ended' as const };
  }
}
