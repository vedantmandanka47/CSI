import { Test, TestingModule } from '@nestjs/testing';
import { PublicService } from './public.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

describe('PublicService', () => {
  let service: PublicService;
  let prisma: { user: { count: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      user: {
        count: jest.fn().mockResolvedValue(150),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<PublicService>(PublicService);
  });

  it('returns valid status aggregates and membership drive info', async () => {
    const status = await service.getStatus();
    expect(status).toBeDefined();
    expect(status.aggregates.active_members).toBe(150);
    expect(status.aggregates.total_events).toBeGreaterThanOrEqual(0);
    expect(status.aggregates.certificates_issued).toBeGreaterThanOrEqual(0);
    expect(status.membership_drive.is_open).toBe(true);
    expect(typeof status.membership_drive.message).toBe('string');
  });
});

