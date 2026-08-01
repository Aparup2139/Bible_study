import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { JoinRoomResult, ParticipantRole, StudyRoomParticipant, StudyRoomSummary } from '@bibleway/shared-types';
import { SupabaseService } from '../supabase/supabase.service';
import { AgoraService } from '../streams/agora.service';

/** Agora assigns the actual session uid on join when the token uses this wildcard. */
const WILDCARD_UID = 0;

interface RoomRow {
  id: string;
  host_id: string;
  title: string;
  subtitle: string;
  status: 'live' | 'ended';
  speaker_count: number;
  listener_count: number;
  started_at: string;
  ended_at: string | null;
}

interface ParticipantRow {
  room_id: string;
  user_id: string;
  display_name: string;
  avatar_emoji: string;
  role: ParticipantRole;
  hand_raised: boolean;
  force_muted: boolean;
}

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly agora: AgoraService,
  ) {}

  /** Enter the singleton Study Chat room — auto-hosts if none is live. */
  async join(userId: string, displayName: string, avatarEmoji: string): Promise<JoinRoomResult> {
    const appId = this.agora.appId; // fail before touching the DB if Agora isn't configured
    const room = await this.findOrCreateLiveRoom(userId);
    const role = await this.upsertParticipant(room, userId, displayName, avatarEmoji);
    return this.mintJoinResult(room.id, role, appId);
  }

  /** Re-mint a token for the caller's CURRENT role — called after a promotion. */
  async getToken(roomId: string, userId: string): Promise<JoinRoomResult> {
    const room = await this.findRoom(roomId);
    if (room.status === 'ended') throw new BadRequestException('Room has ended');
    const participant = await this.findParticipant(roomId, userId);
    return this.mintJoinResult(roomId, participant.role, this.agora.appId);
  }

  async getRoom(roomId: string): Promise<StudyRoomSummary> {
    return this.toSummary(await this.findRoom(roomId));
  }

  async listParticipants(roomId: string): Promise<StudyRoomParticipant[]> {
    const { data, error } = await this.supabase.admin
      .from('study_room_participants')
      .select('*')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true })
      .returns<ParticipantRow[]>();
    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((p) => this.toParticipant(p));
  }

  /** Only listeners can raise a hand — speakers/host already have the mic. */
  async raiseHand(roomId: string, userId: string): Promise<void> {
    const { error } = await this.supabase.admin
      .from('study_room_participants')
      .update({ hand_raised: true })
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .eq('role', 'listener');
    if (error) throw new BadRequestException(error.message);
  }

  /** Host approves a raised hand: listener → speaker. */
  async promote(roomId: string, hostId: string, userId: string): Promise<void> {
    await this.assertHost(roomId, hostId);
    const { error } = await this.supabase.admin
      .from('study_room_participants')
      .update({ role: 'speaker', hand_raised: false })
      .eq('room_id', roomId)
      .eq('user_id', userId);
    if (error) throw new BadRequestException(error.message);
    await this.recountRoles(roomId);
  }

  /** Host force-mutes/unmutes a speaker; the speaker's client discovers this on its next poll. */
  async setForceMuted(roomId: string, hostId: string, userId: string, muted: boolean): Promise<void> {
    await this.assertHost(roomId, hostId);
    const { error } = await this.supabase.admin
      .from('study_room_participants')
      .update({ force_muted: muted })
      .eq('room_id', roomId)
      .eq('user_id', userId);
    if (error) throw new BadRequestException(error.message);
  }

  /** The host leaving ends the room — no orphaned rooms with no one in control. */
  async leave(roomId: string, userId: string): Promise<void> {
    const room = await this.findRoom(roomId);
    if (room.host_id === userId) {
      await this.end(roomId, userId);
      return;
    }
    const { error } = await this.supabase.admin
      .from('study_room_participants')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', userId);
    if (error) throw new BadRequestException(error.message);
    await this.recountRoles(roomId);
  }

  async end(roomId: string, hostId: string): Promise<void> {
    await this.assertHost(roomId, hostId);
    const { error } = await this.supabase.admin
      .from('study_rooms')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', roomId);
    if (error) throw new BadRequestException(error.message);
  }

  /** Safety net: auto-end a room whose host crashed without calling /end. */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async sweepStaleRooms(): Promise<void> {
    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { error } = await this.supabase.admin
      .from('study_rooms')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('status', 'live')
      .lt('started_at', cutoff);
    if (error) this.logger.warn(`Stale-room sweep failed: ${error.message}`);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private async findOrCreateLiveRoom(hostIdIfCreating: string): Promise<RoomRow> {
    const { data: existing, error: findErr } = await this.supabase.admin
      .from('study_rooms')
      .select('*')
      .eq('status', 'live')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findErr) throw new BadRequestException(findErr.message);
    if (existing) return existing as RoomRow;

    const { data: created, error: createErr } = await this.supabase.admin
      .from('study_rooms')
      .insert({
        host_id: hostIdIfCreating,
        title: 'Bible Study Discussion',
        subtitle: 'Understanding the Beatitudes · Matthew 5',
      })
      .select('*')
      .single();
    if (createErr || !created) throw new BadRequestException(createErr?.message ?? 'Failed to create room');
    return created as RoomRow;
  }

  /** Idempotent: a rejoining participant keeps whatever role they already had. */
  private async upsertParticipant(
    room: RoomRow,
    userId: string,
    displayName: string,
    avatarEmoji: string,
  ): Promise<ParticipantRole> {
    const existing = await this.findParticipant(room.id, userId).catch(() => null);
    if (existing) return existing.role;

    const role: ParticipantRole = room.host_id === userId ? 'host' : 'listener';
    const { error } = await this.supabase.admin
      .from('study_room_participants')
      .insert({ room_id: room.id, user_id: userId, display_name: displayName, avatar_emoji: avatarEmoji, role });
    if (error) throw new BadRequestException(error.message);
    await this.recountRoles(room.id);
    return role;
  }

  private mintJoinResult(roomId: string, role: ParticipantRole, appId: string): JoinRoomResult {
    const agoraRole = role === 'listener' ? ('subscriber' as const) : ('publisher' as const);
    const t = this.agora.buildRtcToken(roomId, WILDCARD_UID, agoraRole);
    return { roomId, channel: roomId, uid: WILDCARD_UID, token: t.token, appId, role };
  }

  /** Denormalized counts (golden rule #3) — recomputed after any role/participant change, never COUNT(*) live on read. */
  private async recountRoles(roomId: string): Promise<void> {
    const { data, error } = await this.supabase.admin
      .from('study_room_participants')
      .select('role')
      .eq('room_id', roomId)
      .returns<{ role: ParticipantRole }[]>();
    if (error) return;
    const speakerCount = (data ?? []).filter((p) => p.role === 'host' || p.role === 'speaker').length;
    const listenerCount = (data ?? []).filter((p) => p.role === 'listener').length;
    await this.supabase.admin
      .from('study_rooms')
      .update({ speaker_count: speakerCount, listener_count: listenerCount })
      .eq('id', roomId);
  }

  private async assertHost(roomId: string, userId: string): Promise<void> {
    const room = await this.findRoom(roomId);
    if (room.host_id !== userId) throw new ForbiddenException('Only the host can do that');
  }

  private async findRoom(id: string): Promise<RoomRow> {
    const { data, error } = await this.supabase.admin.from('study_rooms').select('*').eq('id', id).single();
    if (error || !data) throw new NotFoundException('Room not found');
    return data as RoomRow;
  }

  private async findParticipant(roomId: string, userId: string): Promise<ParticipantRow> {
    const { data, error } = await this.supabase.admin
      .from('study_room_participants')
      .select('*')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .single();
    if (error || !data) throw new NotFoundException('Not a participant in this room');
    return data as ParticipantRow;
  }

  private toSummary(r: RoomRow): StudyRoomSummary {
    return {
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      status: r.status,
      speakerCount: r.speaker_count,
      listenerCount: r.listener_count,
    };
  }

  private toParticipant(p: ParticipantRow): StudyRoomParticipant {
    return {
      userId: p.user_id,
      displayName: p.display_name,
      avatarEmoji: p.avatar_emoji,
      role: p.role,
      handRaised: p.hand_raised,
      forceMuted: p.force_muted,
    };
  }
}
