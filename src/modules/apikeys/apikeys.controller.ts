import { Controller, Get, Post, Delete, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiResponse, ApiParam, ApiBody,
} from '@nestjs/swagger';
import { ApiKeysService } from './apikeys.service';
import { JwtAuthGuard } from '../auth/strategies/jwt.strategy';

@ApiTags('API Keys')
@ApiBearerAuth('JWT')
@Controller('api-keys')
@UseGuards(JwtAuthGuard)
export class ApiKeysController {
  constructor(private svc: ApiKeysService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new API key with optional scopes and expiry' })
  @ApiBody({ schema: { required: ['name'], properties: { name: { type: 'string', example: 'Production CI' }, scopes: { type: 'array', items: { type: 'string' }, example: ['webhooks:read', 'webhooks:write', 'events:read'] }, expiresAt: { type: 'string', format: 'date-time', description: 'Optional expiry date; null = never expires' } } } })
  @ApiResponse({ status: 201, description: 'API key created — plaintext key shown once only' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@Request() req: any, @Body() dto: any) { return this.svc.create(req.user.id, dto); }

  @Get()
  @ApiOperation({ summary: 'List all API keys for the current user (plaintext value is masked)' })
  @ApiResponse({ status: 200, description: 'Array of API keys with metadata and usage stats' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  list(@Request() req: any) { return this.svc.list(req.user.id); }

  @Get('stats')
  @ApiOperation({ summary: 'Get aggregated usage statistics for all API keys' })
  @ApiResponse({ status: 200, description: 'Usage stats: request counts, last used, error rates per key' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  stats(@Request() req: any) { return this.svc.getStats(req.user.id); }

  @Patch(':id/revoke')
  @ApiOperation({ summary: 'Revoke an API key (key remains but is disabled — use DELETE to remove)' })
  @ApiParam({ name: 'id', description: 'API key ID', type: String })
  @ApiResponse({ status: 200, description: 'API key revoked — all requests with this key will be rejected' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  revoke(@Param('id') id: string, @Request() req: any) { return this.svc.revoke(req.user.id, id); }

  @Delete(':id')
  @ApiOperation({ summary: 'Permanently delete an API key' })
  @ApiParam({ name: 'id', description: 'API key ID', type: String })
  @ApiResponse({ status: 200, description: 'API key permanently deleted' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  delete(@Param('id') id: string, @Request() req: any) { return this.svc.delete(req.user.id, id); }
}
