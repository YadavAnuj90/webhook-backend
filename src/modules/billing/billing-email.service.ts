import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class BillingEmailService {
  private readonly logger = new Logger(BillingEmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
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

  private async send(to: string, subject: string, html: string) {
    if (!this.config.get('SMTP_HOST')) {
      this.logger.warn(`Email not sent (SMTP not configured): ${subject} → ${to}`);
      return;
    }
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
      this.logger.log(`Email sent: ${subject} → ${to}`);
    } catch (err: any) {
      this.logger.error(`Email failed: ${subject} → ${to}: ${err.message}`);
    }
  }

  async sendVerificationEmail(to: string, firstName: string, token: string) {
    const url = `${this.config.get('FRONTEND_URL') || 'http://localhost:3001'}/auth/verify-email?token=${token}`;
    await this.send(to, 'Verify your WebhookOS email', `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2>Welcome to WebhookOS, ${firstName}!</h2>
        <p>Your 10-day free trial has started. Please verify your email to keep access.</p>
        <a href="${url}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0">
          Verify Email
        </a>
        <p style="color:#888;font-size:13px">Link expires in 24 hours. If you didn't register, ignore this email.</p>
      </div>
    `);
  }

  async sendPasswordReset(to: string, firstName: string, token: string) {
    const url = `${this.config.get('FRONTEND_URL') || 'http://localhost:3001'}/auth/reset-password?token=${token}`;
    await this.send(to, 'Reset your WebhookOS password', `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2>Hi ${firstName}, reset your password</h2>
        <p>We received a request to reset your WebhookOS password. Click the button below to choose a new one.</p>
        <a href="${url}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0">
          Reset Password
        </a>
        <p style="color:#888;font-size:13px">This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email.</p>
      </div>
    `);
  }

  async sendTrialWarning(to: string, firstName: string, daysLeft: number) {
    const upgradeUrl = `${this.config.get('FRONTEND_URL') || 'http://localhost:3001'}/billing`;
    await this.send(to, `⚠️ Your WebhookOS trial expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`, `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2>Hi ${firstName}, your free trial ends soon</h2>
        <p>You have <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong> left on your WebhookOS free trial.</p>
        <p>Upgrade now to keep your webhooks running without interruption.</p>
        <a href="${upgradeUrl}" style="background:#f59e0b;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0">
          Upgrade Plan
        </a>
        <p style="color:#888;font-size:13px">After the trial, webhook delivery will be paused until you upgrade.</p>
      </div>
    `);
  }

  async sendTrialExpired(to: string, firstName: string) {
    const upgradeUrl = `${this.config.get('FRONTEND_URL') || 'http://localhost:3001'}/billing`;
    await this.send(to, '🔴 Your WebhookOS trial has expired', `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2>Hi ${firstName}, your trial has ended</h2>
        <p>Your 10-day free trial has expired. Webhook delivery is currently paused.</p>
        <p>Choose a plan to resume — or purchase credits for pay-as-you-go access.</p>
        <a href="${upgradeUrl}" style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0">
          Reactivate Account
        </a>
      </div>
    `);
  }

  async sendInvoice(to: string, firstName: string, invoice: {
    invoiceNumber: string; total: number; currency: string;
    periodStart: Date; periodEnd: Date; type: string;
  }) {
    const amount = (invoice.total / 100).toFixed(2);
    const symbol = invoice.currency === 'INR' ? '₹' : '$';
    const invoiceUrl = `${this.config.get('FRONTEND_URL') || 'http://localhost:3001'}/billing/invoices`;
    await this.send(to, `Invoice ${invoice.invoiceNumber} — ${symbol}${amount}`, `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2>Invoice from WebhookOS</h2>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;color:#888">Invoice #</td><td style="padding:8px"><strong>${invoice.invoiceNumber}</strong></td></tr>
          <tr><td style="padding:8px;color:#888">Amount</td><td style="padding:8px"><strong>${symbol}${amount}</strong></td></tr>
          <tr><td style="padding:8px;color:#888">Period</td><td style="padding:8px">${invoice.periodStart.toDateString()} – ${invoice.periodEnd.toDateString()}</td></tr>
          <tr><td style="padding:8px;color:#888">Type</td><td style="padding:8px">${invoice.type}</td></tr>
        </table>
        <a href="${invoiceUrl}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">
          View Invoice
        </a>
        <p style="color:#888;font-size:13px;margin-top:16px">Thank you for using WebhookOS.</p>
      </div>
    `);
  }

  async sendPaymentFailed(to: string, firstName: string) {
    const billingUrl = `${this.config.get('FRONTEND_URL') || 'http://localhost:3001'}/billing`;
    await this.send(to, '⚠️ WebhookOS payment failed', `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2>Hi ${firstName}, your payment failed</h2>
        <p>We couldn't process your payment. Please update your payment method to keep your subscription active.</p>
        <a href="${billingUrl}" style="background:#f59e0b;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0">
          Update Payment Method
        </a>
      </div>
    `);
  }
}
