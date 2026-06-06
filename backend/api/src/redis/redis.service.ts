import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { Env } from '../config/env';

/**
 * Thin Redis wrapper (Phase 3).
 *
 * Degrades gracefully: if REDIS_URL is unset, `isEnabled` is false and callers
 * fall back to direct Postgres. Lazy-connects so a bad/missing Redis never blocks
 * API boot or the /health probe.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    const url = this.config.get('REDIS_URL', { infer: true });
    if (!url) {
      this.logger.warn(
        'REDIS_URL not set — playback progress will write directly to Postgres (no buffering).',
      );
      return;
    }
    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
    });
    this.client.on('error', (err) =>
      this.logger.error(`Redis error: ${err.message}`),
    );
    this.client.connect().catch((err) => {
      this.logger.error(`Redis connect failed: ${err.message}`);
      this.client = null; // fall back to direct Postgres
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }

  get isEnabled(): boolean {
    return this.client !== null;
  }

  /** Raw client for callers that need it (null when disabled). */
  get raw(): Redis | null {
    return this.client;
  }

  // -- Hash helpers used by the playback-progress buffer ---------------------

  async hset(key: string, field: string, value: string): Promise<void> {
    if (!this.client) return;
    await this.client.hset(key, field, value);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.client) return {};
    return this.client.hgetall(key);
  }

  /** Atomically read-and-clear a hash (used by the flush job). */
  async drainHash(key: string): Promise<Record<string, string>> {
    if (!this.client) return {};
    const data = await this.client.hgetall(key);
    if (Object.keys(data).length > 0) {
      await this.client.del(key);
    }
    return data;
  }

  /** SCAN keys matching a pattern (avoids blocking KEYS). */
  async scanKeys(pattern: string): Promise<string[]> {
    if (!this.client) return [];
    const found: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = next;
      found.push(...batch);
    } while (cursor !== '0');
    return found;
  }
}
