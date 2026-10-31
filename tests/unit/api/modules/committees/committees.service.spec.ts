import { Test, TestingModule } from '@nestjs/testing';
import { CommitteesService } from '../../../../../apps/api/src/modules/committees/committees.service.js';
import { PrismaService } from '../../../../../apps/api/src/infra/prisma/prisma.service.js';
import { NotFoundException } from '@nestjs/common';

describe('CommitteesService', () => {
  let service: CommitteesService;
  let mockPrisma: {
    committee: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  const sampleCommittees = [
    {
      id: 'c1',
      code: 'technical',
      name: 'Technical Committee',
      description: 'Workshops, hackathons, and labs',
      createdAt: new Date('2026-01-01'),
    },
    {
      id: 'c2',
      code: 'graphics',
      name: 'Graphics Committee',
      description: 'Posters, social media, and banners',
      createdAt: new Date('2026-01-01'),
    },
  ];

  beforeEach(async () => {
    mockPrisma = {
      committee: {
        findMany: jest.fn().mockResolvedValue(sampleCommittees),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const found = sampleCommittees.find((c) => c.code === where.code);
          return Promise.resolve(found || null);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommitteesService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<CommitteesService>(CommitteesService);
  });

  it('findAll returns all committees formatted with ISO timestamps', async () => {
    const committees = await service.findAll();
    expect(committees).toHaveLength(2);
    expect(committees[0]?.code).toBe('technical');
    expect(committees[0]?.created_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('findByCode returns a matching committee', async () => {
    const committee = await service.findByCode('technical');
    expect(committee.id).toBe('c1');
    expect(committee.name).toBe('Technical Committee');
  });

  it('findByCode throws NotFoundException when committee does not exist', async () => {
    await expect(service.findByCode('nonexistent')).rejects.toThrow(NotFoundException);
  });
});
