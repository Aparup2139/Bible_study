// User & Profile domain types.
// Mirrors the API contract consumed by the frontend (Frontend/src/types).

export interface UserProfile {
  id: string;
  displayName: string;
  handle: string;
  bio: string;
  avatarUri: string | null;
  subscriberCount: number;
  denominationId: string | null;
  isVerified: boolean;
  createdAt: string;
}

/** Fields a user is allowed to change on their own profile. */
export type UpdateProfileInput = Partial<
  Pick<UserProfile, 'displayName' | 'handle' | 'bio' | 'avatarUri' | 'denominationId'>
>;
