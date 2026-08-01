import { Module } from '@nestjs/common';
import { StreamsController } from './streams.controller';
import { StreamsService } from './streams.service';
import { CloudflareStreamService } from './cloudflare-stream.service';
import { AgoraService } from './agora.service';

@Module({
  controllers: [StreamsController],
  providers: [StreamsService, CloudflareStreamService, AgoraService],
  exports: [StreamsService, AgoraService],
})
export class StreamsModule {}
