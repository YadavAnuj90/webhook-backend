import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AiProviderService } from './gemini.service';
import { WebhookEvent, EventStatus } from '../events/schemas/event.schema';
import { DeliveryLog } from '../delivery/schemas/delivery-log.schema';
import { Endpoint } from '../endpoints/schemas/endpoint.schema';

// ─── Response Types ───────────────────────────────────────────────────────────

export interface DebugAnswer {
  question: string;
  answer: string;
  rootCause: string;
  suggestedActions: string[];
  affectedEvents: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface GeneratedSchema {
  suggestedName: string;
  suggestedDescription: string;
  version: string;
  jsonSchema: Record<string, any>;
  samplePayload: Record<string, any>;
  tags: string[];
  saved?: boolean;
  eventTypeId?: string;
}

export interface DlqTriageGroup {
  pattern: string;
  failureType: 'network' | 'auth' | 'client_error' | 'server_error' | 'schema' | 'timeout' | 'unknown';
  count: number;
  eventIds: string[];
  suggestedFix: string;
  fixCommand: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  canAutoReplay: boolean;
}

export interface DlqTriageReport {
  totalDead: number;
  groups: DlqTriageGroup[];
  summary: string;
  quickWins: string[];
  estimatedRecoveryRate: number;
}

export interface PiiDetectionResult {
  detectedFields: { path: string; type: string; confidence: 'high' | 'medium' | 'low'; reason: string }[];
  piiPaths: string[];
  summary: string;
  applied?: boolean;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly gemini: AiProviderService,
    @InjectModel(WebhookEvent.name) private eventModel: Model<WebhookEvent>,
    @InjectModel(DeliveryLog.name)  private logModel:   Model<DeliveryLog>,
    @InjectModel(Endpoint.name)     private endpointModel: Model<Endpoint>,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // FEATURE 1 — Natural Language Webhook Debugger
  // ═══════════════════════════════════════════════════════════════════════════

