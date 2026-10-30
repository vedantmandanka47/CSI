import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  CreateDriveWindowInput,
  DriveWindow,
  ErrorCode,
} from '@csi/shared';

@Injectable()
export class DriveWindowsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Determine whether a drive window of a given type is currently active and open.
   */
  async isDriveOpen(type = 'membership'): Promise<boolean> {
    const window = await this.prisma.driveWindow.findUnique({
      where: { type },
    });
    if (!window || !window.isOpen) return false;

    const now = new Date();
    return window.opensAt <= now && window.closesAt >= now;
  }

  /**
   * Public drive window summary for landing page and status APIs.
   */
  async getDriveStatus(type = 'membership'): Promise<{
    is_open: boolean;
    opens_at: string | null;
    closes_at: string | null;
    message: string;
  }> {
    const window = await this.prisma.driveWindow.findUnique({
      where: { type },
    });

    if (!window) {
      return {
        is_open: false,
        opens_at: null,
        closes_at: null,
        message: 'No recruitment drive is currently scheduled.',
      };
    }

    const now = new Date();
    const isActive = window.isOpen && window.opensAt <= now && window.closesAt >= now;

    let message: string;
    if (isActive) {
      const closesFormatted = window.closesAt.toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      message = `Annual student branch membership drive is currently open until ${closesFormatted}.`;
    } else if (window.opensAt > now) {
      const opensFormatted = window.opensAt.toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      message = `Next membership drive opens on ${opensFormatted}.`;
    } else {
      message = 'Annual student branch membership recruitment drive is currently closed.';
    }

    return {
      is_open: isActive,
      opens_at: window.opensAt.toISOString(),
      closes_at: window.closesAt.toISOString(),
      message,
    };
  }

  /**
   * List all configured drive windows (Admin view).
   */
  async listAllWindows(): Promise<DriveWindow[]> {
    const windows = await this.prisma.driveWindow.findMany({
      orderBy: { opensAt: 'desc' },
    });

    return windows.map((w) => ({
      id: w.id,
      type: w.type,
      opens_at: w.opensAt.toISOString(),
      closes_at: w.closesAt.toISOString(),
      is_open: w.isOpen,
      created_at: w.createdAt.toISOString(),
      updated_at: w.updatedAt.toISOString(),
    }));
  }

  /**
   * Create or update drive window with transactional safety and audit logging.
   */
  async createOrUpdateWindow(
    input: CreateDriveWindowInput,
    actorId?: string,
  ): Promise<DriveWindow> {
    const opensAt = new Date(input.opens_at);
    const closesAt = new Date(input.closes_at);

    if (closesAt <= opensAt) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Closing date must be strictly later than opening date.',
      });
    }

    const window = await this.prisma.driveWindow.upsert({
      where: { type: input.type },
      create: {
        type: input.type,
        opensAt,
        closesAt,
        isOpen: input.is_open ?? true,
      },
      update: {
        opensAt,
        closesAt,
        isOpen: input.is_open ?? true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: actorId || null,
        action: 'DRIVE_WINDOW_UPSERT',
        targetType: 'drive_window',
        targetId: window.id,
        afterJson: {
          type: window.type,
          opens_at: window.opensAt.toISOString(),
          closes_at: window.closesAt.toISOString(),
          is_open: window.isOpen,
        },
      },
    });

    return {
      id: window.id,
      type: window.type,
      opens_at: window.opensAt.toISOString(),
      closes_at: window.closesAt.toISOString(),
      is_open: window.isOpen,
      created_at: window.createdAt.toISOString(),
      updated_at: window.updatedAt.toISOString(),
    };
  }

  /**
   * Toggle drive window active state (per Appendix C: POST /api/admin/drives/{type}).
   */
  async toggleWindow(
    type: string,
    isOpen?: boolean,
    actorId?: string,
  ): Promise<DriveWindow> {
    const existing = await this.prisma.driveWindow.findUnique({
      where: { type },
    });

    if (!existing) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: `Drive window of type "${type}" was not found.`,
      });
    }

    const nextIsOpen = isOpen !== undefined ? isOpen : !existing.isOpen;

    const updated = await this.prisma.driveWindow.update({
      where: { type },
      data: { isOpen: nextIsOpen },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: actorId || null,
        action: 'DRIVE_WINDOW_TOGGLE',
        targetType: 'drive_window',
        targetId: updated.id,
        beforeJson: { is_open: existing.isOpen },
        afterJson: { is_open: updated.isOpen },
      },
    });

    return {
      id: updated.id,
      type: updated.type,
      opens_at: updated.opensAt.toISOString(),
      closes_at: updated.closesAt.toISOString(),
      is_open: updated.isOpen,
      created_at: updated.createdAt.toISOString(),
      updated_at: updated.updatedAt.toISOString(),
    };
  }
}
