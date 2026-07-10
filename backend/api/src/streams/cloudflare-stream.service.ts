import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, createSign, timingSafeEqual } from 'node:crypto';
import type { Env } from '../config/env';

/**
 * Thin wrapper over the Cloudflare Stream REST API (uses the built-in fetch — no
 * SDK, no extra dependencies). Token-signing + webhook verification use node:crypto.
 *
 * Degrades gracefully: methods throw 503 only when CALLED without configuration, so
 * the API boots fine and no other feature is affected when Cloudflare is unset.
 */
@Injectable()
export class CloudflareStreamService {
  private readonly logger = new Logger(CloudflareStreamService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  get isConfigured(): boolean {
    return Boolean(
      this.config.get('CLOUDFLARE_ACCOUNT_ID', { infer: true }) &&
        this.config.get('CLOUDFLARE_STREAM_API_TOKEN', { infer: true }),
    );
  }

  get customerCode(): string {
    return this.config.get('CLOUDFLARE_STREAM_CUSTOMER_CODE', { infer: true }) ?? '';
  }

  private cfg<K extends keyof Env>(key: K): string {
    const value = this.config.get(key, { infer: true }) as string | undefined;
    if (!value) {
      throw new ServiceUnavailableException(
        'Cloudflare Stream is not configured. Set CLOUDFLARE_* in the backend .env.',
      );
    }
    return value;
  }

  private get base(): string {
    return `https://api.cloudflare.com/client/v4/accounts/${this.cfg('CLOUDFLARE_ACCOUNT_ID')}/stream`;
  }

  private async api<T>(
    path: string,
    init?: { method?: string; body?: string; headers?: Record<string, string> },
  ): Promise<T> {
    const token = this.cfg('CLOUDFLARE_STREAM_API_TOKEN');
    try {
      const res = await fetch(`${this.base}${path}`, {
        method: init?.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(init?.headers ?? {}),
        },
        body: init?.body,
      });
      const json = (await res.json().catch(() => undefined)) as
        | { success?: boolean; result?: T; errors?: unknown }
        | undefined;
      if (!res.ok || !json?.success) {
        this.logger.error(
          `Cloudflare Stream ${res.status}: ${JSON.stringify(json?.errors ?? '').slice(0, 400)}`,
        );
        throw new BadGatewayException('Cloudflare Stream returned an error.');
      }
      return json.result as T;
    } catch (err) {
      if (err instanceof BadGatewayException || err instanceof ServiceUnavailableException) throw err;
      this.logger.error(`Cloudflare Stream request failed: ${(err as Error).message}`);
      throw new BadGatewayException('Could not reach Cloudflare Stream.');
    }
  }

  // ===== Live ================================================================

  /**
   * Create a persistent live input for broadcasting.
   *
   * `recording.mode` is 'off': live delivery (HLS) works without any storage
   * quota, whereas auto-recording each broadcast to VOD reserves paid storage
   * minutes. Switch this to 'automatic' once a Cloudflare Stream storage plan is
   * active if you want recordings.
   */
  createLiveInput(name: string, requireSigned: boolean): Promise<CfLiveInput> {
    return this.api<CfLiveInput>('/live_inputs', {
      method: 'POST',
      body: JSON.stringify({
        meta: { name },
        recording: { mode: 'off', requireSignedURLs: requireSigned, timeoutSeconds: 0 },
      }),
    });
  }

  /** Best-effort disable of a live input when a host ends a stream. */
  async disableLiveInput(liveInputId: string): Promise<void> {
    await this.api(`/live_inputs/${liveInputId}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled: false }),
    }).catch(() => undefined);
  }

  /** List the videos/recordings produced by a live input. */
  listLiveInputVideos(liveInputId: string): Promise<CfVideo[]> {
    return this.api<CfVideo[]>(`/live_inputs/${liveInputId}/videos`);
  }

  /** One-time direct-creator upload URL (client uploads a VOD without our token). */
  createDirectUpload(maxDurationSeconds: number, requireSigned: boolean): Promise<CfDirectUpload> {
    return this.api<CfDirectUpload>('/direct_upload', {
      method: 'POST',
      body: JSON.stringify({ maxDurationSeconds, requireSignedURLs: requireSigned }),
    });
  }

  // ===== Token-free customer-subdomain reads (no API token) ==================

  async getLiveViewers(liveInputId: string): Promise<number> {
    const code = this.customerCode;
    if (!code) return 0;
    try {
      const res = await fetch(`https://customer-${code}.cloudflarestream.com/${liveInputId}/views`);
      if (!res.ok) return 0;
      const json = (await res.json()) as { liveViewers?: number };
      return json.liveViewers ?? 0;
    } catch {
      return 0;
    }
  }

  async getLiveStatus(liveInputId: string): Promise<{ live: boolean; videoUID?: string }> {
    const code = this.customerCode;
    if (!code) return { live: false };
    try {
      const res = await fetch(`https://customer-${code}.cloudflarestream.com/${liveInputId}/lifecycle`);
      if (!res.ok) return { live: false };
      const json = (await res.json()) as { live?: boolean; videoUID?: string };
      return { live: Boolean(json.live), videoUID: json.videoUID };
    } catch {
      return { live: false };
    }
  }

  // ===== Playback URL + signing =============================================

  /** HLS manifest URL; embeds a signed token in place of the uid when `signed`. */
  hlsUrl(uid: string, signed: boolean): string {
    const idOrToken = signed ? this.signToken(uid) : uid;
    return `https://customer-${this.customerCode}.cloudflarestream.com/${idOrToken}/manifest/video.m3u8`;
  }

  /** Sign a short-lived RS256 playback JWT for a private video (node:crypto). */
  signToken(videoUid: string, ttlSeconds = 3600): string {
    const kid = this.cfg('CLOUDFLARE_STREAM_KEY_ID');
    const pem = Buffer.from(this.cfg('CLOUDFLARE_STREAM_KEY_PEM'), 'base64').toString('utf8');
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', kid }));
    const payload = b64url(JSON.stringify({ sub: videoUid, kid, exp: now + ttlSeconds, nbf: now - 30 }));
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${payload}`);
    signer.end();
    const sig = signer.sign(pem).toString('base64url');
    return `${header}.${payload}.${sig}`;
  }

  /** Verify a Cloudflare Stream webhook `Webhook-Signature: time=..,sig1=..` header. */
  verifyWebhook(rawBody: string, signatureHeader: string | undefined): boolean {
    const secret = this.config.get('CLOUDFLARE_STREAM_WEBHOOK_SECRET', { infer: true });
    if (!secret || !signatureHeader) return false;
    const parts = Object.fromEntries(
      signatureHeader.split(',').map((kv) => kv.split('=') as [string, string]),
    );
    const time = parts.time;
    const sig1 = parts.sig1;
    if (!time || !sig1) return false;
    const expected = createHmac('sha256', secret).update(`${time}.${rawBody}`).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(sig1);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

function b64url(s: string): string {
  return Buffer.from(s).toString('base64url');
}

export interface CfLiveInput {
  uid: string;
  rtmps?: { url: string; streamKey: string };
  srt?: { url: string; streamId: string; passphrase: string };
}
export interface CfVideo {
  uid: string;
  readyToStream?: boolean;
  status?: { state?: string };
  duration?: number;
  created?: string;
}
export interface CfDirectUpload {
  uploadURL: string;
  uid: string;
}
