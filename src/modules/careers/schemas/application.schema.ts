import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum ApplicationStatus {
  NEW         = 'new',
  REVIEWED    = 'reviewed',
  SHORTLISTED = 'shortlisted',
  INTERVIEW   = 'interview',
  OFFERED     = 'offered',
  HIRED       = 'hired',
  REJECTED    = 'rejected',
  WITHDRAWN   = 'withdrawn',
}

export enum NoticePeriod {
  IMMEDIATE   = 'immediate',
  FIFTEEN     = '15_days',
  THIRTY      = '30_days',
  SIXTY       = '60_days',
  NINETY      = '90_days',
}

@Schema({
  timestamps: true,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class Application extends Document {
  @Prop({ required: true })                              jobId: string;
  @Prop({ required: true })                              jobTitle: string;

  @Prop({ required: true })                              fullName: string;
  @Prop({ required: true, lowercase: true })             email: string;
  @Prop({ required: true })                              phone: string;
  @Prop({ default: '' })                                 linkedinUrl: string;
  @Prop({ default: '' })                                 portfolioUrl: string;

  @Prop({ default: '' })                                 resumeUrl: string;
  @Prop({ default: '' })                                 resumeFilename: string;

  @Prop({ default: '' })                                 coverLetter: string;
  @Prop({ default: '' })                                 currentCtc: string;
  @Prop({ default: '' })                                 expectedCtc: string;
  @Prop({ default: NoticePeriod.THIRTY, enum: NoticePeriod }) noticePeriod: NoticePeriod;
  @Prop({ default: '' })                                 currentCompany: string;
  @Prop({ default: '' })                                 yearsOfExperience: string;

  @Prop({ default: ApplicationStatus.NEW, enum: ApplicationStatus }) status: ApplicationStatus;
  @Prop({ default: '' })                                 adminNotes: string;
  @Prop({ type: String, default: null })                   reviewedBy: string | null;
  @Prop({ type: Date, default: null })                   reviewedAt: Date | null;
}

export const ApplicationSchema = SchemaFactory.createForClass(Application);

ApplicationSchema.index({ jobId: 1, status: 1 },     { name: 'idx_job_status' });
ApplicationSchema.index({ email: 1, jobId: 1 },      { unique: true, name: 'uq_email_job' });
ApplicationSchema.index({ status: 1, createdAt: -1 }, { name: 'idx_status_date' });
