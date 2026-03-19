import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { AuditService } from './audit.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { AuditAction } from './schemas/audit-log.schema';

@ApiTags('Audit & History')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'))
@Controller('audit')
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get your own activity history' })
  myHistory(@Request() req: any, @Query('page') page = 1, @Query('limit') limit = 50) {
    return this.auditService.getUserHistory(req.user.id, +page, +limit);
  }

  @Get('system')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get system-wide audit log (admin only)' })
  systemHistory(
    @Query('action') action: AuditAction | undefined,
    @Query('userId') userId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('page') page: number | string = 1,
    @Query('limit') limit: number | string = 50,
  ) {
    return this.auditService.getSystemHistory({
      action,
      userId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: +page,
      limit: +limit,
    });
  }

  // FEATURE 14: Audit Log CSV Export
  @Get('export')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Export audit logs as CSV for a date range',
  })
  async exportCsv(
    @Request() req: any,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const logs = await this.auditService.exportLogs(
      req.user.id,
      from,
      to,
    );
    const header = 'id,action,resource,resourceId,ip,createdAt\n';
    const rows = logs
      .map(
        (l: any) =>
          `${l._id},${l.action},${l.resourceType || ''},${l.resourceId || ''},${l.ipAddress || ''},${l.createdAt || ''}`,
      )
      .join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="audit-${Date.now()}.csv"`,
    );
    res.send(header + rows);
  }
}
