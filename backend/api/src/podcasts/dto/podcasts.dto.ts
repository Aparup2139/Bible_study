import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/** MIME types the podcast-audio bucket accepts (kept in sync with 0004_podcasts.sql). */
export const ALLOWED_AUDIO_MIME = [
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
  'audio/wav',
] as const;
export type AudioMime = (typeof ALLOWED_AUDIO_MIME)[number];

/** Common cursor-pagination query. */
export class PageQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;
}

/** Episodes list query (optionally scoped to a channel). */
export class EpisodesQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  channelId?: string;
}

/** POST /podcasts/uploads — request a signed upload URL for a new episode's audio. */
export class CreateUploadDto {
  @IsString()
  @Length(1, 64)
  channelId!: string;

  @IsIn(ALLOWED_AUDIO_MIME)
  contentType!: AudioMime;
}

/** POST /podcasts/episodes — create the episode row after the audio is uploaded. */
export class CreateEpisodeDto {
  @IsString()
  @Length(1, 128)
  episodeId!: string;

  @IsString()
  @Length(1, 64)
  channelId!: string;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsIn(ALLOWED_AUDIO_MIME)
  contentType!: AudioMime;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24 * 60 * 60) // sanity cap: 24h in seconds
  durationSeconds!: number;
}

/** PUT /podcasts/episodes/:id/progress */
export class UpdateProgressDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24 * 60 * 60) // sanity cap: 24h in seconds
  positionSeconds!: number;
}
