import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Transformation — applied in order on every delivery to an endpoint.
 *
 * DBA decisions:
 * - Compound index { endpointId, isActive, order } covers the hot query:
 *     find({ endpointId, isActive:true }).sort({ order:1 })
 *   This is a fully covered index — no collection scan needed.
 * - Partial index variant for user management page (userId, isActive)
 */
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
  @Prop({ default: 0 })    order:    number;   // execution order — sort ascending
}
export const TransformationSchema = SchemaFactory.createForClass(Transformation);
export type TransformationDocument = Transformation & Document;

// HOT PATH: get ordered active transformations for an endpoint
TransformationSchema.index(
  { endpointId: 1, isActive: 1, order: 1 },
  {
    partialFilterExpression: { isActive: true },
    name: 'idx_endpoint_active_order_partial',
  },
);

// User's transformation management page
TransformationSchema.index(
  { userId: 1, isActive: 1 },
  { name: 'idx_user_active' },
);
