import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  HandleAvailability,
  UpdateProfileInput,
  UserProfile,
} from '@bibleway/shared-types';
import { SupabaseService } from '../supabase/supabase.service';

/** Shape of a row in public.profiles (snake_case, as Postgres returns it). */
interface ProfileRow {
  id: string;
  display_name: string;
  handle: string;
  bio: string;
  avatar_path: string | null;
  subscriber_count: number;
  denomination_id: string | null;
  is_verified: boolean;
  created_at: string;
}

const AVATAR_BUCKET = 'avatars';

@Injectable()
export class ProfilesService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Public: look up a profile by handle (without the leading '@'). */
  async getByHandle(handle: string): Promise<UserProfile> {
    const clean = handle.replace(/^@/, '');
    const { data, error } = await this.supabase.admin
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('handle', clean)
      .maybeSingle<ProfileRow>();

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException(`No profile for handle @${clean}`);
    return this.toUserProfile(data);
  }

  /** The authenticated user's own profile. */
  async getById(userId: string): Promise<UserProfile> {
    const { data, error } = await this.supabase.admin
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', userId)
      .maybeSingle<ProfileRow>();

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Profile not found');
    return this.toUserProfile(data);
  }

  /** Is a handle free? Used by the edit screen for live validation. */
  async checkHandle(
    handle: string,
    excludeUserId?: string,
  ): Promise<HandleAvailability> {
    const clean = handle.replace(/^@/, '');
    let query = this.supabase.admin
      .from('profiles')
      .select('id')
      .eq('handle', clean);

    // Allow the current owner to "keep" their existing handle.
    if (excludeUserId) query = query.neq('id', excludeUserId);

    const { data, error } = await query.maybeSingle<{ id: string }>();
    if (error) throw new BadRequestException(error.message);
    return { handle: clean, available: !data };
  }

  /**
   * Update the caller's own profile.
   *
   * Uses a USER-SCOPED client (RLS + the privileged-column guard trigger apply),
   * so even if a privileged field slipped through it cannot be written. The DTO
   * whitelist is the first line of defense; the DB is the last.
   */
  async updateOwn(
    userId: string,
    accessToken: string,
    input: UpdateProfileInput,
  ): Promise<UserProfile> {
    const patch = toRowPatch(input);

    if (Object.keys(patch).length === 0) {
      // Nothing to change — just return the current profile.
      return this.getById(userId);
    }

    // Pre-check handle uniqueness for a friendly 409 (the unique index is the
    // real guarantee; this just gives a nicer error than a raw constraint code).
    if (input.handle !== undefined) {
      const { available } = await this.checkHandle(input.handle, userId);
      if (!available) {
        throw new ConflictException(`Handle @${input.handle} is already taken`);
      }
    }

    const client = this.supabase.forUser(accessToken);
    const { data, error } = await client
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select(PROFILE_COLUMNS)
      .maybeSingle<ProfileRow>();

    if (error) {
      // 23505 = unique_violation (handle race).
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('Handle is already taken');
      }
      throw new BadRequestException(error.message);
    }
    if (!data) throw new NotFoundException('Profile not found');
    return this.toUserProfile(data);
  }

  /** Map a DB row to the API contract, resolving avatar_path → CDN URL. */
  private toUserProfile(row: ProfileRow): UserProfile {
    return {
      id: row.id,
      displayName: row.display_name,
      handle: `@${row.handle}`,
      bio: row.bio,
      avatarUri: this.avatarUrl(row.avatar_path),
      subscriberCount: row.subscriber_count,
      denominationId: row.denomination_id,
      isVerified: row.is_verified,
      createdAt: row.created_at,
    };
  }

  /** Resolve a storage path to its public CDN URL (bucket is public-read). */
  private avatarUrl(path: string | null): string | null {
    if (!path) return null;
    const { data } = this.supabase.admin.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(path);
    return data.publicUrl;
  }
}

const PROFILE_COLUMNS =
  'id, display_name, handle, bio, avatar_path, subscriber_count, denomination_id, is_verified, created_at';

/** Translate the camelCase API input into snake_case DB columns. */
function toRowPatch(input: UpdateProfileInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.displayName !== undefined) patch.display_name = input.displayName;
  if (input.handle !== undefined) patch.handle = input.handle.replace(/^@/, '');
  if (input.bio !== undefined) patch.bio = input.bio;
  if (input.avatarPath !== undefined) patch.avatar_path = input.avatarPath;
  if (input.denominationId !== undefined)
    patch.denomination_id = input.denominationId;
  return patch;
}
