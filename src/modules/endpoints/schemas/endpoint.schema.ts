import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { PayloadCrypto } from '../../../utils/payload-crypto';

export enum EndpointStatus   { ACTIVE = 'active', PAUSED = 'paused', DISABLED = 'disabled' }
export enum SignatureScheme  { HMAC_SHA256 = 'hmac-sha256', ED25519 = 'ed25519' }
export enum EndpointAuthType { NONE = 'none', BEARER_TOKEN = 'bearer_token', OAUTH2 = 'oauth2', MTLS = 'mtls' }
export enum EndpointType     { HTTP = 'http', S3 = 's3', GCS = 'gcs' }

export interface FilterRule {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'exists';
  value?: any;
}

export interface RateLimitConfig {
  maxPerMinute: number;
  maxPerHour:   number;
  maxPerDay:    number;
}

export interface OAuth2Config {
  tokenUrl:     string;
  clientId:     string;
  clientSecret: string;
  scope?:       string;
  audience?:    string;
}

export interface MtlsConfig {
  certificate:   string;
  privateKey:    string;
  caCertificate?: string;
}

export interface StorageConfig {
  bucket:           string;
  region?:          string;
  prefix?:          string;
  accessKeyId?:     string;
  secretAccessKey?: string;
  serviceAccountKey?: string;
}

