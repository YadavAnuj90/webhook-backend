import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  timestamps: true,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class Transformation {
  @Prop({ type: Types.ObjectId, ref: 'User',     required: true }) userId:     Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Endpoint' })                 endpointId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true }) name:        string;
  @Prop({ type: String, trim: true }) description: string;
  @Prop({
    enum: ['remove_fields', 'rename_keys', 'add_fields', 'filter', 'custom_js'],
    default: 'remove_fields',
  })
  type: string;
  @Prop({ type: Object }) config: Record<string, any>;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: 0 })    order:    number;
}
export const TransformationSchema = SchemaFactory.createForClass(Transformation);
export type TransformationDocument = Transformation & Document;

TransformationSchema.index(
  { endpointId: 1, isActive: 1, order: 1 },
  {
    partialFilterExpression: { isActive: true },
    name: 'idx_endpoint_active_order_partial',
  },
);

TransformationSchema.index(
  { userId: 1, isActive: 1 },
  { name: 'idx_user_active' },
);
