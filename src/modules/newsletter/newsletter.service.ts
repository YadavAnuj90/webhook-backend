import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as crypto from 'crypto';
import { NewsletterSubscriber, NewsletterSubscriberDocument } from './newsletter.schema';

@Injectable()
export class NewsletterService {
  private readonly logger = new Logger(NewsletterService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    @InjectModel(NewsletterSubscriber.name) private subscriberModel: Model<NewsletterSubscriberDocument>,
    private config: ConfigService,
  ) {
    this.transporter = nodemailer.createTransport({
      host:   config.get('SMTP_HOST', 'smtp.gmail.com'),
      port:   +(config.get('SMTP_PORT') || '587'),
      secure: config.get('SMTP_PORT') === '465',
      auth: {
        user: config.get('SMTP_USER'),
        pass: config.get('SMTP_PASS'),
      },
    });
  }

  private get from() {
    return this.config.get('FROM_EMAIL') || 'noreply@webhookos.io';
  }

  async subscribe(email: string, meta?: { ip?: string; ua?: string; source?: string }) {
    const normalised = email.toLowerCase().trim();

    // Check for existing subscriber
    const existing = await this.subscriberModel.findOne({ email: normalised });

    if (existing) {
      if (existing.status === 'active') {
        throw new ConflictException('This email is already subscribed.');
      }
      // Resubscribe if previously unsubscribed
      existing.status = 'active';
      existing.unsubscribedAt = undefined;
      existing.confirmToken = crypto.randomBytes(32).toString('hex');
      await existing.save();
      await this.sendWelcomeEmail(normalised, existing.confirmToken);
      return { message: 'Welcome back! You have been resubscribed.' };
    }

    const confirmToken = crypto.randomBytes(32).toString('hex');

    await this.subscriberModel.create({
      email: normalised,
      status: 'active',
      source: meta?.source || 'footer',
      ipAddress: meta?.ip,
      userAgent: meta?.ua,
      confirmToken,
    });

    await this.sendWelcomeEmail(normalised, confirmToken);

    this.logger.log(`Newsletter subscriber added: ${normalised}`);
    return { message: 'Successfully subscribed! Check your inbox for a welcome email.' };
  }

  async unsubscribe(token: string) {
    const sub = await this.subscriberModel.findOne({ confirmToken: token });
    if (!sub) return { message: 'Invalid or expired unsubscribe link.' };

    sub.status = 'unsubscribed';
    sub.unsubscribedAt = new Date();
    await sub.save();

    this.logger.log(`Newsletter unsubscribed: ${sub.email}`);
    return { message: 'You have been unsubscribed. Sorry to see you go!' };
  }

  async getStats() {
    const [active, unsubscribed, total] = await Promise.all([
      this.subscriberModel.countDocuments({ status: 'active' }),
      this.subscriberModel.countDocuments({ status: 'unsubscribed' }),
      this.subscriberModel.countDocuments(),
    ]);
    return { active, unsubscribed, total };
  }

  async listSubscribers(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [subscribers, total] = await Promise.all([
      this.subscriberModel.find({ status: 'active' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('email source createdAt')
        .lean(),
      this.subscriberModel.countDocuments({ status: 'active' }),
    ]);
    return { subscribers, total, page, pages: Math.ceil(total / limit) };
  }

  private async sendWelcomeEmail(email: string, token: string) {
    if (!this.config.get('SMTP_HOST')) {
      this.logger.warn(`Welcome email not sent (SMTP not configured) → ${email}`);
      return;
    }

    const frontendUrl = this.config.get('FRONTEND_URL') || 'http://localhost:3001';
    const unsubUrl = `${frontendUrl}/api/v1/newsletter/unsubscribe?token=${token}`;

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: 'Welcome to the WebhookOS Newsletter',
        html: `
          <div style="font-family:'Inter',system-ui,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;border-radius:16px;overflow:hidden">
            <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:40px 32px;text-align:center">
              <div style="width:48px;height:48px;border-radius:14px;background:rgba(255,255,255,.15);display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px">
                <span style="font-size:22px">&#9889;</span>
              </div>
              <h1 style="color:#fff;font-size:24px;font-weight:800;margin:0 0 8px;letter-spacing:-.5px">You're in!</h1>
              <p style="color:rgba(255,255,255,.7);font-size:14px;margin:0">Welcome to the WebhookOS newsletter.</p>
            </div>
            <div style="padding:32px">
              <p style="color:#94a3b8;font-size:14px;line-height:1.7;margin:0 0 20px">
                Thank you for subscribing. You'll receive updates on:
              </p>
              <div style="margin-bottom:24px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                  <span style="color:#818cf8;font-size:16px">&#10003;</span>
                  <span style="color:#e2e8f0;font-size:13px">Product updates & new features</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                  <span style="color:#818cf8;font-size:16px">&#10003;</span>
                  <span style="color:#e2e8f0;font-size:13px">Engineering deep-dives & best practices</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                  <span style="color:#818cf8;font-size:16px">&#10003;</span>
                  <span style="color:#e2e8f0;font-size:13px">Webhook infrastructure insights</span>
                </div>
              </div>
              <p style="color:#475569;font-size:11px;line-height:1.6;border-top:1px solid rgba(99,102,241,.15);padding-top:16px;margin:0">
                No spam, ever. Unsubscribe anytime.
                <a href="${unsubUrl}" style="color:#818cf8;text-decoration:none"> Unsubscribe</a>
              </p>
            </div>
          </div>
        `,
      });
      this.logger.log(`Welcome email sent → ${email}`);
    } catch (err: any) {
      this.logger.error(`Welcome email failed → ${email}: ${err.message}`);
    }
  }
}
