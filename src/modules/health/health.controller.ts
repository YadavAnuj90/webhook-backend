import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthCheck, HealthCheckService, MongooseHealthIndicator, MemoryHealthIndicator } from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis.health';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { SkipEmailVerification } from '../../common/guards/email-verified.guard';

@ApiTags('Observability')
@SkipThrottle()
@SkipEmailVerification()
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private mongoose: MongooseHealthIndicator,
    private memory: MemoryHealthIndicator,
    private redis: RedisHealthIndicator,
  ) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('JWT')
  @HealthCheck()
  @ApiOperation({ summary: 'Full health check — MongoDB + Redis + memory heap (admin only)' })
  @ApiResponse({ status: 200, description: 'All systems healthy — detailed connection status' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  @ApiResponse({ status: 503, description: 'One or more services degraded' })
  check() {
    return this.health.check([
      () => this.mongoose.pingCheck('mongodb'),
      () => this.redis.isHealthy('redis'),
      () => this.memory.checkHeap('memory_heap', 500 * 1024 * 1024),
    ]);
  }

  @Get('liveness')
  @ApiOperation({ summary: 'Kubernetes liveness probe — always returns 200 if process is alive' })
  @ApiResponse({ status: 200, description: 'Process alive — { status: "ok", timestamp: "..." }' })
  liveness() { return { status: 'ok', timestamp: new Date().toISOString() }; }

  @Get('readiness')
  @HealthCheck()
  @ApiOperation({ summary: 'Kubernetes readiness probe — returns up/down without connection details' })
  @ApiResponse({ status: 200, description: 'Ready to receive traffic' })
  @ApiResponse({ status: 503, description: 'Not ready' })
  async readiness() {
    try {
      const result = await this.health.check([
        () => this.mongoose.pingCheck('mongodb'),
        () => this.redis.isHealthy('redis'),
      ]);
      // Return only up/down status — no connection strings, versions, or host details
      return { status: result.status };
    } catch {
      return { status: 'error' };
    }
  }
}
