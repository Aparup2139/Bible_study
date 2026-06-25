import { Module } from '@nestjs/common';
import { StreamsController } from './streams.controller';
import { StreamsService } from './streams.service';
import { CloudflareStreamService } from './cloudflare-stream.service';

@Module({
  controllers: [StreamsController],
  providers: [StreamsService, CloudflareStreamService],
  exports: [StreamsService],
})
export class StreamsModule {}
