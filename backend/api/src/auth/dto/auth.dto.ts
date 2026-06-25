import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** POST /auth/sign-in-with-username */
export class SignInWithUsernameDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,30}$/, {
    message: 'username must be 3–30 chars: letters, digits, or underscore',
  })
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

/** GET /auth/check-handle?handle=... */
export class CheckHandleQueryDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,30}$/, {
    message: 'handle must be 3–30 chars: letters, digits, or underscore',
  })
  handle!: string;
}


/** POST /auth/sign-up — email + username + password (no email confirmation). */
export class SignUpDto {
  @IsEmail({}, { message: 'a valid email is required' })
  email!: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,30}$/, {
    message: 'username must be 3-30 chars: letters, digits, or underscore',
  })
  username!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  displayName?: string;

  @IsString()
  @MinLength(6, { message: 'password must be at least 6 characters' })
  password!: string;
}
