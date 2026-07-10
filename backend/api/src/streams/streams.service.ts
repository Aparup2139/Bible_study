import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type {
  CreateStreamInput,
  DirectUploadResult,
  GoLiveResult,
  Paginated,
  RtcTokenResult,
  StreamRecording,
  StreamSummary,
} from '@bibleway/shared-types';
import { SupabaseService } from '../supabase/supabase.service';
import { CloudflareStreamService } from './cloudflare-stream.service';
import { AgoraService } from './agora.service';

/** Host uid inside every Agora channel; viewers join with wildcard uid 0. */
const HOST_UID = 1;
const AUDIENCE_UID = 0;

const PAGE_SIZE = 20;

interface StreamRow {
  id: string;
  host_id: string;
  title: string;
  subtitle: string;
  denomination_id: string | null;
  cf_live_input_id: string | null;
  cf_video_uid: string | null;
  customer_code: string;
  require_signed: boolean;
  status: 'idle' | 'live' | 'ended';
  viewer_count: number;
  is_public: boolean;
  started_at: string | null;
  ended_at: string | null;
  recording_uid: string | null;
  recording_ready: boolean;
  created_at: string;
}

/** Shape of the Cloudflare Stream webhook / live-notification payloads we handle. */
export interface WebhookBody {
  uid?: string;
  readyToStream?: boolean;
  status?: { state?: string };
  eventType?: string;
  input_id?: string;
  data?: { event_type?: string; input_id?: string; live_input_id?: string };
}

@Injectable()
export class StreamsService {
  private readonly logger = new Logger(StreamsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly cf: CloudflareStreamService,
    private readonly agora: AgoraService,
  ) {}

