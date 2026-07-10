/**
 * Cloudflare Stream — VOD upload (Phase 4).
 *
 * Three steps behind one mutation:
 *   1. Ask our API for a one-time direct-creator upload URL (POST /streams/uploads).
 *      The Cloudflare API token never touches the client; the API returns the
 *      short-lived uploadUrl + the video uid + the eventual HLS playbackUrl.
 *   2. POST the picked video file straight to Cloudflare's uploadUrl as
 *      multipart/form-data (field name `file`) — not through our backend.
 *   3. Cloudflare transcodes; the caller polls `playbackUrl` until it 200s
 *      (see `waitForPlayable`) before handing it to the player.
 */
import { useMutation } from '@tanstack/react-query';
import { api } from '../services/api';

export interface UploadVideoInput {
  /** Local file URI from the document picker. */
  uri: string;
  /** File name (used as the multipart filename). */
  name: string;
  /** Video MIME type, e.g. "video/mp4". */
  contentType: string;
}

export interface UploadVideoResult {
  uid: string;
  playbackUrl: string;
}

interface DirectUploadResponse {
  uploadUrl: string;
  uid: string;
  playbackUrl: string;
}

export function useUploadVideo() {
  return useMutation({
    mutationFn: async ({ uri, name, contentType }: UploadVideoInput): Promise<UploadVideoResult> => {
      // 1. One-time upload target (max 1h clip is plenty for a demo).
      const { uploadUrl, uid, playbackUrl } = await api.post<DirectUploadResponse>(
        '/streams/uploads',
        { maxDurationSeconds: 3600 },
      );

      // 2. Upload the bytes directly to Cloudflare. React Native's fetch accepts a
      //    { uri, name, type } file part in FormData; do NOT set Content-Type by
      //    hand — the runtime adds the multipart boundary.
      const form = new FormData();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      form.append('file', { uri, name, type: contentType } as any);
      const res = await fetch(uploadUrl, { method: 'POST', body: form });
      if (!res.ok) {
        throw new Error(`Upload to Cloudflare failed (${res.status})`);
      }

      return { uid, playbackUrl };
    },
  });
}

/**
 * Poll the HLS manifest until Cloudflare has finished processing (it 404s until
 * the video is `ready`, then 200s). Returns true once playable, false on timeout.
 */
export async function waitForPlayable(
  playbackUrl: string,
  { timeoutMs = 120_000, intervalMs = 3_000 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(playbackUrl, { method: 'GET' });
      if (res.ok) return true;
    } catch {
      // network blip — keep polling
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
