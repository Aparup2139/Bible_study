import { Module } from '@nestjs/common';
import { StreamsModule } from '../streams/streams.module';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [StreamsModule], // reuses AgoraService — no second Agora integration
  controllers: [RoomsController],
  providers: [RoomsService],
})
export class RoomsModule {}
