import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter, type SendMailOptions as NodemailerMailOptions } from 'nodemailer';
import { env } from '../../config/env.js';

export interface SentEmailRecord {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  token?: string;
  timestamp: Date;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
  token?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private sentEmails: SentEmailRecord[] = [];

  constructor() {
    this.initTransporter();
  }

  private initTransporter(): void {
    if (env.NODE_ENV === 'test') {
      // In test mode, email delivery is recorded in-memory for assertion
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: env.MAIL_HOST,
        port: env.MAIL_PORT,
        secure: env.MAIL_PORT === 465,
        auth:
          env.MAIL_USER && env.MAIL_PASS
            ? {
                user: env.MAIL_USER,
                pass: env.MAIL_PASS,
              }
            : undefined,
      });
      this.logger.log(`Initialized SMTP transport pointing to ${env.MAIL_HOST}:${env.MAIL_PORT}`);
    } catch (err) {
      this.logger.error(`Failed to initialize SMTP transporter: ${(err as Error).message}`);
    }
  }

  /**
   * Returns copy of dispatched emails (useful in tests and dev introspection)
   */
  getSentEmails(): SentEmailRecord[] {
    return [...this.sentEmails];
  }

  /**
   * Returns the most recent dispatched email
   */
  getLastSentEmail(): SentEmailRecord | undefined {
    return this.sentEmails[this.sentEmails.length - 1];
  }

  /**
   * Clears in-memory dispatched email records
   */
  clearSentEmails(): void {
    this.sentEmails = [];
  }

  /**
   * Sends transactional signup email verification link
   */
  async sendVerificationEmail(to: string, name: string, token: string): Promise<boolean> {
    const verifyUrl = `${env.PUBLIC_APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
    const subject = 'Verify your CSI GCET Account';

    const text =
      `Hello ${name},\n\n` +
      `Thank you for registering with the CSI GCET Student Branch.\n\n` +
      `Please verify your institutional email address by visiting the following link:\n` +
      `${verifyUrl}\n\n` +
      `This verification link will expire in 24 hours.\n\n` +
      `If you did not request this registration, please disregard this email.\n\n` +
      `Best regards,\n` +
      `CSI GCET Student Branch Team`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f9; color: #1f2937; margin: 0; padding: 24px; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden; }
    .header { background: #1a365d; padding: 28px 32px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 20px; font-weight: 600; letter-spacing: 0.5px; }
    .content { padding: 32px; }
    .button-container { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px; }
    .footer { padding: 20px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center; }
    .url-fallback { word-break: break-all; color: #2563eb; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>CSI GCET Student Branch</h1>
    </div>
    <div class="content">
      <h2 style="font-size: 18px; margin-top: 0; color: #111827;">Verify Your Email Address</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #374151;">Hello ${name},</p>
      <p style="font-size: 14px; line-height: 1.6; color: #374151;">
        Thank you for joining the Computer Society of India Student Branch at GCET. To activate your membership and access the platform, please verify your email address.
      </p>
      <div class="button-container">
        <a href="${verifyUrl}" class="btn" target="_blank" rel="noopener noreferrer">Verify Email Address</a>
      </div>
      <p style="font-size: 12px; color: #6b7280; margin-top: 24px;">
        If the button above does not work, copy and paste this URL into your browser:
      </p>
      <p class="url-fallback"><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">
        This single-use link expires in 24 hours. If you did not create an account, you can safely ignore this email.
      </p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} CSI GCET Student Branch &bull; G H Patel College of Engineering &amp; Technology
    </div>
  </div>
</body>
</html>
`;

    return this.sendMail({
      to,
      subject,
      text,
      html,
      token,
    });
  }

  /**
   * Sends transactional password reset instructions
   */
  async sendPasswordResetEmail(to: string, name: string, token: string): Promise<boolean> {
    const resetUrl = `${env.PUBLIC_APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
    const subject = 'Reset your CSI GCET Account Password';

    const text =
      `Hello ${name},\n\n` +
      `We received a request to reset the password for your CSI GCET account.\n\n` +
      `You can reset your password using the following link:\n` +
      `${resetUrl}\n\n` +
      `This link is single-use and will expire in 1 hour.\n\n` +
      `If you did not request a password reset, you can safely disregard this email or notify security.\n\n` +
      `Best regards,\n` +
      `CSI GCET Student Branch Security Team`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f9; color: #1f2937; margin: 0; padding: 24px; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden; }
    .header { background: #1a365d; padding: 28px 32px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 20px; font-weight: 600; letter-spacing: 0.5px; }
    .content { padding: 32px; }
    .button-container { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background: #dc2626; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px; }
    .footer { padding: 20px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center; }
    .url-fallback { word-break: break-all; color: #2563eb; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>CSI GCET Student Branch</h1>
    </div>
    <div class="content">
      <h2 style="font-size: 18px; margin-top: 0; color: #111827;">Password Reset Request</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #374151;">Hello ${name},</p>
      <p style="font-size: 14px; line-height: 1.6; color: #374151;">
        A password reset request was initiated for your CSI GCET account. Click the button below to set a new secure password.
      </p>
      <div class="button-container">
        <a href="${resetUrl}" class="btn" target="_blank" rel="noopener noreferrer">Reset Password</a>
      </div>
      <p style="font-size: 12px; color: #6b7280; margin-top: 24px;">
        If the button above does not work, copy and paste this URL into your browser:
      </p>
      <p class="url-fallback"><a href="${resetUrl}">${resetUrl}</a></p>
      <p style="font-size: 12px; color: #dc2626; margin-top: 24px; font-weight: 500;">
        This single-use link expires in 1 hour. If you did not request this change, please ignore this email; your account remains secure.
      </p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} CSI GCET Student Branch &bull; G H Patel College of Engineering &amp; Technology
    </div>
  </div>
</body>
</html>
`;

    return this.sendMail({
      to,
      subject,
      text,
      html,
      token,
    });
  }

  /**
   * Internal email dispatch with logging, test tracking, and error handling
   */
  async sendMail(options: SendMailOptions): Promise<boolean> {
    const record: SentEmailRecord = {
      to: options.to,
      from: env.MAIL_FROM,
      subject: options.subject,
      text: options.text,
      html: options.html,
      token: options.token,
      timestamp: new Date(),
    };

    this.sentEmails.push(record);

    if (env.NODE_ENV === 'test') {
      this.logger.debug(`[TEST] Captured outbound email to ${options.to} ('${options.subject}')`);
      return true;
    }

    if (!this.transporter) {
      this.logger.warn(
        `Email transport not configured. Mocked delivery to ${options.to}: ${options.subject}`,
      );
      return false;
    }

    try {
      await this.sendWithRetry({
        from: env.MAIL_FROM,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
      this.logger.log(`Successfully dispatched email to ${options.to} ('${options.subject}')`);
      return true;
    } catch (err) {
      if (env.NODE_ENV === 'development') {
        this.logger.warn(
          `[DEV] SMTP delivery failed to ${options.to} (${(err as Error).message}). Continuing in dev mode.`,
        );
        return false;
      }
      this.logger.error(
        `Failed to deliver email to ${options.to}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err;
    }
  }

  private async sendWithRetry(
    mailData: NodemailerMailOptions,
    maxRetries = 2,
  ): Promise<void> {
    let attempts = 0;
    while (attempts <= maxRetries) {
      try {
        if (!this.transporter) throw new Error('Transporter not initialized');
        await this.transporter.sendMail(mailData);
        return;
      } catch (err) {
        attempts++;
        if (attempts > maxRetries) throw err;
        const delayMs = attempts * 300;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
}
