import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/strategies/jwt.strategy';
import { Module } from '@nestjs/common';
import * as crypto from 'crypto';
import axios from 'axios';

// Inline lightweight playground — fires a test delivery and returns full response details
@ApiTags('Playground')
@ApiBearerAuth('JWT')
@Controller('playground')
@UseGuards(JwtAuthGuard)
export class PlaygroundController {

  @Post('fire')
  @ApiOperation({ summary: 'Fire a test HTTP request to any URL and inspect the response' })
  async fire(
    @Request() req: any,
    @Body() dto: { url: string; method?: string; headers?: Record<string, string>; payload?: any; timeout?: number },
  ) {
    const start = Date.now();
    const method = (dto.method || 'POST').toUpperCase();
    const timeout = Math.min(dto.timeout || 10000, 30000);
    try {
      const res = await axios({
        method, url: dto.url, data: dto.payload,
        headers: { 'Content-Type': 'application/json', 'X-WebhookOS-Test': '1', 'User-Agent': 'WebhookOS-Playground/1.0', ...dto.headers },
        timeout, validateStatus: () => true,
      });
      const latency = Date.now() - start;
      return {
        success: res.status >= 200 && res.status < 300,
        status: res.status, statusText: res.statusText,
        latency, headers: res.headers,
        body: typeof res.data === 'string' ? res.data.substring(0, 4096) : res.data,
        sentAt: new Date().toISOString(),
        curl: `curl -X ${method} "${dto.url}" \\\n  -H "Content-Type: application/json" \\\n${Object.entries(dto.headers || {}).map(([k, v]) => `  -H "${k}: ${v}" \\\n`).join('')}  -d '${JSON.stringify(dto.payload || {})}'`,
      };
    } catch (err: any) {
      return { success: false, status: 0, latency: Date.now() - start, error: err.message, sentAt: new Date().toISOString() };
    }
  }

  @Post('validate-signature')
  @ApiOperation({ summary: 'Validate a HMAC-SHA256 webhook signature against a secret' })
  validateSignature(@Body() dto: { payload: string; signature: string; secret: string }) {
    const expected = crypto.createHmac('sha256', dto.secret).update(dto.payload).digest('hex');
    const sigToCheck = dto.signature.replace(/^sha256=/, '');
    let valid = false;
    try {
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(sigToCheck.padEnd(expected.length, '0'), 'hex').slice(0, a.length);
      valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      valid = false;
    }
    return { valid, expected: 'sha256=' + expected };
  }
}

@Module({ controllers: [PlaygroundController] })
export class PlaygroundModule {}
