import { Module } from '@nestjs/common';
import { FeaturedVideosController } from './featured-videos.controller';
import { FeaturedVideosService } from './featured-videos.service';

@Module({
  controllers: [FeaturedVideosController],
  providers: [FeaturedVideosService],
})
export class FeaturedVideosModule {}
