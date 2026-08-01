import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** POST /rooms/join */
export class JoinRoomDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8)
  avatarEmoji!: string;
}

/** POST /rooms/:id/mute/:userId */
export class MuteDto {
  @IsOptional()
  @IsBoolean()
  muted?: boolean;
}
