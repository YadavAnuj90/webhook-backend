import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum EndpointStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  DISABLED = 'disabled',
}

export enum SignatureScheme {
  HMAC_SHA256 = 'hmac-sha256',
  ED25519     = 'ed25519',
}

export enum EndpointAuthType {
  NONE         = 'none',
  BEARER_TOKEN = 'bearer_token',
  OAUTH2       = 'oauth2',
  MTLS         = 'mtls',
}

export enum EndpointType {
  HTTP = 'http',
  S3   = 's3',
  GCS  = 'gcs',
}

export interface FilterRule {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'exists';
  value?: any;
}

export interface RateLimitConfig {
  maxPerMinute: number;
  maxPerHour: number;
  maxPerDay: number;
}

export interface OAuth2Config {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
  audience?: string;
}

export interface MtlsConfig {
  certificate: string;   // PEM client certificate
  privateKey: string;    // PEM private key
  caCertificate?: string; // Optional CA cert to verify server
}

export interface StorageConfig {
  bucket: string;
  region?: string;           // S3
  prefix?: string;           // object key prefix
  accessKeyId?: string;      // S3
  secretAccessKey?: string;  // S3
  serviceAccountKey?: string; // GCS (JSON string)
}

@Schema({ timestamps: true })
export class Endpoint extends Document {
  @Prop({ required: true }) projectId: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) url: string;
  @Prop({ required: true }) secret: string;  // HMAC secret OR Ed25519 private key (PEM)
  @Prop({ default: null }) ed25519PublicKey: string; // Exposed to consumers for Ed25519 verify

  @Prop({ default: EndpointStatus.ACTIVE, enum: EndpointStatus }) status: EndpointStatus;
  @Prop({ default: EndpointType.HTTP, enum: EndpointType }) endpointType: EndpointType;
  @Prop({ default: SignatureScheme.HMAC_SHA256, enum: SignatureScheme }) signatureScheme: SignatureScheme;

  @Prop({ type: [String], default: [] }) eventTypes: string[];

  // FEATURE 3: IP Allowlist per Endpoint
  @Prop({ type: [String], default: [] }) allowedIps: string[];

  @Prop({ type: Object, default: {} }) headers: Record<string, string>;
  @Prop({ default: 30000 }) timeoutMs: number;
  @Prop({ default: 5 }) maxRetries: number;

  // FEATURE 16: Retry Budget per Endpoint — override global
  @Prop({ default: 'exponential', enum: ['exponential', 'linear', 'fixed'] }) retryStrategy: string;
  @Prop({ default: 60 }) retryFixedDelaySeconds: number;

  // Outbound authentication to the destination
  @Prop({ default: EndpointAuthType.NONE, enum: EndpointAuthType }) authType: EndpointAuthType;
  @Prop({ default: null }) bearerToken: string;         // for BEARER_TOKEN
  @Prop({ type: Object, default: null }) oauth2Config: OAuth2Config | null;
  @Prop({ type: Object, default: null }) mtlsConfig: MtlsConfig | null;

  // Object storage config (when endpointType != http)
  @Prop({ type: Object, default: null }) storageConfig: StorageConfig | null;

  // Deduplication window in seconds (0 = use idempotency key only, no time window)
  @Prop({ default: 0 }) deduplicationWindowSecs: number;

  // Rate Limiting
  @Prop({ type: Object, default: { maxPerMinute: 60, maxPerHour: 1000, maxPerDay: 10000 } })
  rateLimit: RateLimitConfig;

  // Filter Rules
  @Prop({ type: [Object], default: [] }) filterRules: FilterRule[];

  // Health tracking
  @Prop({ default: 0 }) failureCount: number;
  @Prop({ default: null }) lastFailureAt: Date;
  @Prop({ default: null }) lastSuccessAt: Date;

  // Stats
  @Prop({ default: 0 }) totalDelivered: number;
  @Prop({ default: 0 }) totalFailed: number;

  // Rate limit counters
  @Prop({ default: 0 }) deliveriesThisMinute: number;
  @Prop({ default: 0 }) deliveriesThisHour: number;
  @Prop({ default: 0 }) deliveriesThisDay: number;
  @Prop({ default: null }) minuteResetAt: Date;
  @Prop({ default: null }) hourResetAt: Date;
  @Prop({ default: null }) dayResetAt: Date;

  // FEATURE 2: Payload Batch/Streaming Aggregation
  @Prop({ default: false }) batchingEnabled: boolean;
  @Prop({ default: 5 }) batchWindowSeconds: number;    // 1–60
  @Prop({ default: 100 }) batchMaxSize: number;         // max events per batch flush

  // FEATURE 4: PII Scrubbing Before Storage & Delivery
  @Prop({ type: [String], default: [] }) piiFields: string[];  // dot-notation paths

  // FEATURE 7: A/B Delivery / Canary Rollout
  @Prop({ trim: true, default: null }) canaryUrl: string;
  @Prop({ default: 0, min: 0, max: 100 }) canaryPercent: number; // 0 = disabled
  @Prop({ default: 0 }) canaryDelivered: number;
  @Prop({ default: 0 }) canaryFailed: number;

  // FEATURE 12: Record & Replay to Staging (Shadow URL)
  @Prop({ trim: true, default: null }) shadowUrl: string;

  // FEATURE 15: Per-Endpoint Payload Size Limits
  @Prop({ default: 0 }) maxPayloadBytes: number; // 0 = unlimited

  // FEATURE 18: Webhook Pause Scheduling (Maintenance Windows)
  @Prop({ type: [{ dayOfWeek: Number, startHour: Number, endHour: Number }], default: [] })
  maintenanceWindows: { dayOfWeek: number; startHour: number; endHour: number }[];

  // Soft delete — queries MUST filter { deletedAt: null }
  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const EndpointSchema = SchemaFactory.createForClass(Endpoint);
EndpointSchema.index({ projectId: 1, status: 1 });
EndpointSchema.index({ projectId: 1, createdAt: -1 });                // list endpoints by project, newest first
EndpointSchema.index({ projectId: 1, deletedAt: 1 });                 // soft-delete filter
EndpointSchema.index({ projectId: 1, eventTypes: 1 });                // filter endpoints by event type