@Schema({
  timestamps: true,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class Endpoint extends Document {
  @Prop({ required: true }) projectId:  string;
  @Prop({ required: true }) name:       string;
  @Prop({ required: true }) url:        string;
  @Prop({ required: true }) secret:     string;
  @Prop({ type: String, default: null })  ed25519PublicKey: string | null;

  @Prop({ default: EndpointStatus.ACTIVE,    enum: EndpointStatus })   status:          EndpointStatus;
  @Prop({ default: EndpointType.HTTP,        enum: EndpointType })     endpointType:    EndpointType;
  @Prop({ default: SignatureScheme.HMAC_SHA256, enum: SignatureScheme }) signatureScheme: SignatureScheme;

  @Prop({ type: [String], default: [] }) eventTypes: string[];
  @Prop({ type: [String], default: [] }) allowedIps: string[];
  @Prop({ type: Object, default: {} })   headers:    Record<string, string>;

  @Prop({ default: 30000 }) timeoutMs:              number;
  @Prop({ default: 5 })     maxRetries:             number;
  @Prop({ default: 'exponential', enum: ['exponential', 'linear', 'fixed'] }) retryStrategy: string;
  @Prop({ default: 60 })    retryFixedDelaySeconds: number;

  @Prop({ default: EndpointAuthType.NONE, enum: EndpointAuthType }) authType: EndpointAuthType;
  @Prop({ type: String, default: null }) bearerToken:  string | null;
  @Prop({ type: Object, default: null }) oauth2Config:  OAuth2Config | null;
  @Prop({ type: Object, default: null }) mtlsConfig:    MtlsConfig   | null;
  @Prop({ type: Object, default: null }) storageConfig: StorageConfig | null;

  @Prop({ default: 0 }) deduplicationWindowSecs: number;
  @Prop({ type: Object, default: { maxPerMinute: 60, maxPerHour: 1000, maxPerDay: 10000 } })
  rateLimit: RateLimitConfig;

  @Prop({ type: [Object], default: [] }) filterRules: FilterRule[];

  @Prop({ default: 0 })                failureCount:   number;
  @Prop({ type: Date, default: null }) lastFailureAt:  Date | null;
  @Prop({ type: Date, default: null }) lastSuccessAt:  Date | null;
  @Prop({ default: 0 })               totalDelivered: number;
  @Prop({ default: 0 })               totalFailed:    number;

  @Prop({ default: 0 })               deliveriesThisMinute: number;
  @Prop({ default: 0 })               deliveriesThisHour:   number;
  @Prop({ default: 0 })               deliveriesThisDay:    number;
  @Prop({ type: Date, default: null }) minuteResetAt: Date | null;
  @Prop({ type: Date, default: null }) hourResetAt:   Date | null;
  @Prop({ type: Date, default: null }) dayResetAt:    Date | null;

  @Prop({ default: false }) batchingEnabled:     boolean;
  @Prop({ default: 5 })     batchWindowSeconds:  number;
  @Prop({ default: 100 })   batchMaxSize:        number;

  @Prop({ type: [String], default: [] }) piiFields: string[];

  @Prop({ type: String, trim: true, default: null }) canaryUrl:       string | null;
  @Prop({ default: 0, min: 0, max: 100 }) canaryPercent: number;
  @Prop({ default: 0 })                canaryDelivered: number;
  @Prop({ default: 0 })                canaryFailed:    number;

  @Prop({ type: String, trim: true, default: null }) shadowUrl:       string | null;
  @Prop({ default: 0 })               maxPayloadBytes:  number;

  @Prop({ type: [{ dayOfWeek: Number, startHour: Number, endHour: Number }], default: [] })
  maintenanceWindows: { dayOfWeek: number; startHour: number; endHour: number }[];

  @Prop({ type: Date, default: null }) deletedAt: Date | null;
}

export const EndpointSchema = SchemaFactory.createForClass(Endpoint);

const ENC_PREFIX = 'enc:';
const isEncrypted = (v: any) => typeof v === 'string' && v.startsWith(ENC_PREFIX);

function encryptIfNeeded(v: any): any {
  if (!v || typeof v !== 'string' || isEncrypted(v) || !PayloadCrypto.isEnabled()) return v;
  return PayloadCrypto.encrypt(v);
}

EndpointSchema.pre('save', function (next) {
  try {
    const doc: any = this;
    if (doc.isModified('secret'))       doc.secret       = encryptIfNeeded(doc.secret);
    if (doc.isModified('bearerToken'))  doc.bearerToken  = encryptIfNeeded(doc.bearerToken);
    if (doc.isModified('oauth2Config') && doc.oauth2Config?.clientSecret) {
      doc.oauth2Config.clientSecret = encryptIfNeeded(doc.oauth2Config.clientSecret);
    }
    if (doc.isModified('mtlsConfig') && doc.mtlsConfig?.privateKey) {
      doc.mtlsConfig.privateKey = encryptIfNeeded(doc.mtlsConfig.privateKey);
    }
    if (doc.isModified('storageConfig')) {
      if (doc.storageConfig?.secretAccessKey)   doc.storageConfig.secretAccessKey   = encryptIfNeeded(doc.storageConfig.secretAccessKey);
      if (doc.storageConfig?.serviceAccountKey) doc.storageConfig.serviceAccountKey = encryptIfNeeded(doc.storageConfig.serviceAccountKey);
    }
    next();
  } catch (err) { next(err as any); }
});

function encryptUpdatePatch(this: any, next: Function) {
  try {
    const upd = this.getUpdate?.() || {};
    const $set = upd.$set || upd;
    if ($set) {
      if (typeof $set.secret === 'string')      $set.secret      = encryptIfNeeded($set.secret);
      if (typeof $set.bearerToken === 'string') $set.bearerToken = encryptIfNeeded($set.bearerToken);
      if ($set.oauth2Config?.clientSecret)      $set.oauth2Config.clientSecret      = encryptIfNeeded($set.oauth2Config.clientSecret);
      if ($set.mtlsConfig?.privateKey)          $set.mtlsConfig.privateKey          = encryptIfNeeded($set.mtlsConfig.privateKey);
      if ($set.storageConfig?.secretAccessKey)   $set.storageConfig.secretAccessKey   = encryptIfNeeded($set.storageConfig.secretAccessKey);
      if ($set.storageConfig?.serviceAccountKey) $set.storageConfig.serviceAccountKey = encryptIfNeeded($set.storageConfig.serviceAccountKey);
    }
    next();
  } catch (err) { next(err as any); }
}
EndpointSchema.pre('findOneAndUpdate', encryptUpdatePatch as any);
EndpointSchema.pre('updateOne',        encryptUpdatePatch as any);
EndpointSchema.pre('updateMany',       encryptUpdatePatch as any);

export function decryptEndpointSecrets<T = any>(ep: T | null): T | null {
  if (!ep) return ep;
  const e: any = ep;
  if (typeof e.secret === 'string')      e.secret      = PayloadCrypto.decrypt(e.secret);
  if (typeof e.bearerToken === 'string') e.bearerToken = PayloadCrypto.decrypt(e.bearerToken);
  if (e.oauth2Config?.clientSecret) e.oauth2Config.clientSecret = PayloadCrypto.decrypt(e.oauth2Config.clientSecret);
  if (e.mtlsConfig?.privateKey)     e.mtlsConfig.privateKey     = PayloadCrypto.decrypt(e.mtlsConfig.privateKey);
  if (e.storageConfig?.secretAccessKey)   e.storageConfig.secretAccessKey   = PayloadCrypto.decrypt(e.storageConfig.secretAccessKey);
  if (e.storageConfig?.serviceAccountKey) e.storageConfig.serviceAccountKey = PayloadCrypto.decrypt(e.storageConfig.serviceAccountKey);
  return ep;
}

EndpointSchema.index(
  { projectId: 1, status: 1 },
  { name: 'idx_project_status' },
);
EndpointSchema.index(
  { projectId: 1, eventTypes: 1 },
  {
    partialFilterExpression: { status: 'active', deletedAt: null },
    name: 'idx_project_eventtypes_active_partial',
  },
);

EndpointSchema.index(
  { projectId: 1, createdAt: -1 },
  { name: 'idx_project_time' },
);

EndpointSchema.index(
  { projectId: 1, deletedAt: 1 },
  { name: 'idx_project_deleted' },
);

EndpointSchema.index(
  { projectId: 1, lastFailureAt: -1 },
  { sparse: true, name: 'idx_project_last_failure' },
);