  async debugWebhooks(
    projectId: string,
    question: string,
    opts: { endpointId?: string; eventType?: string; hours?: number } = {},
  ): Promise<DebugAnswer> {
    const hours  = Math.min(opts.hours || 24, 168);
    const since  = new Date(Date.now() - hours * 3_600_000);

    const logFilter: any = { projectId, attemptedAt: { $gte: since } };
    if (opts.endpointId) logFilter.endpointId = opts.endpointId;

    const [logs, failedEvents, endpoint] = await Promise.all([
      this.logModel.find(logFilter).sort({ attemptedAt: -1 }).limit(80).lean(),
      this.eventModel.find({
        projectId,
        ...(opts.endpointId ? { endpointId: opts.endpointId } : {}),
        ...(opts.eventType  ? { eventType:  opts.eventType  } : {}),
        status: { $in: [EventStatus.FAILED, EventStatus.DEAD, EventStatus.RETRYING] },
        createdAt: { $gte: since },
      }).sort({ createdAt: -1 }).limit(30).lean(),
      opts.endpointId ? this.endpointModel.findById(opts.endpointId).lean() : null,
    ]);

    const statusCounts = logs.reduce((acc: Record<string, number>, l) => {
      const key = l.success ? '2xx' : `${Math.floor((l.statusCode || 0) / 100)}xx`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const errorSamples = logs
      .filter(l => !l.success).slice(0, 15)
      .map(l => ({
        statusCode:   l.statusCode,
        error:        l.errorMessage?.slice(0, 200),
        responseBody: l.responseBody?.slice(0, 300),
        latencyMs:    l.latencyMs,
        attemptedAt:  l.attemptedAt,
      }));

    const prompt = `You are an expert webhook delivery engineer and SRE. Analyze the following webhook delivery telemetry and answer the developer's question.

DEVELOPER QUESTION: "${question}"

DELIVERY TELEMETRY (last ${hours} hours):
- Endpoint: ${(endpoint as any)?.url || 'all endpoints'} (status: ${(endpoint as any)?.status || 'unknown'})
- Total delivery attempts: ${logs.length}
- Status distribution: ${JSON.stringify(statusCounts)}
- Failed: ${failedEvents.filter(e => e.status === EventStatus.FAILED).length} | Dead (DLQ): ${failedEvents.filter(e => e.status === EventStatus.DEAD).length} | Retrying: ${failedEvents.filter(e => e.status === EventStatus.RETRYING).length}
- Avg latency: ${logs.length > 0 ? Math.round(logs.reduce((s, l) => s + (l.latencyMs || 0), 0) / logs.length) : 0}ms
- Top errors: ${JSON.stringify([...new Set(logs.filter(l => l.errorMessage).map(l => l.errorMessage!.slice(0, 150)))].slice(0, 8))}
- Recent failure samples: ${JSON.stringify(errorSamples, null, 2)}

Respond ONLY as valid JSON:
{
  "answer": "clear 2-4 sentence answer to the question",
  "rootCause": "single sentence pinpointing the most likely root cause",
  "suggestedActions": ["step 1", "step 2", "step 3"],
  "severity": "low|medium|high|critical",
  "affectedEvents": <number>
}`;

    const result = await this.gemini.askJson<{
      answer: string; rootCause: string;
      suggestedActions: string[];
      severity: 'low' | 'medium' | 'high' | 'critical';
      affectedEvents: number;
    }>(prompt);

    return {
      question,
      answer:           result.answer,
      rootCause:        result.rootCause,
      suggestedActions: result.suggestedActions || [],
      severity:         result.severity || 'medium',
      affectedEvents:   result.affectedEvents ?? failedEvents.length,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FEATURE 2 — AI Schema Generator
  // ═══════════════════════════════════════════════════════════════════════════

  async generateSchema(
    projectId: string,
    samplePayload: Record<string, any>,
    opts: { eventTypeName?: string; autoSave?: boolean } = {},
  ): Promise<GeneratedSchema> {
    const prompt = `You are a JSON Schema expert building a webhook platform Event Catalog.

Given the following JSON payload sample from a webhook event, generate a complete, production-quality JSON Schema (Draft-07) for it.

SAMPLE PAYLOAD:
${JSON.stringify(samplePayload, null, 2)}

${opts.eventTypeName ? `HINT: The developer named this event type "${opts.eventTypeName}"` : ''}

Rules:
- Add "description" on every property
- Infer types accurately (ISO dates → "string"+"format":"date-time", emails → "format":"email", UUIDs → "pattern", URLs → "format":"uri")
- Mark essential fields (IDs, amounts, statuses) as "required"
- Use "enum" for fixed-value fields (status, currency, etc.)
- Follow resource.verb naming (e.g. "order.created", "payment.failed")

Respond ONLY as valid JSON:
{
  "suggestedName": "resource.verb format",
  "suggestedDescription": "1-2 sentence description of when this event fires",
  "version": "v1",
  "tags": ["tag1", "tag2"],
  "jsonSchema": { <complete JSON Schema Draft-07> },
  "samplePayload": { <normalized payload> }
}`;

    const result = await this.gemini.askJson<GeneratedSchema>(prompt, 0.1);

    return {
      suggestedName:        result.suggestedName        || opts.eventTypeName || 'unknown.event',
      suggestedDescription: result.suggestedDescription || '',
      version:              result.version              || 'v1',
      jsonSchema:           result.jsonSchema           || {},
      samplePayload:        result.samplePayload        || samplePayload,
      tags:                 result.tags                 || [],
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FEATURE 3 — Smart DLQ Triage
  // ═══════════════════════════════════════════════════════════════════════════

  async triageDlq(projectId: string): Promise<DlqTriageReport> {
    const deadEvents = await this.eventModel
      .find({ projectId, status: EventStatus.DEAD })
      .sort({ createdAt: -1 }).limit(200).lean();

    if (deadEvents.length === 0) {
      return {
        totalDead: 0, groups: [],
        summary: 'Your DLQ is empty — great job!',
        quickWins: [], estimatedRecoveryRate: 100,
      };
    }

    const eventIds = deadEvents.map(e => String(e._id));
    const logs = await this.logModel
      .find({ eventId: { $in: eventIds }, success: false })
      .sort({ attemptedAt: -1 }).lean();

    const logByEvent = new Map<string, typeof logs[0]>();
    for (const log of logs) {
      if (!logByEvent.has(log.eventId)) logByEvent.set(log.eventId, log);
    }

    const enriched = deadEvents.map(e => {
      const log = logByEvent.get(String(e._id));
      return {
        id: String(e._id), eventType: e.eventType,
        endpointId: e.endpointId, retryCount: e.retryCount,
        statusCode:   log?.statusCode,
        errorMessage: log?.errorMessage?.slice(0, 200),
        responseBody: log?.responseBody?.slice(0, 300),
        latencyMs:    log?.latencyMs,
      };
    });

    const grouped = enriched.reduce((acc: Record<string, typeof enriched>, e) => {
      const key = e.statusCode
        ? `HTTP_${e.statusCode}`
        : e.errorMessage?.includes('timeout')        ? 'TIMEOUT'
        : e.errorMessage?.includes('ECONNREFUSED')   ? 'CONNECTION_REFUSED'
        : e.errorMessage?.includes('certificate')    ? 'TLS_ERROR'
        : `OTHER_${e.endpointId.slice(-6)}`;
      acc[key] = [...(acc[key] || []), e];
      return acc;
    }, {});

    const groupSummary = Object.entries(grouped).map(([key, events]) => ({
      groupKey: key, count: events.length,
      eventIds: events.map(e => e.id),
      eventTypes: [...new Set(events.map(e => e.eventType))],
      statusCode: events[0].statusCode,
      sampleError: events[0].errorMessage,
      sampleResponse: events[0].responseBody,
      avgRetries: Math.round(events.reduce((s, e) => s + e.retryCount, 0) / events.length),
    }));

    const prompt = `You are a senior SRE triaging a webhook Dead Letter Queue. Analyze these failure groups and produce actionable fix recommendations.

DLQ: ${deadEvents.length} total dead events
GROUPS: ${JSON.stringify(groupSummary, null, 2)}

For each group provide: failure type, human-readable pattern, specific fix, exact action to take, priority, and whether events can be safely replayed.

Respond ONLY as valid JSON:
{
  "groups": [
    {
      "groupKey": "<key from input>",
      "pattern": "human-readable name",
      "failureType": "network|auth|client_error|server_error|schema|timeout|unknown",
      "suggestedFix": "specific fix in 1-2 sentences",
      "fixCommand": "exact action (e.g. 'Go to Endpoint Settings → Auth → Rotate Bearer Token')",
      "priority": "critical|high|medium|low",
      "canAutoReplay": true
    }
  ],
  "summary": "2-3 sentence DLQ health summary",
  "quickWins": ["quick win 1", "quick win 2"],
  "estimatedRecoveryRate": <0-100>
}`;

    const result = await this.gemini.askJson<{
      groups: any[]; summary: string;
      quickWins: string[]; estimatedRecoveryRate: number;
    }>(prompt, 0.2);

    const mergedGroups: DlqTriageGroup[] = (result.groups || []).map((g: any) => {
      const local = grouped[g.groupKey] || [];
      return {
        pattern: g.pattern, failureType: g.failureType,
        count: local.length, eventIds: local.map(e => e.id),
        suggestedFix: g.suggestedFix, fixCommand: g.fixCommand,
        priority: g.priority, canAutoReplay: g.canAutoReplay,
      };
    });

    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    mergedGroups.sort((a, b) => (order[a.priority] || 3) - (order[b.priority] || 3));

    return {
      totalDead: deadEvents.length,
      groups:    mergedGroups,
      summary:   result.summary || '',
      quickWins: result.quickWins || [],
      estimatedRecoveryRate: result.estimatedRecoveryRate ?? 0,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FEATURE 4 — PII Auto-Detector
  // ═══════════════════════════════════════════════════════════════════════════

  async detectPii(
    samplePayload: Record<string, any>,
    opts: { endpointId?: string; autoApply?: boolean } = {},
  ): Promise<PiiDetectionResult> {
    const prompt = `You are a data privacy expert and GDPR compliance engineer. Identify all PII, sensitive financial, or confidential fields in this JSON payload.

PAYLOAD:
${JSON.stringify(samplePayload, null, 2)}

Detect: names, emails, phones, addresses, DOB, national IDs, SSNs, credit cards, bank accounts, passwords, API keys, tokens, GPS coords, IP addresses, device IDs.
Use dot-notation paths (e.g. "user.email", "billing.card.number").
Confidence: high = field name + value clearly PII, medium = name suggests PII, low = value pattern only.

Respond ONLY as valid JSON:
{
  "detectedFields": [
    { "path": "dot.path", "type": "email|phone|name|address|credit_card|ssn|ip_address|auth_token|api_key|dob|national_id|other", "confidence": "high|medium|low", "reason": "one sentence" }
  ],
  "summary": "2-3 sentence risk summary"
}`;

    const result = await this.gemini.askJson<{
      detectedFields: { path: string; type: string; confidence: 'high' | 'medium' | 'low'; reason: string }[];
      summary: string;
    }>(prompt, 0.1);

    const detectedFields = result.detectedFields || [];
    const piiPaths = detectedFields
      .filter(f => f.confidence === 'high' || f.confidence === 'medium')
      .map(f => f.path);

    let applied = false;
    if (opts.autoApply && opts.endpointId && piiPaths.length > 0) {
      await this.endpointModel.findByIdAndUpdate(opts.endpointId, {
        $addToSet: { piiFields: { $each: piiPaths } },
      });
      applied = true;
    }

    return { detectedFields, piiPaths, summary: result.summary || '', applied };
  }
}
