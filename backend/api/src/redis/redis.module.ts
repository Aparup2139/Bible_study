import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/** Global so any feature module can inject RedisService. */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
