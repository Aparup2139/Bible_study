import { Module } from '@nestjs/common';
import { LiveHostController } from './live-host.controller';

@Module({
  controllers: [LiveHostController],
})
export class LiveHostModule {}
