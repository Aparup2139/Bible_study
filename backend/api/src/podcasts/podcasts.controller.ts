import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  Paginated,
  PodcastCategory,
  PodcastChannel,
  PodcastEpisode,
} from '@bibleway/shared-types';
import { SupabaseAuthGuard, type AuthUser } from '../auth/auth.guard';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PodcastsService } from './podcasts.service';
import {
  CreateEpisodeDto,
  CreateUploadDto,
  EpisodesQueryDto,
  PageQueryDto,
  UpdateProgressDto,
} from './dto/podcasts.dto';

@Controller('podcasts')
export class PodcastsController {
  constructor(private readonly podcasts: PodcastsService) {}

  // ---- Catalog (optional auth: enriches per-user state when logged in) ----

  @Get('categories')
  @Header('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400')
  categories(): Promise<PodcastCategory[]> {
    return this.podcasts.listCategories();
  }

  @Get('channels')
  @UseGuards(OptionalAuthGuard)
  channels(
    @Query() q: PageQueryDto,
    @CurrentUser() user?: AuthUser,
  ): Promise<Paginated<PodcastChannel>> {
    return this.podcasts.listChannels(user?.id ?? null, q.cursor);
  }

  @Get('episodes')
  @UseGuards(OptionalAuthGuard)
  episodes(
    @Query() q: EpisodesQueryDto,
    @CurrentUser() user?: AuthUser,
  ): Promise<Paginated<PodcastEpisode>> {
    return this.podcasts.listEpisodes(user?.id ?? null, {
      cursor: q.cursor,
      channelId: q.channelId,
    });
  }

  // ---- Upload / post a new episode (auth required) ------------------------

  /** Step 1: get a signed URL to upload the audio directly to Supabase Storage. */
  @Post('uploads')
  @UseGuards(SupabaseAuthGuard)
  createUpload(@Body() dto: CreateUploadDto, @CurrentUser() _user: AuthUser) {
    return this.podcasts.createUploadUrl(dto.channelId, dto.contentType);
  }

  /** Step 2: create the episode row once the audio has been uploaded. */
  @Post('episodes')
  @UseGuards(SupabaseAuthGuard)
  createEpisode(
    @Body() dto: CreateEpisodeDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PodcastEpisode> {
    return this.podcasts.createEpisode(user.id, {
      episodeId: dto.episodeId,
      channelId: dto.channelId,
      title: dto.title,
      contentType: dto.contentType,
      durationSeconds: dto.durationSeconds,
    });
  }

  // ---- Per-user (auth required) -------------------------------------------

  @Get('downloads')
  @UseGuards(SupabaseAuthGuard)
  downloads(@CurrentUser() user: AuthUser): Promise<PodcastEpisode[]> {
    return this.podcasts.listSaved(user.id);
  }

  @Post('channels/:id/subscribe')
  @UseGuards(SupabaseAuthGuard)
  async subscribe(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.podcasts.setSubscribed(user.id, id, true);
    return { channelId: id, subscribed: true };
  }

  @Delete('channels/:id/subscribe')
  @UseGuards(SupabaseAuthGuard)
  async unsubscribe(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.podcasts.setSubscribed(user.id, id, false);
    return { channelId: id, subscribed: false };
  }

  @Post('episodes/:id/save')
  @UseGuards(SupabaseAuthGuard)
  async save(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.podcasts.setSaved(user.id, id, true);
    return { episodeId: id, saved: true };
  }

  @Delete('episodes/:id/save')
  @UseGuards(SupabaseAuthGuard)
  async unsave(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.podcasts.setSaved(user.id, id, false);
    return { episodeId: id, saved: false };
  }

  @Put('episodes/:id/progress')
  @UseGuards(SupabaseAuthGuard)
  async progress(
    @Param('id') id: string,
    @Body() dto: UpdateProgressDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.podcasts.saveProgress(user.id, id, dto.positionSeconds);
    return { episodeId: id, positionSeconds: dto.positionSeconds };
  }
}
