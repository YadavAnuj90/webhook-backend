import {
  Controller, Get, Post, Param, Req, Res, Headers, Body, Query,
  UseGuards, Request, HttpCode, RawBodyRequest,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Response, Request as ExpressRequest } from 'express';
import { TunnelService } from './tunnel.service';

@ApiTags('CLI Tunnel')
@Controller('tunnel')
export class TunnelController {
  constructor(private svc: TunnelService) {}

  /** Authenticated: create a tunnel session and get back the tunnel ID + URL */
  @Post('create')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create a CLI tunnel session. Returns tunnelId and inbound URL.' })
  create(@Request() req: any) {
    const tunnelId = this.svc.generateId();
    const baseUrl = process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 3000}`;
    return {
      tunnelId,
      inboundUrl: `${baseUrl}/api/v1/tunnel/in/${tunnelId}`,
      sseUrl: `${baseUrl}/api/v1/tunnel/sse/${tunnelId}`,
      expiresIn: '1h',
      message: 'Connect your CLI to the sseUrl, then send webhooks to the inboundUrl',
    };
  }

  /** Public SSE stream — CLI connects here to receive forwarded events */
  @Get('sse/:tunnelId')
  @ApiOperation({ summary: 'SSE stream for CLI to receive forwarded webhook events' })
  sse(@Param('tunnelId') tunnelId: string, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();
    // Send a connected event
    res.write(`data: ${JSON.stringify({ type: 'connected', tunnelId, ts: new Date().toISOString() })}\n\n`);
    // Keep-alive heartbeat every 30s
    const hb = setInterval(() => {
      if (res.writableEnded) { clearInterval(hb); return; }
      res.write(`: heartbeat\n\n`);
    }, 30_000);
    res.on('close', () => clearInterval(hb));
    this.svc.register(tunnelId, res);
  }

  /** Public inbound endpoint — accepts any webhook and forwards to CLI via SSE */
  @Post('in/:tunnelId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Public inbound URL. Send webhooks here during local dev.' })
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

  /** Check if a tunnel is active */
  @Get('status/:tunnelId')
  @ApiOperation({ summary: 'Check if a CLI tunnel session is active' })
  status(@Param('tunnelId') tunnelId: string) {
    return { tunnelId, active: this.svc.isActive(tunnelId) };
  }
}
