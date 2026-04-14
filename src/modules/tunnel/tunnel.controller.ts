import {
  Controller, Get, Post, Delete, Param, Req, Res, Body,
  UseGuards, Request, HttpCode,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiResponse, ApiParam, ApiBody,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { Response, Request as ExpressRequest } from 'express';
import { TunnelService } from './tunnel.service';

@ApiTags('Tunnel')
@Controller('tunnel')
export class TunnelController {
  constructor(private svc: TunnelService) {}

  private baseUrl(): string {
    return process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 3000}`;
  }

  private buildUrls(tunnelId: string) {
    const base = this.baseUrl();
    return {
      publicUrl: `${base}/api/v1/tunnel/in/${tunnelId}`,
      inboundUrl: `${base}/api/v1/tunnel/in/${tunnelId}`,
      sseUrl: `${base}/api/v1/tunnel/sse/${tunnelId}`,
    };
  }

  @Post('create')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create a CLI tunnel session — returns tunnelId, URLs, and metadata' })
  @ApiResponse({ status: 201, description: 'Tunnel created' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@Request() req: any) {
    const userId = req.user?.id || req.user?._id || 'anonymous';
    const meta = this.svc.createTunnel(userId);
    const urls = this.buildUrls(meta.tunnelId);
    return {
      ...meta,
      ...urls,
      active: false,
      expiresIn: '1h',
      message: 'Connect your CLI to the sseUrl, then send webhooks to the publicUrl',
    };
  }

  @Get('mine')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all tunnel sessions for the current user (active + recent)' })
  @ApiResponse({ status: 200, description: 'Array of tunnel objects with status' })
  mine(@Request() req: any) {
    const userId = req.user?.id || req.user?._id || 'anonymous';
    const tunnels = this.svc.listForUser(userId);
    return tunnels.map(t => ({
      ...t,
      ...this.buildUrls(t.tunnelId),
    }));
  }

  @Delete(':tunnelId')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete a tunnel session and disconnect any active CLI' })
  @ApiParam({ name: 'tunnelId', type: String })
  @ApiResponse({ status: 200, description: 'Tunnel deleted' })
  remove(@Param('tunnelId') tunnelId: string) {
    this.svc.deleteTunnel(tunnelId);
    return { success: true, tunnelId, message: 'Tunnel deleted' };
  }

  @Get('sse/:tunnelId')
  @SkipThrottle()
  @ApiOperation({ summary: 'SSE stream for CLI to receive forwarded webhook events' })
  @ApiParam({ name: 'tunnelId', type: String })
  @ApiResponse({ status: 200, description: 'SSE stream (text/event-stream)' })
  sse(@Param('tunnelId') tunnelId: string, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ type: 'connected', tunnelId, ts: new Date().toISOString() })}\n\n`);
    const hb = setInterval(() => {
      if (res.writableEnded) { clearInterval(hb); return; }
      res.write(`: heartbeat\n\n`);
    }, 30_000);
    res.on('close', () => clearInterval(hb));
    this.svc.register(tunnelId, res);
  }

  @Post('in/:tunnelId')
  @SkipThrottle()
  @HttpCode(200)
  @ApiOperation({ summary: 'Public inbound URL — send webhooks here during local development' })
  @ApiParam({ name: 'tunnelId', type: String })
  @ApiBody({ schema: { description: 'Any JSON payload to forward to CLI' } })
  @ApiResponse({ status: 200, description: '{ success, tunnelId }' })
  async receive(
    @Param('tunnelId') tunnelId: string,
    @Req() req: ExpressRequest,
    @Body() body: any,
  ) {
    const forwarded = this.svc.forward(tunnelId, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body,
      query: req.query,
      path: req.path,
    });
    if (!forwarded) {
      return { success: false, message: 'No active CLI session for this tunnel ID' };
    }
    return { success: true, message: 'Event forwarded to CLI', tunnelId };
  }

  @Get('status/:tunnelId')
  @ApiOperation({ summary: 'Check if a tunnel session is active' })
  @ApiParam({ name: 'tunnelId', type: String })
  @ApiResponse({ status: 200, description: '{ tunnelId, active, stats }' })
  status(@Param('tunnelId') tunnelId: string) {
    const meta = this.svc.getMeta(tunnelId);
    return {
      tunnelId,
      active: this.svc.isActive(tunnelId),
      ...this.buildUrls(tunnelId),
      forwarded: meta?.forwarded || 0,
      lastEventAt: meta?.lastEventAt || null,
      createdAt: meta?.createdAt || null,
    };
  }
}
