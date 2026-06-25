import { IsString, MaxLength, MinLength } from 'class-validator';

/** POST /agent/ask */
export class AskDto {
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  question!: string;
}
