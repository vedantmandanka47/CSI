import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from '../../../../../apps/api/src/infra/email/email.service.js';
import { env } from '../../../../../apps/api/src/config/env.js';

describe('EmailService (TASK-003 / B03 / F02 / CR-003)', () => {
  let service: EmailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailService],
    }).compile();

    service = module.get<EmailService>(EmailService);
    service.clearSentEmails();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendVerificationEmail', () => {
    it('generates branded HTML & text verification email and records it in memory', async () => {
      const recipient = 'student@gcet.ac.in';
      const name = 'Student Name';
      const token = 'sample-verification-token-xyz-123';

      const result = await service.sendVerificationEmail(recipient, name, token);

      expect(result).toBe(true);
      const emails = service.getSentEmails();
      expect(emails).toHaveLength(1);

      const sent = emails[0]!;
      expect(sent).toBeDefined();
      expect(sent.to).toBe(recipient);
      expect(sent.from).toBe(env.MAIL_FROM);
      expect(sent.subject).toBe('Verify your CSI GCET Account');
      expect(sent.token).toBe(token);

      // Verify link formation
      const expectedUrl = `${env.PUBLIC_APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
      expect(sent.text).toContain(expectedUrl);
      expect(sent.text).toContain(name);
      expect(sent.html).toContain(expectedUrl);
      expect(sent.html).toContain('Verify Email Address');
      expect(sent.html).toContain('CSI GCET Student Branch');
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('generates branded HTML & text password reset email and records it in memory', async () => {
      const recipient = 'student@gcet.ac.in';
      const name = 'Student Name';
      const token = 'sample-reset-token-abc-789';

      const result = await service.sendPasswordResetEmail(recipient, name, token);

      expect(result).toBe(true);
      const emails = service.getSentEmails();
      expect(emails).toHaveLength(1);

      const sent = emails[0]!;
      expect(sent).toBeDefined();
      expect(sent.to).toBe(recipient);
      expect(sent.from).toBe(env.MAIL_FROM);
      expect(sent.subject).toBe('Reset your CSI GCET Account Password');
      expect(sent.token).toBe(token);

      // Verify link formation
      const expectedUrl = `${env.PUBLIC_APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
      expect(sent.text).toContain(expectedUrl);
      expect(sent.text).toContain(name);
      expect(sent.html).toContain(expectedUrl);
      expect(sent.html).toContain('Reset Password');
      expect(sent.html).toContain('CSI GCET Student Branch');
    });
  });

  describe('queue tracking and isolation', () => {
    it('tracks multiple emails in sequence and clears when requested', async () => {
      await service.sendVerificationEmail('user1@gcet.ac.in', 'User 1', 'token-1');
      await service.sendPasswordResetEmail('user2@gcet.ac.in', 'User 2', 'token-2');

      expect(service.getSentEmails()).toHaveLength(2);
      expect(service.getLastSentEmail()?.to).toBe('user2@gcet.ac.in');

      service.clearSentEmails();
      expect(service.getSentEmails()).toHaveLength(0);
      expect(service.getLastSentEmail()).toBeUndefined();
    });
  });
});
