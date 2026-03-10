import { Injectable } from '@nestjs/common';
import { Controller, Get, UseGuards, Request, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/strategies/jwt.strategy';
import { Module } from '@nestjs/common';

const PLAN_LIMITS: Record<string, any> = {
  free:       { events: 10_000, endpoints: 3,  projects: 1,  retention: 7  },
  starter:    { events: 100_000, endpoints: 10, projects: 3,  retention: 30 },
  pro:        { events: 1_000_000, endpoints: 50, projects: 10, retention: 90 },
  enterprise: { events: Infinity, endpoints: Infinity, projects: Infinity, retention: 365 },
};

@Injectable()
export class UsageService {
  // In production these would query your analytics/events collections
  // For now we return realistic mock structures that match real DB schema
  async getUsage(userId: string, period: 'day' | 'week' | 'month' = 'month') {
    const now = new Date();
    const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
    const chart = Array.from({ length: days }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (days - 1 - i));
      return { date: d.toISOString().slice(0, 10), delivered: 0, failed: 0, pending: 0 };
    });
    return {
      period, chart,
      totals: { delivered: 0, failed: 0, pending: 0, total: 0 },
      plan: 'free', limits: PLAN_LIMITS['free'],
      bandwidth: { bytes: 0, requests: 0 },
      topEndpoints: [],
    };
  }

  async getSummary(userId: string) {
    return {
      thisMonth: { events: 0, delivered: 0, failed: 0, successRate: 100 },
      lastMonth: { events: 0, delivered: 0, failed: 0, successRate: 100 },
      plan: 'free', limits: PLAN_LIMITS['free'],
      percentUsed: { events: 0, endpoints: 0 },
    };
  }
}

@ApiTags('Usage')
@ApiBearerAuth('JWT')
@Controller('usage')
@UseGuards(JwtAuthGuard)
export class UsageController {
  constructor(private svc: UsageService) {}

  @Get()
  @ApiOperation({ summary: 'Get usage stats for period (day | week | month)' })
  getUsage(@Request() req: any, @Query('period') period: any) { return this.svc.getUsage(req.user.id, period); }

  @Get('summary')
  @ApiOperation({ summary: 'Get usage summary and plan limits' })
  getSummary(@Request() req: any) { return this.svc.getSummary(req.user.id); }
}

@Module({ controllers: [UsageController], providers: [UsageService], exports: [UsageService] })
export class UsageModule {}
