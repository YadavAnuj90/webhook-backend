import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum InvoiceStatus {
  DRAFT         = 'draft',
  OPEN          = 'open',
  PAID          = 'paid',
  VOID          = 'void',
  UNCOLLECTIBLE = 'uncollectible',
}

export enum InvoiceType {
  SUBSCRIPTION = 'subscription',
  USAGE        = 'usage',
  CREDIT       = 'credit',
  MANUAL       = 'manual',
}

@Schema({ timestamps: true })
export class Invoice extends Document {
  @Prop({ required: true }) userId: string;
  @Prop({ type: String, default: null }) resellerId: string | null;
  @Prop({ type: String, default: null }) customerId: string | null;

  @Prop({ required: true, enum: InvoiceType }) type: InvoiceType;
  @Prop({ default: InvoiceStatus.OPEN, enum: InvoiceStatus }) status: InvoiceStatus;

  @Prop({ unique: true }) invoiceNumber: string;

  @Prop({ required: true }) periodStart: Date;
  @Prop({ required: true }) periodEnd: Date;

  @Prop({
    type: [{ description: String, quantity: Number, unitPrice: Number, amount: Number }],
    default: [],
  })
  lineItems: { description: string; quantity: number; unitPrice: number; amount: number }[];

  @Prop({ default: 0 }) subtotal: number;
  @Prop({ default: 0 }) tax: number;
  @Prop({ default: 0 }) total: number;
  @Prop({ default: 'INR' }) currency: string;

  @Prop({ type: String, default: null }) razorpayOrderId: string;
  @Prop({ type: String, default: null }) razorpayPaymentId: string;
  @Prop({ type: Date,   default: null }) paidAt: Date;

  @Prop({ default: 0 }) eventsDelivered: number;
  @Prop({ default: 0 }) pricePerThousand: number;

  @Prop({ type: String, default: null }) notes: string;
  @Prop({ type: Date,   default: null }) dueDate: Date;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);
InvoiceSchema.index({ userId: 1, status: 1 });
InvoiceSchema.index({ resellerId: 1 });
InvoiceSchema.index({ customerId: 1 });
InvoiceSchema.index({ createdAt: -1 });
