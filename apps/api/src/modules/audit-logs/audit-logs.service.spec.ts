import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogsService } from './audit-logs.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

describe('AuditLogsService (SEC-23)', () => {
  let service: AuditLogsService;
  let mockPrisma: {
    auditLog: {
      count: jest.Mock;
      findMany: jest.Mock;
    };
  };

  const sampleDate = new Date('2026-10-29T10:00:00.000Z');
  const sampleLog = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    actorId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    action: 'AUTH_LOGIN_SUCCESS',
    targetType: 'sessions',
    targetId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
    beforeJson: null,
    afterJson: { ip: '127.0.0.1' },
    ip: '127.0.0.1',
    createdAt: sampleDate,
  };

  beforeEach(async () => {
    mockPrisma = {
      auditLog: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([sampleLog]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<AuditLogsService>(AuditLogsService);
  });

  it('findAll returns paginated records and metadata', async () => {
    const result = await service.findAll({ page: 1, per_page: 10 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.action).toBe('AUTH_LOGIN_SUCCESS');
    expect(result.data[0]?.ip).toBe('127.0.0.1');
    expect(result.meta.total).toBe(1);
    expect(result.meta.total_pages).toBe(1);
  });

  it('findAll filters by action, actor_id, and date range', async () => {
    await service.findAll({
      page: 2,
      per_page: 5,
      action: 'USER_STATUS_UPDATE',
      actor_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      from_date: '2026-10-01T00:00:00.000Z',
      to_date: '2026-10-31T23:59:59.000Z',
    });

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        action: { equals: 'USER_STATUS_UPDATE' },
        actorId: { equals: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' },
        createdAt: {
          gte: new Date('2026-10-01T00:00:00.000Z'),
          lte: new Date('2026-10-31T23:59:59.000Z'),
        },
      },
      skip: 5,
      take: 5,
      orderBy: { createdAt: 'desc' },
    });
  });
});
