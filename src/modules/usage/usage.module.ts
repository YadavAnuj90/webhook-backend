import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Controller, Get, UseGuards, Request, Query } from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiResponse, ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/strategies/jwt.strategy';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WebhookEvent, WebhookEventSchema, EventStatus } from '../events/schemas/event.schema';
import { Endpoint, EndpointSchema } from '../endpoints/schemas/endpoint.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

const PLAN_LIMITS: Record<string, { events: number; endpoints: number; projects: number; retention: number }> = {
  free:       { events: 10_000,     endpoints: 3,        projects: 1,        retention: 7   },
  starter:    { events: 100_000,    endpoints: 10,       projects: 3,        retention: 30  },
  pro:        { events: 1_000_000,  endpoints: 50,       projects: 10,       retention: 90  },
  enterprise: { events: 10_000_000, endpoints: 1_000,    projects: 100,      retention: 365 },
};

const OVERAGE_PRICE_PER_1K = { free: 0, starter: 0.50, pro: 0.25, enterprise: 0.10 };

@Injectable()
export class UsageService {
  constructor(
    @InjectModel(WebhookEvent.name) private eventModel: Model<WebhookEvent>,
    @InjectModel(Endpoint.name) private endpointModel: Model<Endpoint>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  async getUsage(userId: string, period: 'day' | 'week' | 'month' = 'month') {
    const user = await this.userModel.findById(userId);
    const plan = user?.plan || 'free';
    const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);

    // Build daily chart from real DB data
    const now = new Date();
    const chartPromises = Array.from({ length: days }, async (_, i) => {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - (days - 1 - i));
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      const filter = { createdAt: { $gte: dayStart, $lte: dayEnd } };
      const [delivered, failed, pending] = await Promise.all([
        this.eventModel.countDocuments({ ...filter, status: EventStatus.DELIVERED }),
        this.eventModel.countDocuments({ ...filter, status: { $in: [EventStatus.FAILED, EventStatus.DEAD] } }),
        this.eventModel.countDocuments({ ...filter, status: EventStatus.PENDING }),
      ]);
      return { date: dayStart.toISOString().slice(0, 10), delivered, failed, pending };
    });
    const chart = await Promise.all(chartPromises);
    const totals = chart.reduce((acc, d) => ({
      delivered: acc.delivered + d.delivered,
      failed: acc.failed + d.failed,
      pending: acc.pending + d.pending,
      total: acc.total + d.delivered + d.failed + d.pending,
    }), { delivered: 0, failed: 0, pending: 0, total: 0 });

    // Count active endpoints for this user's projects
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const monthlyEvents = await this.eventModel.countDocuments({ createdAt: { $gte: monthStart } });
    const overage = Math.max(0, monthlyEvents - limits.events);
    const overagePrice = overage > 0 ? (overage / 1000) * (OVERAGE_PRICE_PER_1K[plan] || 0) : 0;

    return {
      period, chart, totals, plan, limits,
      overage: { events: overage, estimatedCost: parseFloat(overagePrice.toFixed(4)), currency: 'USD' },
      bandwidth: { bytes: totals.total * 1024, requests: totals.total }, // estimate
      topEndpoints: [],
    };
  }

  async getSummary(userId: string) {
    const user = await this.userModel.findById(userId);
    const plan = user?.plan || 'free';
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [thisDelivered, thisFailed, thisPending, lastDelivered, lastFailed] = await Promise.all([
      this.eventModel.countDocuments({ createdAt: { $gte: thisMonthStart }, status: EventStatus.DELIVERED }),
      this.eventModel.countDocuments({ createdAt: { $gte: thisMonthStart }, status: { $in: [EventStatus.FAILED, EventStatus.DEAD] } }),
      this.eventModel.countDocuments({ createdAt: { $gte: thisMonthStart }, status: EventStatus.PENDING }),
      this.eventModel.countDocuments({ createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd }, status: EventStatus.DELIVERED }),
      this.eventModel.countDocuments({ createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd }, status: { $in: [EventStatus.FAILED, EventStatus.DEAD] } }),
    ]);

    const thisTotal = thisDelivered + thisFailed + thisPending;
    const lastTotal = lastDelivered + lastFailed;
    const overage = Math.max(0, thisTotal - limits.events);

    return {
      thisMonth: {
        events: thisTotal, delivered: thisDelivered, failed: thisFailed,
        successRate: thisTotal > 0 ? parseFloat(((thisDelivered / thisTotal) * 100).toFixed(2)) : 100,
      },
      lastMonth: {
        events: lastTotal, delivered: lastDelivered, failed: lastFailed,
        successRate: lastTotal > 0 ? parseFloat(((lastDelivered / lastTotal) * 100).toFixed(2)) : 100,
      },
      plan, limits,
      percentUsed: {
        events: limits.events === Infinity ? 0 : parseFloat(((thisTotal / limits.events) * 100).toFixed(2)),
      },
      overage: {
        events: overage,
        estimatedCost: parseFloat(((overage / 1000) * (OVERAGE_PRICE_PER_1K[plan] || 0)).toFixed(4)),
        currency: 'USD',
      },
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
  @ApiOperation({ summary: 'Get real-time delivery stats and daily chart for a period (day | week | month)' })
  @ApiQuery({ name: 'period', required: false, enum: ['day', 'week', 'month'], description: 'Look-back period (default: month)' })
  @ApiResponse({ status: 200, description: 'Usage stats: chart, totals, plan limits, overage estimate, bandwidth' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getUsage(@Request() req: any, @Query('period') period: any) { return this.svc.getUsage(req.user.id, period); }

  @Get('summary')
  @ApiOperation({ summary: 'Get this month vs last month summary with plan limits and overage cost estimate' })
  @ApiResponse({ status: 200, description: 'Monthly comparison: thisMonth, lastMonth, plan, limits, percentUsed, overage' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getSummary(@Request() req: any) { return this.svc.getSummary(req.user.id); }
}

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WebhookEvent.name, schema: WebhookEventSchema },
      { name: Endpoint.name, schema: EndpointSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [UsageController],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
