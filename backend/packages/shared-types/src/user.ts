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

// Fields a user is allowed to change on their own profile.
// avatarPath is the Storage object path, not a URL. The server resolves it to
// UserProfile.avatarUri (a CDN URL) on read. Privileged fields (subscriberCount,
// isVerified) are intentionally excluded and are also blocked at the database layer.
export interface UpdateProfileInput {
  displayName?: string;
  handle?: string;
  bio?: string;
  avatarPath?: string | null;
  denominationId?: string | null;
}

// Response for the handle-availability check used by the edit screen.
export interface HandleAvailability {
  handle: string;
  available: boolean;
}
