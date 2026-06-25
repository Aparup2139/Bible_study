import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** POST /streams */
export class CreateStreamDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  subtitle?: string;

  @IsOptional()
  @IsString()
  denominationId?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

/** GET /streams */
export class StreamPageQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;
}

/** POST /streams/uploads */
export class CreateUploadDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24 * 60 * 60)
  maxDurationSeconds!: number;
}
