import { BadRequestException, Injectable } from '@nestjs/common';
import type { FeaturedVideo } from '@bibleway/shared-types';
import { SupabaseService } from '../supabase/supabase.service';

/** Row shape from public.featured_videos (snake_case). */
interface FeaturedVideoRow {
  slot: number;
  youtube_video_id: string | null;
  title: string;
}

@Injectable()
export class FeaturedVideosService {
  constructor(private readonly supabase: SupabaseService) {}

  /** The four featured slots, ordered. Empty slots come back with youtubeVideoId null. */
  async list(): Promise<FeaturedVideo[]> {
    const { data, error } = await this.supabase.admin
      .from('featured_videos')
      .select('slot, youtube_video_id, title')
      .order('slot', { ascending: true })
      .returns<FeaturedVideoRow[]>();

    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((row) => ({
      slot: row.slot,
      youtubeVideoId: row.youtube_video_id,
      title: row.title,
    }));
  }
}
