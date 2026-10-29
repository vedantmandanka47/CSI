import { Test, TestingModule } from '@nestjs/testing';
import { RolesService } from './roles.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { NotFoundException } from '@nestjs/common';

describe('RolesService', () => {
  let service: RolesService;
  let mockPrisma: {
    role: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  const sampleRoles = [
    {
      id: 'r1',
      code: 'admin',
      name: 'Administrator',
      description: 'System administrator',
      createdAt: new Date('2026-01-01'),
    },
    {
      id: 'r2',
      code: 'member',
      name: 'Member',
      description: 'General member',
      createdAt: new Date('2026-01-01'),
    },
  ];

  beforeEach(async () => {
    mockPrisma = {
      role: {
        findMany: jest.fn().mockResolvedValue(sampleRoles),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const found = sampleRoles.find((r) => r.code === where.code);
          return Promise.resolve(found || null);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  it('findAll returns all roles formatted with ISO timestamps', async () => {
    const roles = await service.findAll();
    expect(roles).toHaveLength(2);
    expect(roles[0]?.code).toBe('admin');
    expect(roles[0]?.created_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('findByCode returns a matching role', async () => {
    const role = await service.findByCode('admin');
    expect(role.id).toBe('r1');
    expect(role.name).toBe('Administrator');
  });

  it('findByCode throws NotFoundException when role code does not exist', async () => {
    await expect(service.findByCode('nonexistent')).rejects.toThrow(NotFoundException);
  });
});
