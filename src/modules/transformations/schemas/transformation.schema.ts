import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Transformation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) userId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Endpoint' }) endpointId: Types.ObjectId;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ trim: true }) description: string;
  @Prop({ enum: ['remove_fields','rename_keys','add_fields','filter','custom_js'], default: 'remove_fields' }) type: string;
  @Prop({ type: Object }) config: Record<string, any>; // {fields:[], mappings:{}, additions:{}, filterExpr:'', jsCode:''}
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: 0 }) order: number;
}
export const TransformationSchema = SchemaFactory.createForClass(Transformation);
export type TransformationDocument = Transformation & Document;
