import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class PortalToken {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) userId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Project', required: true }) projectId: Types.ObjectId;
  @Prop({ required: true, unique: true }) token: string;
  @Prop({ required: true, trim: true }) customerName: string;
  @Prop({ trim: true, lowercase: true }) customerEmail: string;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: null }) expiresAt: Date;
  @Prop({ default: null }) lastAccessedAt: Date;
  @Prop({ default: 0 }) accessCount: number;
  @Prop({ trim: true }) logoUrl: string;
  @Prop({ trim: true }) brandColor: string;
}
export const PortalTokenSchema = SchemaFactory.createForClass(PortalToken);
export type PortalTokenDocument = PortalToken & Document;
