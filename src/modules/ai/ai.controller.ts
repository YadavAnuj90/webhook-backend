import {
  Controller, Post, Get, Body, Param,
  UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiParam, ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AiService } from './ai.service';
import { AiProviderService } from './gemini.service';

@ApiTags('AI Features')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'))
@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly provider: AiProviderService,
  ) {}

  // ── Provider status (frontend uses this to show active AI badge) ────────────
  @Get('status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '🤖 Get active AI provider status' })
  getStatus() {
    return {
      provider: this.provider.provider,
      label: this.provider.providerLabel,
      configured: this.provider.provider !== 'none',
      models: {
        deepseek: 'deepseek-chat (DeepSeek-V3)',
        gemini:   'gemini-2.0-flash',
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Natural Language Webhook Debugger
  // POST /api/v1/ai/projects/:projectId/debug
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('projects/:projectId/debug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '🤖 AI Debugger — ask a natural language question about your webhook delivery',
    description: `Ask anything about your webhook failures in plain English.
Examples:
- "Why did my payment.failed endpoint fail last night?"
- "What's causing 503 errors on my orders endpoint?"
- "Are there any patterns in my DLQ events from the last week?"
Gemini analyzes your last 80 delivery logs and returns a root cause + action plan.`,
  })
  @ApiParam({ name: 'projectId', description: 'Your project ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['question'],
      properties: {
        question: { type: 'string', example: 'Why did my endpoint keep failing last night?' },
        endpointId: { type: 'string', description: 'Scope to a specific endpoint (optional)' },
        eventType: { type: 'string', description: 'Scope to a specific event type (optional)' },
        hours: { type: 'number', default: 24, description: 'Look-back window in hours (max 168 = 7 days)' },
      },
    },
  })
  debugWebhooks(
    @Param('projectId') projectId: string,
    @Body() dto: { question: string; endpointId?: string; eventType?: string; hours?: number },
  ) {
    return this.ai.debugWebhooks(projectId, dto.question, {
      endpointId: dto.endpointId,
      eventType: dto.eventType,
      hours: dto.hours,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. AI Schema Generator
  // POST /api/v1/ai/projects/:projectId/generate-schema
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('projects/:projectId/generate-schema')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '🤖 AI Schema Generator — paste a payload, get a complete JSON Schema',
    description: `Paste any raw JSON payload and Gemini generates:
- A complete JSON Schema (Draft-07) with typed fields, required arrays, enums, formats
- A suggested event type name in resource.verb format
- A description, version, and tags
- Optionally auto-saves to your Event Catalog (set autoSave: true)`,
  })
  @ApiParam({ name: 'projectId', description: 'Your project ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['samplePayload'],
      properties: {
        samplePayload: { type: 'object', description: 'Raw JSON payload to analyze' },
        eventTypeName: { type: 'string', description: 'Optional hint for the event name' },
        autoSave: { type: 'boolean', default: false, description: 'Auto-register in Event Catalog' },
      },
    },
  })
  async generateSchema(
    @Param('projectId') projectId: string,
    @Body() dto: { samplePayload: Record<string, any>; eventTypeName?: string; autoSave?: boolean },
  ) {
    return this.ai.generateSchema(projectId, dto.samplePayload, {
      eventTypeName: dto.eventTypeName,
      autoSave: dto.autoSave,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Smart DLQ Triage
  // POST /api/v1/ai/projects/:projectId/triage-dlq
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('projects/:projectId/triage-dlq')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '🤖 Smart DLQ Triage — AI groups and explains all your dead-letter events',
    description: `Gemini reads all your Dead Letter Queue events, groups them by failure pattern,
and for each group provides:
- The failure type (auth / network / schema / server_error / timeout)
- The exact fix to apply
- Whether the events can be safely replayed after the fix
- Priority (critical → low)

Also returns: overall DLQ health summary, quick wins, and estimated recovery rate.`,
  })
  @ApiParam({ name: 'projectId', description: 'Your project ID' })
  triageDlq(@Param('projectId') projectId: string) {
    return this.ai.triageDlq(projectId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. PII Auto-Detector
  // POST /api/v1/ai/detect-pii
  // POST /api/v1/ai/projects/:projectId/endpoints/:endpointId/detect-pii
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('detect-pii')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '🤖 PII Detector — scan a JSON payload for personally identifiable information',
    description: `Paste any JSON payload. Gemini identifies all PII fields with:
- Dot-notation field paths (e.g. "user.email", "billing.card.number")
- PII type (email, phone, credit_card, ssn, ip_address, auth_token, etc.)
- Confidence level (high / medium / low)
- Reason explaining why each field is PII

Returns piiPaths: ready-to-paste array for your endpoint's PII Scrubbing config.`,
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['samplePayload'],
      properties: {
        samplePayload: { type: 'object', description: 'JSON payload to scan' },
      },
    },
  })
  detectPii(@Body() dto: { samplePayload: Record<string, any> }) {
    return this.ai.detectPii(dto.samplePayload);
  }

  @Post('projects/:projectId/endpoints/:endpointId/detect-pii')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '🤖 PII Detector — scan payload and optionally auto-apply to endpoint piiFields config',
    description: `Same as /detect-pii but scoped to a specific endpoint.
Set autoApply: true to automatically update the endpoint's piiFields config
with all high and medium confidence detections.`,
  })
  @ApiParam({ name: 'projectId', description: 'Your project ID' })
  @ApiParam({ name: 'endpointId', description: 'Endpoint to optionally apply PII config to' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['samplePayload'],
      properties: {
        samplePayload: { type: 'object', description: 'JSON payload to scan' },
        autoApply: {
          type: 'boolean',
          default: false,
          description: 'If true, auto-adds detected paths to endpoint piiFields',
        },
      },
    },
  })
  detectPiiForEndpoint(
    @Param('projectId') projectId: string,
    @Param('endpointId') endpointId: string,
    @Body() dto: { samplePayload: Record<string, any>; autoApply?: boolean },
  ) {
    return this.ai.detectPii(dto.samplePayload, {
      endpointId,
      autoApply: dto.autoApply,
    });
  }
}
