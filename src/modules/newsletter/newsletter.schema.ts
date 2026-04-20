import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NewsletterSubscriberDocument = NewsletterSubscriber & Document;

@Schema({ timestamps: true, collection: 'newsletter_subscribers' })
export class NewsletterSubscriber {
  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  email: string;

  @Prop({ default: 'active', enum: ['active', 'unsubscribed', 'bounced'] })
  status: string;

  @Prop({ default: null })
  firstName?: string;

  @Prop({ default: 'footer' })
  source: string;

  @Prop({ default: null })
  unsubscribedAt?: Date;

  @Prop({ default: null })
  confirmedAt?: Date;

  @Prop({ default: null })
  confirmToken?: string;

  @Prop({ default: null })
  ipAddress?: string;

  @Prop({ default: null })
  userAgent?: string;
}

export const NewsletterSubscriberSchema = SchemaFactory.createForClass(NewsletterSubscriber);
