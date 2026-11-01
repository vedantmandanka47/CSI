import { AssetsService } from '../../../../../apps/api/src/modules/workspaces/assets.service.js';
import { WorkspacesService } from '../../../../../apps/api/src/modules/workspaces/workspaces.service.js';
import { WorkspaceAssetStorageService } from '../../../../../apps/api/src/modules/workspaces/workspace-asset-storage.service.js';
import { PrismaService } from '../../../../../apps/api/src/infra/prisma/prisma.service.js';
import { RoleCode, ErrorCode, AssetCategory, AssetStatus } from '@csi/shared';
import { ForbiddenException } from '@nestjs/common';
import { createHash } from 'crypto';

type MockPrisma = {
  committeeAsset: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  event: {
    findUnique: jest.Mock;
  };
  task: {
    findFirst: jest.Mock;
  };
  auditLog: {
    create: jest.Mock;
  };
};

type MockStorage = {
  saveAssetFile: jest.Mock;
  getAssetFile: jest.Mock;
  hasAssetFile: jest.Mock;
  deleteAssetFile: jest.Mock;
};

describe('AssetsService (Unit)', () => {
  let service: AssetsService;
  let mockPrisma: MockPrisma;
  let mockWorkspacesService: {
    validateCommitteeAccess: jest.Mock;
  };
  let mockStorage: MockStorage;

  const mockCommittee = {
    id: '11111111-1111-1111-1111-111111111111',
    code: 'graphics',
    name: 'Design & Media',
    description: 'Visual branding',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    mockPrisma = {
      committeeAsset: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      event: {
        findUnique: jest.fn(),
      },
      task: {
        findFirst: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-asset-1' }),
      },
    };

    mockWorkspacesService = {
      validateCommitteeAccess: jest.fn().mockResolvedValue({
        committee: mockCommittee,
        isExecutive: false,
        activeRoleCode: RoleCode.COMMITTEE,
        activeTermStart: '2026-08-01T00:00:00.000Z',
        activeTermEnd: null,
      }),
    };

    mockStorage = {
      saveAssetFile: jest.fn(),
      getAssetFile: jest.fn(),
      hasAssetFile: jest.fn(),
      deleteAssetFile: jest.fn(),
    };

    service = new AssetsService(
      mockPrisma as unknown as PrismaService,
      mockWorkspacesService as unknown as WorkspacesService,
      mockStorage as unknown as WorkspaceAssetStorageService,
    );
  });

  describe('uploadAsset', () => {
    it('should upload asset, persist via storage service and log audit event', async () => {
      const dummyBuffer = Buffer.from('fake-png-content');
      const hash = createHash('sha256').update(dummyBuffer).digest('hex');

      mockStorage.saveAssetFile.mockResolvedValue({
        storagePath: `${mockCommittee.id}/asset-1_poster.png`,
        fileHash: hash,
        fileSizeBytes: dummyBuffer.length,
        mimeType: 'image/png',
      });

      mockPrisma.committeeAsset.create.mockResolvedValue({
        id: 'asset-1',
        committeeId: mockCommittee.id,
        committee: mockCommittee,
        eventId: null,
        event: null,
        taskId: null,
        title: 'Tech Fest Poster',
        category: AssetCategory.POSTER,
        fileName: 'poster.png',
        storagePath: `${mockCommittee.id}/asset-1_poster.png`,
        fileSizeBytes: dummyBuffer.length,
        mimeType: 'image/png',
        fileHash: hash,
        status: AssetStatus.DRAFT,
        reviewNotes: null,
        reviewedById: null,
        reviewedBy: null,
        reviewedAt: null,
        uploadedById: 'user-designer',
        uploadedBy: { id: 'user-designer', name: 'Designer', email: 'designer@gcet.edu.in' },
        createdAt: new Date('2026-11-01T00:00:00Z'),
        updatedAt: new Date('2026-11-01T00:00:00Z'),
      });

      const result = await service.uploadAsset(
        'user-designer',
        [RoleCode.COMMITTEE],
        'graphics',
        {
          title: 'Tech Fest Poster',
          category: AssetCategory.POSTER,
          fileName: 'poster.png',
          fileBase64: 'data:image/png;base64,ZmFrZS1wbmctY29udGVudA==',
        },
      );

      expect(result.id).toBe('asset-1');
      expect(result.status).toBe(AssetStatus.DRAFT);
      expect(mockStorage.saveAssetFile).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'asset.uploaded',
          }),
        }),
      );
    });
  });

  describe('downloadAsset', () => {
    it('should throw ConflictException if asset file is missing from disk', async () => {
      mockPrisma.committeeAsset.findFirst.mockResolvedValue({
        id: 'asset-1',
        committeeId: mockCommittee.id,
        storagePath: 'missing-file.png',
        fileHash: 'expected-hash',
      });
      mockStorage.hasAssetFile.mockReturnValue(false);

      await expect(
        service.downloadAsset('user-1', [RoleCode.COMMITTEE], 'graphics', 'asset-1'),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.ASSET_FILE_UNAVAILABLE,
        },
      });
    });

    it('should throw ConflictException if file SHA-256 hash does not match database record', async () => {
      const tamperedBuffer = Buffer.from('tampered content');
      mockPrisma.committeeAsset.findFirst.mockResolvedValue({
        id: 'asset-1',
        committeeId: mockCommittee.id,
        storagePath: 'valid-path.png',
        fileHash: 'different-expected-hash',
        fileName: 'poster.png',
        mimeType: 'image/png',
      });
      mockStorage.hasAssetFile.mockReturnValue(true);
      mockStorage.getAssetFile.mockResolvedValue(tamperedBuffer);

      await expect(
        service.downloadAsset('user-1', [RoleCode.COMMITTEE], 'graphics', 'asset-1'),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.ASSET_INTEGRITY_MISMATCH,
        },
      });
    });

    it('should return buffer when hash matches', async () => {
      const validBuffer = Buffer.from('legitimate content');
      const hash = createHash('sha256').update(validBuffer).digest('hex');

      mockPrisma.committeeAsset.findFirst.mockResolvedValue({
        id: 'asset-1',
        committeeId: mockCommittee.id,
        storagePath: 'valid-path.png',
        fileHash: hash,
        fileName: 'poster.png',
        mimeType: 'image/png',
      });
      mockStorage.hasAssetFile.mockReturnValue(true);
      mockStorage.getAssetFile.mockResolvedValue(validBuffer);

      const result = await service.downloadAsset('user-1', [RoleCode.COMMITTEE], 'graphics', 'asset-1');
      expect(result.buffer).toEqual(validBuffer);
      expect(result.fileName).toBe('poster.png');
    });
  });

  describe('reviewAsset', () => {
    it('should throw ForbiddenException if regular volunteer attempts to review', async () => {
      mockWorkspacesService.validateCommitteeAccess.mockResolvedValue({
        committee: mockCommittee,
        isExecutive: false,
        activeRoleCode: RoleCode.COMMITTEE,
        activeTermStart: '2026-08-01T00:00:00.000Z',
        activeTermEnd: null,
      });

      await expect(
        service.reviewAsset('user-volunteer', [RoleCode.COMMITTEE], 'graphics', 'asset-1', {
          status: AssetStatus.APPROVED,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should approve asset when reviewed by CORE lead', async () => {
      mockWorkspacesService.validateCommitteeAccess.mockResolvedValue({
        committee: mockCommittee,
        isExecutive: false,
        activeRoleCode: RoleCode.CORE,
        activeTermStart: '2026-08-01T00:00:00.000Z',
        activeTermEnd: null,
      });

      mockPrisma.committeeAsset.findFirst.mockResolvedValue({
        id: 'asset-1',
        committeeId: mockCommittee.id,
        status: AssetStatus.DRAFT,
      });

      mockPrisma.committeeAsset.update.mockResolvedValue({
        id: 'asset-1',
        committeeId: mockCommittee.id,
        committee: mockCommittee,
        eventId: null,
        event: null,
        taskId: null,
        title: 'Approved Poster',
        category: AssetCategory.POSTER,
        fileName: 'poster.png',
        fileSizeBytes: 100,
        mimeType: 'image/png',
        fileHash: 'hash-value',
        status: AssetStatus.APPROVED,
        reviewNotes: 'Looks clean and complies with branding',
        reviewedById: 'user-lead',
        reviewedBy: { id: 'user-lead', name: 'Lead User', email: 'lead@gcet.edu.in' },
        reviewedAt: new Date('2026-11-01T12:00:00Z'),
        uploadedById: 'user-designer',
        uploadedBy: { id: 'user-designer', name: 'Designer', email: 'designer@gcet.edu.in' },
        createdAt: new Date('2026-11-01T00:00:00Z'),
        updatedAt: new Date('2026-11-01T12:00:00Z'),
      });

      const result = await service.reviewAsset(
        'user-lead',
        [RoleCode.CORE],
        'graphics',
        'asset-1',
        {
          status: AssetStatus.APPROVED,
          reviewNotes: 'Looks clean and complies with branding',
        },
      );

      expect(result.status).toBe(AssetStatus.APPROVED);
      expect(result.reviewedById).toBe('user-lead');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'asset.reviewed',
          }),
        }),
      );
    });
  });
});
