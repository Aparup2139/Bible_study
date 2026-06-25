import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { HandleAvailability } from '@bibleway/shared-types';
import { SupabaseService } from '../supabase/supabase.service';
import { ProfilesService } from '../profiles/profiles.service';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly profiles: ProfilesService,
  ) {}

  /**
   * Create an account with email + username + password and return a session.
   *
   * The user is created ALREADY-CONFIRMED via the admin API (email_confirm: true),
   * so there is no email-confirmation step and the user can sign in immediately.
   * The on_auth_user_created trigger creates the profile + handle (auto-uniquified
   * if the chosen username is taken). We then sign in to return real tokens.
   */
  async signUp(
    email: string,
    username: string,
    displayName: string | undefined,
    password: string,
  ): Promise<SessionTokens> {
    const cleanEmail = email.trim().toLowerCase();

    const { data: created, error: createErr } =
      await this.supabase.admin.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: {
          user_name: username.replace(/^@/, ''),
          full_name: (displayName ?? '').trim(),
        },
      });

    if (createErr || !created?.user) {
      const msg = createErr?.message ?? 'Sign up failed';
      if (/already|registered|exists|duplicate/i.test(msg)) {
        throw new ConflictException('An account with this email already exists.');
      }
      throw new BadRequestException(msg);
    }

    // Immediately sign in (as anon) to return a session for the new account.
    const { data: session, error: signInErr } =
      await this.supabase.anon.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
    if (signInErr || !session?.session) {
      throw new BadRequestException(
        signInErr?.message ?? 'Account created but sign-in failed.',
      );
    }
    return {
      accessToken: session.session.access_token,
      refreshToken: session.session.refresh_token,
    };
  }

  /**
   * Sign in with a username + password. Supabase only signs in by email/phone, so
   * we resolve the email SERVER-SIDE (service role) and never expose it. Returns a
   * generic 401 for any failure to avoid username/password enumeration.
   */
  async signInWithUsername(
    username: string,
    password: string,
  ): Promise<SessionTokens> {
    const handle = username.replace(/^@/, '');

    // 1) handle -> profile id
    const { data: profile } = await this.supabase.admin
      .from('profiles')
      .select('id')
      .eq('handle', handle)
      .maybeSingle<{ id: string }>();
    if (!profile) throw new UnauthorizedException('Invalid credentials');

    // 2) profile id -> email (admin only)
    const { data: userData, error: userErr } =
      await this.supabase.admin.auth.admin.getUserById(profile.id);
    const email = userData?.user?.email;
    if (userErr || !email) throw new UnauthorizedException('Invalid credentials');

    // 3) sign in as anon with the resolved email
    const { data: session, error: signInErr } =
      await this.supabase.anon.auth.signInWithPassword({ email, password });
    if (signInErr || !session?.session) {
      // Surface the confirmation gate distinctly so users aren't told "wrong
      // password" when the real issue is an unconfirmed email.
      if ((signInErr as { code?: string } | null)?.code === 'email_not_confirmed') {
        throw new ForbiddenException(
          'Email not confirmed. Please confirm your email before signing in.',
        );
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      accessToken: session.session.access_token,
      refreshToken: session.session.refresh_token,
    };
  }

  /** Public handle-availability check (used by the signup screen). */
  checkHandle(handle: string): Promise<HandleAvailability> {
    return this.profiles.checkHandle(handle);
  }
}
