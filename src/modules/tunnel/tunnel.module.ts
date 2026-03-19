import { Module } from '@nestjs/common';
import { TunnelService } from './tunnel.service';
import { TunnelController } from './tunnel.controller';

@Module({
  controllers: [TunnelController],
  providers: [TunnelService],
  exports: [TunnelService],
})
export class TunnelModule {}
