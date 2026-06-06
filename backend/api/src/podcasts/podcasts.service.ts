import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type {
  Paginated,
  PodcastCategory,
  PodcastChannel,
  PodcastEpisode,
} from '@bibleway/shared-types';
import { SupabaseService } from '../supabase/supabase.service';
import { RedisService } from '../redis/redis.service';

const PAGE_SIZE = 20;
const AUDIO_BUCKET = 'podcast-audio';
const PROGRESS_KEY_PREFIX = 'pp:'; // pp:<userId> -> hash{ episodeId: "seconds:ts" }

interface CategoryRow {
  id: string;
  name: string;
  icon: string;
  show_count: number;
}
interface ChannelRow {
  id: string;
  name: string;
  avatar_emoji: string;
  episode_count: number;
  subscriber_count: number;
  created_at: string;
}
interface EpisodeRow {
  id: string;
  channel_id: string;
  title: string;
  duration_seconds: number;
  published_at: string;
  audio_path: string;
  channel: { name: string } | { name: string }[] | null;
}

@Injectable()
export class PodcastsService {
  private readonly logger = new Logger(PodcastsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly redis: RedisService,
  ) {}

  // ===== Categories (cached reference data) =================================
  async listCategories(): Promise<PodcastCategory[]> {
    const { data, error } = await this.supabase.admin
      .from('podcast_categories')
      .select('id, name, icon, show_count')
      .order('sort_order', { ascending: true })
      .returns<CategoryRow[]>();
    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      icon: r.icon,
      showCount: r.show_count,
    }));
  }

  // ===== Channels (cursor-paginated, enriched with isSubscribed) ============
  async listChannels(
    userId: string | null,
    cursor?: string,
  ): Promise<Paginated<PodcastChannel>> {
    let query = this.supabase.admin
      .from('podcast_channels')
      .select('id, name, avatar_emoji, episode_count, subscriber_count, created_at')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PAGE_SIZE + 1);

    const c = decodeCursor<{ c: string; i: string }>(cursor);
    if (c) {
      query = query.or(
        `created_at.gt.${c.c},and(created_at.eq.${c.c},id.gt.${c.i})`,
      );
    }

    const { data, error } = await query.returns<ChannelRow[]>();
    if (error) throw new BadRequestException(error.message);

    const rows = data ?? [];
    const hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

    const subscribed = await this.subscribedSet(
      userId,
      page.map((r) => r.id),
    );

    const items: PodcastChannel[] = page.map((r) => ({
      id: r.id,
      name: r.name,
      avatarEmoji: r.avatar_emoji,
      episodeCount: r.episode_count,
      subscriberCount: r.subscriber_count,
      isSubscribed: subscribed.has(r.id),
    }));

    const last = page[page.length - 1];
    return {
      items,
      nextCursor: hasMore && last ? encodeCursor({ c: last.created_at, i: last.id }) : null,
    };
  }

  // ===== Episodes (cursor-paginated, enriched per-user) =====================
  async listEpisodes(
    userId: string | null,
    opts: { cursor?: string; channelId?: string },
  ): Promise<Paginated<PodcastEpisode>> {
    let query = this.supabase.admin
      .from('podcast_episodes')
      .select(
        'id, channel_id, title, duration_seconds, published_at, audio_path, channel:podcast_channels(name)',
      )
      .order('published_at', { ascending: false })
      .order('id', { ascending: true })
      .limit(PAGE_SIZE + 1);

    if (opts.channelId) query = query.eq('channel_id', opts.channelId);

    const c = decodeCursor<{ p: string; i: string }>(opts.cursor);
    if (c) {
      query = query.or(
        `published_at.lt.${c.p},and(published_at.eq.${c.p},id.gt.${c.i})`,
      );
    }

    const { data, error } = await query.returns<EpisodeRow[]>();
    if (error) throw new BadRequestException(error.message);

    const rows = data ?? [];
    const hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const ids = page.map((r) => r.id);

    const [saved, progress] = await Promise.all([
      this.savedSet(userId, ids),
      this.progressMap(userId, ids),
    ]);

    const items: PodcastEpisode[] = page.map((r) => ({
      id: r.id,
      title: r.title,
      channelName: channelName(r.channel),
      thumbnailEmoji: '',
      durationMinutes: Math.round(r.duration_seconds / 60),
      publishedAt: r.published_at,
      audioUrl: this.audioUrl(r.audio_path),
      isDownloaded: false, // on-device concern; client overlays this
      isSaved: saved.has(r.id),
      playbackPosition: progress.get(r.id) ?? 0,
    }));

    const last = page[page.length - 1];
    return {
      items,
      nextCursor: hasMore && last ? encodeCursor({ p: last.published_at, i: last.id }) : null,
    };
  }

  /** Saved episodes for the current user (the "Saved" tab / downloads set). */
  async listSaved(userId: string): Promise<PodcastEpisode[]> {
    const { data, error } = await this.supabase.admin
      .from('saved_episodes')
      .select('episode_id, podcast_episodes(id, channel_id, title, duration_seconds, published_at, audio_path, channel:podcast_channels(name))')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .returns<{ episode_id: string; podcast_episodes: EpisodeRow | EpisodeRow[] | null }[]>();
    if (error) throw new BadRequestException(error.message);

    const episodes = (data ?? [])
      .map((r) => (Array.isArray(r.podcast_episodes) ? r.podcast_episodes[0] : r.podcast_episodes))
      .filter((e): e is EpisodeRow => Boolean(e));
    const progress = await this.progressMap(userId, episodes.map((e) => e.id));

    return episodes.map((r) => ({
      id: r.id,
      title: r.title,
      channelName: channelName(r.channel),
      thumbnailEmoji: '',
      durationMinutes: Math.round(r.duration_seconds / 60),
      publishedAt: r.published_at,
      audioUrl: this.audioUrl(r.audio_path),
      isDownloaded: false,
      isSaved: true,
      playbackPosition: progress.get(r.id) ?? 0,
    }));
  }

  // ===== Toggles ============================================================
  async setSubscribed(userId: string, channelId: string, on: boolean): Promise<void> {
    if (on) {
      const { error } = await this.supabase.admin
        .from('channel_subscriptions')
        .upsert({ user_id: userId, channel_id: channelId }, { onConflict: 'user_id,channel_id', ignoreDuplicates: true });
      if (error) throw new BadRequestException(error.message);
    } else {
      const { error } = await this.supabase.admin
        .from('channel_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('channel_id', channelId);
      if (error) throw new BadRequestException(error.message);
    }
  }

  async setSaved(userId: string, episodeId: string, on: boolean): Promise<void> {
    if (on) {
      const { error } = await this.supabase.admin
        .from('saved_episodes')
        .upsert({ user_id: userId, episode_id: episodeId }, { onConflict: 'user_id,episode_id', ignoreDuplicates: true });
      if (error) throw new BadRequestException(error.message);
    } else {
      const { error } = await this.supabase.admin
        .from('saved_episodes')
        .delete()
        .eq('user_id', userId)
        .eq('episode_id', episodeId);
      if (error) throw new BadRequestException(error.message);
    }
  }

  // ===== Playback progress (Redis-buffered, flushed to Postgres) ============
  async saveProgress(userId: string, episodeId: string, positionSeconds: number): Promise<void> {
    if (this.redis.isEnabled) {
      await this.redis.hset(
        PROGRESS_KEY_PREFIX + userId,
        episodeId,
        `${positionSeconds}:${Date.now()}`,
      );
      return;
    }
    // Fallback: write straight through.
    await this.upsertProgress([{ user_id: userId, episode_id: episodeId, position_seconds: positionSeconds }]);
  }

  /** Drain buffered progress from Redis into Postgres every 30s. */
  @Interval(30_000)
  async flushProgress(): Promise<void> {
    if (!this.redis.isEnabled) return;
    try {
      const keys = await this.redis.scanKeys(PROGRESS_KEY_PREFIX + '*');
      const rows: { user_id: string; episode_id: string; position_seconds: number }[] = [];
      for (const key of keys) {
        const userId = key.slice(PROGRESS_KEY_PREFIX.length);
        const hash = await this.redis.drainHash(key);
        for (const [episodeId, raw] of Object.entries(hash)) {
          const seconds = Number.parseInt(raw.split(':')[0] ?? '0', 10);
          if (Number.isFinite(seconds)) {
            rows.push({ user_id: userId, episode_id: episodeId, position_seconds: seconds });
          }
        }
      }
      if (rows.length > 0) {
        await this.upsertProgress(rows);
        this.logger.debug(`Flushed ${rows.length} progress rows to Postgres`);
      }
    } catch (err) {
      this.logger.error(`Progress flush failed: ${(err as Error).message}`);
    }
  }

  private async upsertProgress(
    rows: { user_id: string; episode_id: string; position_seconds: number }[],
  ): Promise<void> {
    const stamped = rows.map((r) => ({ ...r, updated_at: new Date().toISOString() }));
    const { error } = await this.supabase.admin
      .from('playback_progress')
      .upsert(stamped, { onConflict: 'user_id,episode_id' });
    if (error) throw new BadRequestException(error.message);
  }

  // ===== Enrichment helpers =================================================
  private async subscribedSet(userId: string | null, channelIds: string[]): Promise<Set<string>> {
    if (!userId || channelIds.length === 0) return new Set();
    const { data, error } = await this.supabase.admin
      .from('channel_subscriptions')
      .select('channel_id')
      .eq('user_id', userId)
      .in('channel_id', channelIds)
      .returns<{ channel_id: string }[]>();
    if (error) throw new BadRequestException(error.message);
    return new Set((data ?? []).map((r) => r.channel_id));
  }

  private async savedSet(userId: string | null, episodeIds: string[]): Promise<Set<string>> {
    if (!userId || episodeIds.length === 0) return new Set();
    const { data, error } = await this.supabase.admin
      .from('saved_episodes')
      .select('episode_id')
      .eq('user_id', userId)
      .in('episode_id', episodeIds)
      .returns<{ episode_id: string }[]>();
    if (error) throw new BadRequestException(error.message);
    return new Set((data ?? []).map((r) => r.episode_id));
  }

  /** Per-episode resume position. Prefers the pending Redis value over Postgres. */
  private async progressMap(userId: string | null, episodeIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!userId || episodeIds.length === 0) return map;

    const { data, error } = await this.supabase.admin
      .from('playback_progress')
      .select('episode_id, position_seconds')
      .eq('user_id', userId)
      .in('episode_id', episodeIds)
      .returns<{ episode_id: string; position_seconds: number }[]>();
    if (error) throw new BadRequestException(error.message);
    for (const r of data ?? []) map.set(r.episode_id, r.position_seconds);

    // Overlay any newer values still buffered in Redis.
    if (this.redis.isEnabled) {
      const pending = await this.redis.hgetall(PROGRESS_KEY_PREFIX + userId);
      for (const id of episodeIds) {
        const raw = pending[id];
        if (raw) {
          const seconds = Number.parseInt(raw.split(':')[0] ?? '0', 10);
          if (Number.isFinite(seconds)) map.set(id, seconds);
        }
      }
    }
    return map;
  }

  private audioUrl(path: string): string {
    if (!path) return '';
    const { data } = this.supabase.admin.storage.from(AUDIO_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }
}

function channelName(channel: EpisodeRow['channel']): string {
  if (!channel) return '';
  return Array.isArray(channel) ? channel[0]?.name ?? '' : channel.name;
}

function encodeCursor(obj: Record<string, string>): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function decodeCursor<T>(cursor?: string): T | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}
