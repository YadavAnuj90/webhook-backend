import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
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
    @Query('action') action?: AuditAction,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    return this.auditService.getSystemHistory({
      action, userId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: +page, limit: +limit,
    });
  }
}
