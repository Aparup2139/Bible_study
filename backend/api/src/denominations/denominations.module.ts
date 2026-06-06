import { Module } from '@nestjs/common';
import { DenominationsController } from './denominations.controller';
import { DenominationsService } from './denominations.service';

@Module({
  controllers: [DenominationsController],
  providers: [DenominationsService],
  exports: [DenominationsService],
})
export class DenominationsModule {}
