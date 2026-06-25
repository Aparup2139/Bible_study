import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type {
  DirectUploadResult,
  GoLiveResult,
  Paginated,
  StreamRecording,
  StreamSummary,
} from '@bibleway/shared-types';
import { SupabaseAuthGuard, type AuthUser } from '../auth/auth.guard';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { StreamsService, type WebhookBody } from './streams.service';
import { CloudflareStreamService } from './cloudflare-stream.service';
import { CreateStreamDto, CreateUploadDto, StreamPageQueryDto } from './dto/streams.dto';

@Controller('streams')
export class StreamsController {
  constructor(
    private readonly streams: StreamsService,
    private readonly cf: CloudflareStreamService,
  ) {}

  /** Go live: creates a Cloudflare live input; returns the RTMPS url + key to the host only. */
  @Post()
  @UseGuards(SupabaseAuthGuard)
  goLive(@Body() dto: CreateStreamDto, @CurrentUser() user: AuthUser): Promise<GoLiveResult> {
    return this.streams.goLive(user.id, dto);
  }

  /** Mint a one-time direct-creator upload URL (client uploads a VOD without our token). */
  @Post('uploads')
  @UseGuards(SupabaseAuthGuard)
  upload(@Body() dto: CreateUploadDto): Promise<DirectUploadResult> {
    return this.streams.createUpload(dto.maxDurationSeconds);
  }

  /** Live feed (cursor-paginated, cached-friendly). */
  @Get()
  @UseGuards(OptionalAuthGuard)
  list(@Query() q: StreamPageQueryDto): Promise<Paginated<StreamSummary>> {
    return this.streams.listLive(q.cursor);
  }

  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  detail(@Param('id') id: string): Promise<StreamSummary> {
    return this.streams.getStream(id);
  }

  @Post(':id/end')
  @UseGuards(SupabaseAuthGuard)
  async end(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.streams.endStream(id, user.id);
    return { id, status: 'ended' as const };
  }

  @Get(':id/recordings')
  @UseGuards(OptionalAuthGuard)
  recordings(@Param('id') id: string): Promise<StreamRecording[]> {
    return this.streams.listRecordings(id);
  }

  /**
   * Cloudflare Stream webhook endpoint.
   * - Video-ready events are signature-verified over the RAW body (requires the API
   *   bootstrap to enable rawBody; see note in CloudflareStream.md §5.4).
   * - Live-input notifications are not signed by Cloudflare; processed best-effort.
   */
  @Post('webhook')
  async webhook(@Req() req: FastifyRequest, @Body() body: WebhookBody) {
    const eventType = body.data?.event_type ?? body.eventType;
    if (eventType && eventType.startsWith('live_input.')) {
      await this.streams.handleLiveEvent(eventType, body);
      return { ok: true };
    }
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
    const signature = req.headers['webhook-signature'] as string | undefined;
    if (!rawBody || !this.cf.verifyWebhook(rawBody.toString('utf8'), signature)) {
      throw new UnauthorizedException('Invalid or unverifiable webhook signature');
    }
    await this.streams.handleVideoWebhook(body);
    return { ok: true };
  }
}
