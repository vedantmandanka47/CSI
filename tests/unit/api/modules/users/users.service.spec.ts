import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../../../../../apps/api/src/modules/users/users.service.js';
import { PrismaService } from '../../../../../apps/api/src/infra/prisma/prisma.service.js';
import { NotFoundException } from '@nestjs/common';
import { UserStatus } from '@csi/shared';

describe('UsersService', () => {
  let service: UsersService;
  let mockPrisma: {
    user: {
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    auditLog: {
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const sampleUser = {
    id: 'u1',
    enrollmentNo: '21CP001',
    name: 'Test Student',
    email: 'student@gcet.ac.in',
    phone: '9876543210',
    branch: 'CP',
    year: 3,
    photo: null,
    status: 'active',
    passwordHash: '$argon2id$fakehash',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    roleAssignments: [
      {
        id: 'ra1',
        userId: 'u1',
        roleId: 'r2',
        committeeId: null,
        termStart: new Date('2026-01-01'),
        termEnd: null,
        role: { id: 'r2', code: 'member', name: 'Member' },
        committee: null,
      },
    ],
  };

  beforeEach(async () => {
    mockPrisma = {
      user: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([sampleUser]),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === 'u1') return Promise.resolve(sampleUser);
          return Promise.resolve(null);
        }),
        update: jest.fn().mockResolvedValue({
          ...sampleUser,
          status: 'inactive',
        }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'a1' }),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(mockPrisma);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('findAll returns paginated users and metadata', async () => {
    const result = await service.findAll({ page: 1, per_page: 10 });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe('u1');
    expect(result.data[0]?.email).toBe('student@gcet.ac.in');
    expect(result.meta.total).toBe(1);
    expect(result.meta.total_pages).toBe(1);
  });

  it('findById returns user with active role assignments and effective roles', async () => {
    const user = await service.findById('u1');
    expect(user.id).toBe('u1');
    expect(user.effective_roles).toContain('member');
    expect(user.role_assignments).toHaveLength(1);
    expect(user.role_assignments[0]?.role_code).toBe('member');
  });

  it('findById throws NotFoundException when user does not exist', async () => {
    await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('updateStatus updates user and writes immutable audit log entry in transaction', async () => {
    const updated = await service.updateStatus('u1', UserStatus.INACTIVE, 'admin-1', 'Term ended');

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'admin-1',
        action: 'USER_STATUS_UPDATE',
        targetType: 'users',
        targetId: 'u1',
        beforeJson: { status: 'active' },
        afterJson: { status: UserStatus.INACTIVE, reason: 'Term ended' },
      },
    });
    expect(updated.status).toBe(UserStatus.INACTIVE);
  });
});
