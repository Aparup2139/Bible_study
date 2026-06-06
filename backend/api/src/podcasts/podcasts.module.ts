import { Module } from '@nestjs/common';
import { PodcastsController } from './podcasts.controller';
import { PodcastsService } from './podcasts.service';

@Module({
  controllers: [PodcastsController],
  providers: [PodcastsService],
  exports: [PodcastsService],
})
export class PodcastsModule {}
