import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

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

/** PUT /podcasts/episodes/:id/progress */
export class UpdateProgressDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24 * 60 * 60) // sanity cap: 24h in seconds
  positionSeconds!: number;
}
