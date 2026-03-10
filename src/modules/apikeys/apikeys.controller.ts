import { Controller, Get, Post, Delete, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ApiKeysService } from './apikeys.service';
import { JwtAuthGuard } from '../auth/strategies/jwt.strategy';

@ApiTags('API Keys')
@ApiBearerAuth('JWT')
@Controller('api-keys')
@UseGuards(JwtAuthGuard)
export class ApiKeysController {
  constructor(private svc: ApiKeysService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new API key' })
  create(@Request() req: any, @Body() dto: any) { return this.svc.create(req.user.id, dto); }

  @Get()
  @ApiOperation({ summary: 'List all API keys' })
  list(@Request() req: any) { return this.svc.list(req.user.id); }

  @Get('stats')
  @ApiOperation({ summary: 'Get API key usage stats' })
  stats(@Request() req: any) { return this.svc.getStats(req.user.id); }

  @Patch(':id/revoke')
  @ApiOperation({ summary: 'Revoke an API key' })
  revoke(@Param('id') id: string, @Request() req: any) { return this.svc.revoke(req.user.id, id); }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an API key permanently' })
  delete(@Param('id') id: string, @Request() req: any) { return this.svc.delete(req.user.id, id); }
}
