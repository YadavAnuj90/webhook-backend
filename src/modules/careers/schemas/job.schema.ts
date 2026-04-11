import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// ─── Enums ───────────────────────────────────────────────────────────────────

export enum JobStatus {
  DRAFT      = 'draft',
  OPEN       = 'open',
  CLOSED     = 'closed',
  ON_HOLD    = 'on_hold',
}

export enum JobType {
  FULL_TIME  = 'full_time',
  PART_TIME  = 'part_time',
  CONTRACT   = 'contract',
  INTERNSHIP = 'internship',
}

export enum JobDepartment {
  ENGINEERING = 'engineering',
  PRODUCT     = 'product',
  DESIGN      = 'design',
  MARKETING   = 'marketing',
  SALES       = 'sales',
  SUPPORT     = 'support',
  OPERATIONS  = 'operations',
  HR          = 'hr',
}

export enum ExperienceLevel {
  FRESHER  = 'fresher',
  JUNIOR   = 'junior',
  MID      = 'mid',
  SENIOR   = 'senior',
  LEAD     = 'lead',
  STAFF    = 'staff',
}

// ─── Schema ──────────────────────────────────────────────────────────────────

@Schema({
  timestamps: true,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class Job extends Document {
  @Prop({ required: true })                                  title: string;
  @Prop({ required: true, unique: true, lowercase: true })   slug: string;
  @Prop({ required: true, enum: JobDepartment })             department: JobDepartment;
  @Prop({ required: true })                                  location: string;      // "Remote" | "Bangalore" | "Hybrid — Bangalore"
  @Prop({ required: true, enum: JobType })                   type: JobType;
  @Prop({ required: true, enum: ExperienceLevel })           experience: ExperienceLevel;
  @Prop({ default: '' })                                     salaryRange: string;   // "₹8L – ₹15L" or empty
  @Prop({ required: true })                                  shortDescription: string;  // 1-2 line teaser for cards
  @Prop({ required: true })                                  description: string;       // full markdown/HTML body
  @Prop({ type: [String], default: [] })                     requirements: string[];
  @Prop({ type: [String], default: [] })                     niceToHave: string[];
  @Prop({ type: [String], default: [] })                     perks: string[];
  @Prop({ default: JobStatus.DRAFT, enum: JobStatus })       status: JobStatus;
  @Prop({ type: Date, default: null })                       publishedAt: Date | null;
  @Prop({ default: 0 })                                      applicationCount: number;
  @Prop({ required: true })                                  postedBy: string;          // userId of super_admin
}

export const JobSchema = SchemaFactory.createForClass(Job);

// ─── Indexes ─────────────────────────────────────────────────────────────────
JobSchema.index({ slug: 1 },                     { unique: true, name: 'uq_slug' });
JobSchema.index({ status: 1, department: 1 },     { name: 'idx_status_dept' });
JobSchema.index({ status: 1, publishedAt: -1 },   { name: 'idx_status_published' });
