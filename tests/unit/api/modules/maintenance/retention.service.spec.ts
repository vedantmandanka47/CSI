import { Test, TestingModule } from '@nestjs/testing';
import { RetentionService } from '../../../../../apps/api/src/modules/maintenance/retention.service.js';
import { PrismaService } from '../../../../../apps/api/src/infra/prisma/prisma.service.js';

describe('RetentionService (DPDP Privacy & AUD-PRIV-01)', () => {
  let service: RetentionService;
  let mockPrisma: {
    session: { deleteMany: jest.Mock };
    verificationToken: { deleteMany: jest.Mock };
    passwordResetToken: { deleteMany: jest.Mock };
    idempotencyKey: { deleteMany: jest.Mock };
    event: { findMany: jest.Mock };
    eventGuest: { findMany: jest.Mock; update: jest.Mock };
    auditLog: { create: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      session: { deleteMany: jest.fn().mockResolvedValue({ count: 5 }) },
      verificationToken: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
      passwordResetToken: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      idempotencyKey: { deleteMany: jest.fn().mockResolvedValue({ count: 4 }) },
      event: { findMany: jest.fn().mockResolvedValue([{ id: 'event-old-1' }]) },
      eventGuest: {
        findMany: jest.fn().mockResolvedValue([{ id: 'guest-1' }, { id: 'guest-2' }]),
        update: jest.fn().mockResolvedValue({ id: 'guest-1', status: 'anonymized' }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetentionService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<RetentionService>(RetentionService);
  });

  it('purgeExpiredSessions deletes sessions older than current timestamp', async () => {
    const count = await service.purgeExpiredSessions();
    expect(count).toBe(5);
    expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
  });

  it('purgeExpiredTokens deletes expired email verification and password reset tokens', async () => {
    const count = await service.purgeExpiredTokens();
    expect(count).toBe(5); // 3 + 2
    expect(mockPrisma.verificationToken.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.passwordResetToken.deleteMany).toHaveBeenCalled();
  });

  it('purgeExpiredIdempotencyKeys deletes expired idempotency records', async () => {
    const count = await service.purgeExpiredIdempotencyKeys();
    expect(count).toBe(4);
    expect(mockPrisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
  });

  it('anonymizes concluded event guest personal data (DPDP Act 2023)', async () => {
    const count = await service.anonymizeConcludedEventGuests(90);
    expect(count).toBe(2);
    expect(mockPrisma.event.findMany).toHaveBeenCalledWith({
      where: { endsAt: { lt: expect.any(Date) } },
      select: { id: true },
    });
    expect(mockPrisma.eventGuest.update).toHaveBeenCalledTimes(2);
    expect(mockPrisma.eventGuest.update).toHaveBeenCalledWith({
      where: { id: 'guest-1' },
      data: {
        name: 'Anonymized Guest',
        email: 'anonymized-guest-1@anonymized.local',
        college: 'Anonymized',
        phone: '0000000000',
        status: 'anonymized',
      },
    });
  });

  it('runRetentionPurge aggregates metrics and logs audit trail', async () => {
    const summary = await service.runRetentionPurge('admin-1', 90);

    expect(summary.sessionsPurged).toBe(5);
    expect(summary.tokensPurged).toBe(5);
    expect(summary.idempotencyKeysPurged).toBe(4);
    expect(summary.guestsAnonymized).toBe(2);
    expect(summary.executedAt).toBeDefined();

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'admin-1',
        action: 'RETENTION_PURGE_EXECUTED',
        targetType: 'system',
        targetId: null,
        afterJson: expect.objectContaining({
          sessionsPurged: 5,
          guestsAnonymized: 2,
        }),
      },
    });
  });
});

