import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { RedisCache } from './redis-cache.service';
import { WEBHOOK_QUEUE } from '../../queue/queue.constants';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: WEBHOOK_QUEUE })],
  providers: [RedisCache],
  exports: [RedisCache],
})
export class CacheModule {}
