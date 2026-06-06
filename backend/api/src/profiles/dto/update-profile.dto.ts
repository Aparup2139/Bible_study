import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { UpdateProfileInput } from '@bibleway/shared-types';

/**
 * Whitelisted, validated fields for PATCH /profiles/me.
 * The global ValidationPipe ({ whitelist: true }) strips any field not declared
 * here — so clients can never sneak in subscriber_count / is_verified.
 */
export class UpdateProfileDto implements UpdateProfileInput {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  displayName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,30}$/, {
    message:
      'handle must be 3–30 characters: letters, digits, or underscore (no leading @)',
  })
  handle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  bio?: string;

  // avatarPath may be a storage path or explicitly null (to remove the avatar).
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(255)
  avatarPath?: string | null;

  // Denomination ids are slugs (e.g. 'roman-catholic'), validated by the FK.
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @Matches(/^[a-z0-9-]{2,50}$/, { message: 'denominationId must be a valid slug' })
  denominationId?: string | null;
}

/** Query DTO for GET /profiles/check-handle?handle=... */
export class CheckHandleDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,30}$/, {
    message: 'handle must be 3–30 characters: letters, digits, or underscore',
  })
  handle!: string;
}
