import { Controller, Get, Header } from '@nestjs/common';
import type { FeaturedVideo } from '@bibleway/shared-types';
import { FeaturedVideosService } from './featured-videos.service';

/**
 * Public content slots. No auth. Short cache so a freshly filled slot
 * appears on devices within ~5 minutes.
 */
@Controller('featured-videos')
export class FeaturedVideosController {
  constructor(private readonly featured: FeaturedVideosService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
  list(): Promise<FeaturedVideo[]> {
    return this.featured.list();
  }
}
