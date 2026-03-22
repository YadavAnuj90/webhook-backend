import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthCheck, HealthCheckService, MongooseHealthIndicator, MemoryHealthIndicator } from '@nestjs/terminus';

@ApiTags('Observability')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private mongoose: MongooseHealthIndicator,
    private memory: MemoryHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Full health check — MongoDB ping + memory heap' })
  @ApiResponse({ status: 200, description: 'All systems healthy' })
  @ApiResponse({ status: 503, description: 'One or more services degraded — check status field for details' })
  check() {
    return this.health.check([
      () => this.mongoose.pingCheck('mongodb'),
      () => this.memory.checkHeap('memory_heap', 500 * 1024 * 1024),
    ]);
  }

  @Get('liveness')
  @ApiOperation({ summary: 'Kubernetes liveness probe — always returns 200 if process is alive' })
  @ApiResponse({ status: 200, description: 'Process alive — { status: "ok", timestamp: "..." }' })
  liveness() { return { status: 'ok', timestamp: new Date().toISOString() }; }

  @Get('readiness')
  @HealthCheck()
  @ApiOperation({ summary: 'Kubernetes readiness probe — checks MongoDB connection' })
  @ApiResponse({ status: 200, description: 'Ready to receive traffic' })
  @ApiResponse({ status: 503, description: 'Not ready — MongoDB connection issue' })
  readiness() {
    return this.health.check([() => this.mongoose.pingCheck('mongodb')]);
  }
}
