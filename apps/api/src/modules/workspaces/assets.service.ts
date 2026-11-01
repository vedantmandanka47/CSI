import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { WorkspacesService } from './workspaces.service.js';
import { WorkspaceAssetStorageService } from './workspace-asset-storage.service.js';
import { createHash, randomUUID } from 'crypto';
import {
  RoleCode,
  ErrorCode,
  UploadAssetInput,
  ReviewAssetInput,
  AssetResponse,
  AssetListResponse,
  AssetStatus,
} from '@csi/shared';

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService,
    private readonly storageService: WorkspaceAssetStorageService,
  ) {}

  /**
   * Parse base64 string or data URI into binary Buffer
   */
  private parseBase64(input: string): { buffer: Buffer; mimeType?: string } {
    const trimmed = input.trim();
    const dataUriMatch = trimmed.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);

    if (dataUriMatch && dataUriMatch[1] && dataUriMatch[2]) {
      return {
        mimeType: dataUriMatch[1],
        buffer: Buffer.from(dataUriMatch[2], 'base64'),
      };
    }

    try {
      return {
        buffer: Buffer.from(trimmed, 'base64'),
      };
    } catch {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid base64 payload provided for asset upload',
      });
    }
  }

  /**
   * Upload and register a new committee media asset (poster, banner, copy, document)
   */
  async uploadAsset(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
    input: UploadAssetInput,
    ip?: string,
  ): Promise<AssetResponse> {
    const { committee } = await this.workspacesService.validateCommitteeAccess(
      userId,
      userRoles,
      committeeCode,
    );

    if (input.eventId) {
      const event = await this.prisma.event.findUnique({
        where: { id: input.eventId },
      });
      if (!event) {
        throw new NotFoundException({
          code: ErrorCode.EVENT_NOT_FOUND,
          message: `Event '${input.eventId}' not found`,
        });
      }
    }

    if (input.taskId) {
      const task = await this.prisma.task.findFirst({
        where: { id: input.taskId, committeeId: committee.id },
      });
      if (!task) {
        throw new NotFoundException({
          code: ErrorCode.TASK_NOT_FOUND,
          message: `Task '${input.taskId}' not found in committee '${committeeCode}'`,
        });
      }
    }

    const { buffer, mimeType } = this.parseBase64(input.fileBase64);
    const assetId = randomUUID();

    // Persist file into committee-jailed storage with SHA-256 hash & magic-byte validation
    const saved = await this.storageService.saveAssetFile(
      committee.id,
      assetId,
      input.fileName,
      buffer,
      mimeType,
    );

    const asset = await this.prisma.committeeAsset.create({
      data: {
        id: assetId,
        committeeId: committee.id,
        eventId: input.eventId ?? null,
        taskId: input.taskId ?? null,
        title: input.title,
        category: input.category,
        fileName: input.fileName,
        storagePath: saved.storagePath,
        fileSizeBytes: saved.fileSizeBytes,
        mimeType: saved.mimeType,
        fileHash: saved.fileHash,
        status: AssetStatus.DRAFT,
        uploadedById: userId,
      },
      include: {
        committee: true,
        event: true,
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'asset.uploaded',
        targetType: 'asset',
        targetId: asset.id,
        actorId: userId,
        ip: ip ?? '127.0.0.1',
        afterJson: {
          assetId: asset.id,
          committeeCode: committee.code,
          fileName: asset.fileName,
          category: asset.category,
          fileSizeBytes: asset.fileSizeBytes,
          fileHash: asset.fileHash,
        },
      },
    });

    return {
      id: asset.id,
      committeeId: asset.committeeId,
      committeeCode: asset.committee.code,
      eventId: asset.eventId,
      eventTitle: asset.event?.title ?? null,
      taskId: asset.taskId,
      title: asset.title,
      category: asset.category as AssetResponse['category'],
      fileName: asset.fileName,
      fileSizeBytes: asset.fileSizeBytes,
      mimeType: asset.mimeType,
      fileHash: asset.fileHash,
      status: asset.status as AssetResponse['status'],
      reviewNotes: null,
      reviewedById: null,
      reviewedBy: null,
      reviewedAt: null,
      uploadedById: asset.uploadedById,
      uploadedBy: {
        id: asset.uploadedBy.id,
        fullName: asset.uploadedBy.name,
        email: asset.uploadedBy.email,
      },
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
    };
  }

  /**
   * List assets for a committee
   */
  async getAssets(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
    filters?: { category?: string; status?: string; eventId?: string },
  ): Promise<AssetListResponse> {
    const { committee } = await this.workspacesService.validateCommitteeAccess(
      userId,
      userRoles,
      committeeCode,
    );

    const where: {
      committeeId: string;
      category?: string;
      status?: string;
      eventId?: string;
    } = {
      committeeId: committee.id,
    };

    if (filters?.category) where.category = filters.category;
    if (filters?.status) where.status = filters.status;
    if (filters?.eventId) where.eventId = filters.eventId;

    const assets = await this.prisma.committeeAsset.findMany({
      where,
      include: {
        committee: true,
        event: true,
        uploadedBy: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      assets: assets.map((a) => ({
        id: a.id,
        committeeId: a.committeeId,
        committeeCode: a.committee.code,
        eventId: a.eventId,
        eventTitle: a.event?.title ?? null,
        taskId: a.taskId,
        title: a.title,
        category: a.category as AssetResponse['category'],
        fileName: a.fileName,
        fileSizeBytes: a.fileSizeBytes,
        mimeType: a.mimeType,
        fileHash: a.fileHash,
        status: a.status as AssetResponse['status'],
        reviewNotes: a.reviewNotes,
        reviewedById: a.reviewedById,
        reviewedBy: a.reviewedBy
          ? { id: a.reviewedBy.id, fullName: a.reviewedBy.name, email: a.reviewedBy.email }
          : null,
        reviewedAt: a.reviewedAt ? a.reviewedAt.toISOString() : null,
        uploadedById: a.uploadedById,
        uploadedBy: {
          id: a.uploadedBy.id,
          fullName: a.uploadedBy.name,
          email: a.uploadedBy.email,
        },
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      })),
      total: assets.length,
    };
  }

  /**
   * Get single asset by ID
   */
  async getAssetById(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
    assetId: string,
  ): Promise<AssetResponse> {
    const { committee } = await this.workspacesService.validateCommitteeAccess(
      userId,
      userRoles,
      committeeCode,
    );

    const asset = await this.prisma.committeeAsset.findFirst({
      where: { id: assetId, committeeId: committee.id },
      include: {
        committee: true,
        event: true,
        uploadedBy: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!asset) {
      throw new NotFoundException({
        code: ErrorCode.ASSET_NOT_FOUND,
        message: `Asset '${assetId}' not found in committee '${committeeCode}'`,
      });
    }

    return {
      id: asset.id,
      committeeId: asset.committeeId,
      committeeCode: asset.committee.code,
      eventId: asset.eventId,
      eventTitle: asset.event?.title ?? null,
      taskId: asset.taskId,
      title: asset.title,
      category: asset.category as AssetResponse['category'],
      fileName: asset.fileName,
      fileSizeBytes: asset.fileSizeBytes,
      mimeType: asset.mimeType,
      fileHash: asset.fileHash,
      status: asset.status as AssetResponse['status'],
      reviewNotes: asset.reviewNotes,
      reviewedById: asset.reviewedById,
      reviewedBy: asset.reviewedBy
        ? { id: asset.reviewedBy.id, fullName: asset.reviewedBy.name, email: asset.reviewedBy.email }
        : null,
      reviewedAt: asset.reviewedAt ? asset.reviewedAt.toISOString() : null,
      uploadedById: asset.uploadedById,
      uploadedBy: {
        id: asset.uploadedBy.id,
        fullName: asset.uploadedBy.name,
        email: asset.uploadedBy.email,
      },
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
    };
  }

  /**
   * Download asset file with tamper and existence checks (AUD-CERT-01 pattern)
   */
  async downloadAsset(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
    assetId: string,
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const { committee } = await this.workspacesService.validateCommitteeAccess(
      userId,
      userRoles,
      committeeCode,
    );

    const asset = await this.prisma.committeeAsset.findFirst({
      where: { id: assetId, committeeId: committee.id },
    });

    if (!asset) {
      throw new NotFoundException({
        code: ErrorCode.ASSET_NOT_FOUND,
        message: `Asset '${assetId}' not found in committee '${committeeCode}'`,
      });
    }

    if (!this.storageService.hasAssetFile(asset.storagePath)) {
      throw new ConflictException({
        code: ErrorCode.ASSET_FILE_UNAVAILABLE,
        message: 'The asset file is unavailable on storage',
      });
    }

    const buffer = await this.storageService.getAssetFile(asset.storagePath);
    const calculatedHash = createHash('sha256').update(buffer).digest('hex');

    if (calculatedHash !== asset.fileHash) {
      throw new ConflictException({
        code: ErrorCode.ASSET_INTEGRITY_MISMATCH,
        message: 'Asset file integrity check failed (SHA-256 hash mismatch)',
      });
    }

    return {
      buffer,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
    };
  }

  /**
   * Review asset (Approve / Reject)
   * Restricted to CORE heads, SUBCORE, or Executive board.
   */
  async reviewAsset(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
    assetId: string,
    input: ReviewAssetInput,
    ip?: string,
  ): Promise<AssetResponse> {
    const { committee, isExecutive, activeRoleCode } =
      await this.workspacesService.validateCommitteeAccess(
        userId,
        userRoles,
        committeeCode,
      );

    const isLeadOrExecutive =
      isExecutive ||
      activeRoleCode === RoleCode.CORE ||
      activeRoleCode === RoleCode.SUBCORE;

    if (!isLeadOrExecutive) {
      throw new ForbiddenException({
        code: ErrorCode.ASSET_REVIEW_UNAUTHORIZED,
        message: 'Only committee heads, sub-core executives, or branch leadership can review assets',
      });
    }

    const asset = await this.prisma.committeeAsset.findFirst({
      where: { id: assetId, committeeId: committee.id },
      include: {
        committee: true,
        event: true,
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!asset) {
      throw new NotFoundException({
        code: ErrorCode.ASSET_NOT_FOUND,
        message: `Asset '${assetId}' not found in committee '${committeeCode}'`,
      });
    }

    const updated = await this.prisma.committeeAsset.update({
      where: { id: assetId },
      data: {
        status: input.status,
        reviewNotes: input.reviewNotes ?? null,
        reviewedById: userId,
        reviewedAt: new Date(),
      },
      include: {
        committee: true,
        event: true,
        uploadedBy: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'asset.reviewed',
        targetType: 'asset',
        targetId: updated.id,
        actorId: userId,
        ip: ip ?? '127.0.0.1',
        beforeJson: {
          assetId: updated.id,
          status: asset.status,
        },
        afterJson: {
          assetId: updated.id,
          status: updated.status,
          reviewNotes: updated.reviewNotes,
          reviewedById: userId,
        },
      },
    });

    return {
      id: updated.id,
      committeeId: updated.committeeId,
      committeeCode: updated.committee.code,
      eventId: updated.eventId,
      eventTitle: updated.event?.title ?? null,
      taskId: updated.taskId,
      title: updated.title,
      category: updated.category as AssetResponse['category'],
      fileName: updated.fileName,
      fileSizeBytes: updated.fileSizeBytes,
      mimeType: updated.mimeType,
      fileHash: updated.fileHash,
      status: updated.status as AssetResponse['status'],
      reviewNotes: updated.reviewNotes,
      reviewedById: updated.reviewedById,
      reviewedBy: updated.reviewedBy
        ? { id: updated.reviewedBy.id, fullName: updated.reviewedBy.name, email: updated.reviewedBy.email }
        : null,
      reviewedAt: updated.reviewedAt ? updated.reviewedAt.toISOString() : null,
      uploadedById: updated.uploadedById,
      uploadedBy: {
        id: updated.uploadedBy.id,
        fullName: updated.uploadedBy.name,
        email: updated.uploadedBy.email,
      },
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Delete an asset
   */
  async deleteAsset(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
    assetId: string,
    ip?: string,
  ): Promise<{ success: boolean; assetId: string }> {
    const { committee, isExecutive, activeRoleCode } =
      await this.workspacesService.validateCommitteeAccess(
        userId,
        userRoles,
        committeeCode,
      );

    const asset = await this.prisma.committeeAsset.findFirst({
      where: { id: assetId, committeeId: committee.id },
    });

    if (!asset) {
      throw new NotFoundException({
        code: ErrorCode.ASSET_NOT_FOUND,
        message: `Asset '${assetId}' not found in committee '${committeeCode}'`,
      });
    }

    const isUploader = asset.uploadedById === userId;
    const isLead = activeRoleCode === RoleCode.CORE;

    if (!isUploader && !isLead && !isExecutive) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the uploader, committee lead, or executive may delete this asset',
      });
    }

    await this.storageService.deleteAssetFile(asset.storagePath);

    await this.prisma.committeeAsset.delete({
      where: { id: assetId },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'asset.deleted',
        targetType: 'asset',
        targetId: assetId,
        actorId: userId,
        ip: ip ?? '127.0.0.1',
        beforeJson: {
          assetId,
          committeeCode: committee.code,
          fileName: asset.fileName,
        },
      },
    });

    return { success: true, assetId };
  }
}
