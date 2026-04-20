import {
  Controller, Post, Get, Query, Body, Req, UseGuards,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsNotEmpty } from 'class-validator';
import { NewsletterService } from './newsletter.service';
import { Request } from 'express';

/* ─── DTO ───────────────────────────────────────── */
class SubscribeDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

@ApiTags('Newsletter')
@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })  // 5 per minute max
  @ApiOperation({ summary: 'Subscribe to the WebhookOS newsletter' })
  @ApiBody({ type: SubscribeDto })
  async subscribe(@Body() body: SubscribeDto, @Req() req: Request) {
    return this.newsletterService.subscribe(body.email, {
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
      ua: req.headers['user-agent'],
      source: 'footer',
    });
  }

  @Get('unsubscribe')
  @ApiOperation({ summary: 'Unsubscribe via token link' })
  async unsubscribe(@Query('token') token: string) {
    return this.newsletterService.unsubscribe(token);
  }

  @Get('stats')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get newsletter subscriber stats (admin)' })
  async stats() {
    return this.newsletterService.getStats();
  }
}