  /**
   * Host goes live: persist the row (already 'live' — the host joins the Agora
   * channel immediately after) and return the channel + publisher token. The
   * channel name is the row's uuid, so no extra column is needed.
   */
  async goLive(hostId: string, input: CreateStreamInput): Promise<GoLiveResult> {
    // Fail before inserting so an unconfigured server never creates orphan rows.
    const appId = this.agora.appId;
    const isPublic = input.isPublic !== false;

    const { data, error } = await this.supabase.admin
      .from('live_streams')
      .insert({
        host_id: hostId,
        title: input.title,
        subtitle: input.subtitle ?? '',
        denomination_id: input.denominationId ?? null,
        cf_live_input_id: null,
        customer_code: '',
        require_signed: !isPublic,
        is_public: isPublic,
        status: 'live',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    const inserted = data as { id: string } | null;
    if (error || !inserted) throw new BadRequestException(error?.message ?? 'Failed to create stream');

    const t = this.agora.buildRtcToken(inserted.id, HOST_UID, 'publisher');
    return {
      streamId: inserted.id,
      channel: inserted.id,
      uid: HOST_UID,
      token: t.token,
      appId,
      expiresAt: t.expiresAt,
    };
  }

  /** RTC token for a stream's channel. Publisher for the host, subscriber otherwise. */
  async getRtcToken(id: string, userId: string): Promise<RtcTokenResult> {
    const row = await this.findRow(id);
    if (row.status === 'ended') throw new BadRequestException('Stream has ended');
    const isHost = row.host_id === userId;
    const role = isHost ? ('publisher' as const) : ('subscriber' as const);
    const uid = isHost ? HOST_UID : AUDIENCE_UID;
    const t = this.agora.buildRtcToken(row.id, uid, role);
    return {
      channel: row.id,
      uid,
      token: t.token,
      appId: this.agora.appId,
      expiresAt: t.expiresAt,
      role,
    };
  }

  /** Viewer joined/left: atomic counter bump via SQL RPC (clamped at 0, live rows only). */
  async bumpViewers(id: string, delta: 1 | -1): Promise<{ viewerCount: number }> {
    const { data, error } = await this.supabase.admin.rpc('bump_viewer_count', {
      stream_id: id,
      delta,
    });
    if (error) throw new BadRequestException(error.message);
    return { viewerCount: (data as number | null) ?? 0 };
  }

  /** Safety net: auto-end streams whose host crashed without calling /end. */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async sweepStaleStreams(): Promise<void> {
    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { error } = await this.supabase.admin
      .from('live_streams')
      .update({ status: 'ended', ended_at: new Date().toISOString(), viewer_count: 0 })
      .eq('status', 'live')
      .lt('started_at', cutoff);
    if (error) this.logger.warn(`Stale-stream sweep failed: ${error.message}`);
  }

  /** Live feed — cursor-paginated DB read (no per-row network calls; rule #4). */
  async listLive(cursor?: string): Promise<Paginated<StreamSummary>> {
    let query = this.supabase.admin
      .from('live_streams')
      .select('*')
      .eq('status', 'live')
      .order('started_at', { ascending: false })
      .order('id', { ascending: true })
      .limit(PAGE_SIZE + 1);

    const c = decodeCursor<{ s: string; i: string }>(cursor);
    if (c) query = query.or(`started_at.lt.${c.s},and(started_at.eq.${c.s},id.gt.${c.i})`);

    const { data, error } = await query.returns<StreamRow[]>();
    if (error) throw new BadRequestException(error.message);

    const rows = data ?? [];
    const hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map((r) => this.toSummary(r)),
      nextCursor: hasMore && last ? encodeCursor({ s: last.started_at ?? '', i: last.id }) : null,
    };
  }

  /**
   * Detail — asks Cloudflare's lifecycle endpoint whether the live input is
   * currently broadcasting, so the app detects "live" by polling this route
   * (no webhook / public tunnel required for local demos). When live, it exposes
   * the HLS URL + refreshes the viewer count, and flips the DB row to 'live' so
   * the feed reflects it too.
   */
  async getStream(id: string): Promise<StreamSummary> {
    const row = await this.findRow(id);
    const summary = this.toSummary(row);
    if (row.cf_live_input_id) {
      const status = await this.cf.getLiveStatus(row.cf_live_input_id);
      if (status.live) {
        summary.status = 'live';
        summary.playbackUrl = this.cf.hlsUrl(row.cf_live_input_id, row.require_signed);
        summary.viewerCount = await this.cf.getLiveViewers(row.cf_live_input_id);
        if (row.status !== 'live') {
          await this.supabase.admin
            .from('live_streams')
            .update({
              status: 'live',
              started_at: row.started_at ?? new Date().toISOString(),
              cf_video_uid: status.videoUID ?? null,
            })
            .eq('id', id);
        }
      }
    }
    return summary;
  }

  async endStream(id: string, hostId: string): Promise<void> {
    const row = await this.findRow(id);
    if (row.host_id !== hostId) throw new ForbiddenException('Not your stream');
    if (row.cf_live_input_id) await this.cf.disableLiveInput(row.cf_live_input_id);
    const { error } = await this.supabase.admin
      .from('live_streams')
      .update({ status: 'ended', ended_at: new Date().toISOString(), viewer_count: 0 })
      .eq('id', id);
    if (error) throw new BadRequestException(error.message);
  }

  async listRecordings(id: string): Promise<StreamRecording[]> {
    const row = await this.findRow(id);
    if (!row.cf_live_input_id) return [];
    const videos = await this.cf.listLiveInputVideos(row.cf_live_input_id);
    return videos.map((v) => {
      const state = v.status?.state;
      const ready = state === 'ready';
      return {
        uid: v.uid,
        status: ready ? 'ready' : state === 'error' ? 'error' : 'inprogress',
        playbackUrl: ready ? this.cf.hlsUrl(v.uid, row.require_signed) : null,
        createdAt: v.created ?? null,
        durationSeconds: typeof v.duration === 'number' ? v.duration : null,
      };
    });
  }

  async createUpload(maxDurationSeconds: number): Promise<DirectUploadResult> {
    const r = await this.cf.createDirectUpload(maxDurationSeconds, false);
    return { uploadUrl: r.uploadURL, uid: r.uid, playbackUrl: this.cf.hlsUrl(r.uid, false) };
  }

  // ===== Webhook handlers ====================================================

  /** Live-input notifications (unsigned): flip status on connect/disconnect. */
  async handleLiveEvent(eventType: string, body: WebhookBody): Promise<void> {
    const inputId = body.data?.input_id ?? body.data?.live_input_id ?? body.input_id;
    if (!inputId) return;
    if (eventType === 'live_input.connected') {
      const { data } = await this.supabase.admin
        .from('live_streams')
        .select('id, status')
        .eq('cf_live_input_id', inputId)
        .maybeSingle();
      const found = data as { id: string; status: string } | null;
      if (found && found.status !== 'live') {
        const st = await this.cf.getLiveStatus(inputId);
        await this.supabase.admin
          .from('live_streams')
          .update({ status: 'live', started_at: new Date().toISOString(), cf_video_uid: st.videoUID ?? null })
          .eq('id', found.id);
      }
    } else if (eventType === 'live_input.disconnected') {
      await this.supabase.admin
        .from('live_streams')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('cf_live_input_id', inputId)
        .neq('status', 'ended');
    }
  }

  /** Video-ready webhook (signature-verified upstream): mark the recording ready. */
  async handleVideoWebhook(body: WebhookBody): Promise<void> {
    const uid = body.uid;
    const ready = body.readyToStream === true || body.status?.state === 'ready';
    if (uid && ready) {
      await this.supabase.admin
        .from('live_streams')
        .update({ recording_uid: uid, recording_ready: true })
        .eq('cf_video_uid', uid);
    }
  }

  // ===== helpers =============================================================

  private async findRow(id: string): Promise<StreamRow> {
    const { data, error } = await this.supabase.admin
      .from('live_streams')
      .select('*')
      .eq('id', id)
      .single();
    const row = data as StreamRow | null;
    if (error || !row) throw new NotFoundException('Stream not found');
    return row;
  }

  /** Pure mapper — no network. Feed-safe. */
  private toSummary(r: StreamRow): StreamSummary {
    let playbackUrl: string | null = null;
    if (r.status === 'live' && r.cf_live_input_id) {
      playbackUrl = this.cf.hlsUrl(r.cf_live_input_id, r.require_signed);
    } else if (r.recording_ready && r.recording_uid) {
      playbackUrl = this.cf.hlsUrl(r.recording_uid, r.require_signed);
    }
    return {
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      hostId: r.host_id,
      status: r.status,
      isPublic: r.is_public,
      denomination: r.denomination_id,
      startedAt: r.started_at,
      viewerCount: r.viewer_count,
      playbackUrl,
    };
  }
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
