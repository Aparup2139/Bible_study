import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RtcTokenBuilder, RtcRole } from 'agora-token';
import type { Env } from '../config/env';

export type RtcTokenRole = 'publisher' | 'subscriber';

/**
 * Agora RTC token minting for interactive live streaming. The channel name is
 * the `live_streams.id` uuid; the App Certificate never leaves the server.
 *
 * Degrades gracefully: methods throw 503 only when CALLED without configuration,
 * so the API boots fine and no other feature is affected when Agora is unset.
 */
@Injectable()
export class AgoraService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get isConfigured(): boolean {
    return Boolean(
      this.config.get('AGORA_APP_ID', { infer: true }) &&
        this.config.get('AGORA_APP_CERTIFICATE', { infer: true }),
    );
  }

  get appId(): string {
    return this.cfg('AGORA_APP_ID');
  }

  private cfg<K extends keyof Env>(key: K): string {
    const value = this.config.get(key, { infer: true }) as string | undefined;
    if (!value) {
      throw new ServiceUnavailableException(
        'Agora is not configured. Set AGORA_APP_ID and AGORA_APP_CERTIFICATE in the backend .env.',
      );
    }
    return value;
  }

  /**
   * Build an RTC token. Publisher = the host (fixed uid 1); subscriber tokens are
   * built with uid 0 (wildcard — each viewer gets an auto-assigned uid on join).
   */
  buildRtcToken(
    channel: string,
    uid: number,
    role: RtcTokenRole,
    ttlSeconds = 3600,
  ): { token: string; expiresAt: string } {
    const appId = this.cfg('AGORA_APP_ID');
    const certificate = this.cfg('AGORA_APP_CERTIFICATE');
    const rtcRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      certificate,
      channel,
      uid,
      rtcRole,
      ttlSeconds,
      ttlSeconds,
    );
    return { token, expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() };
  }
}
