import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DriveWindowsService } from './drive-windows.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

describe('DriveWindowsService (M8)', () => {
  let service: DriveWindowsService;
  let mockPrisma: {
    driveWindow: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
    };
    auditLog: {
      create: jest.Mock;
    };
  };

  const sampleWindow = {
    id: 'drive-win-1',
    type: 'membership',
    opensAt: new Date(Date.now() - 3600000),
    closesAt: new Date(Date.now() + 3600000),
    isOpen: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockPrisma = {
      driveWindow: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriveWindowsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<DriveWindowsService>(DriveWindowsService);
  });

  it('determines if drive is open when window is active', async () => {
    mockPrisma.driveWindow.findUnique.mockResolvedValueOnce(sampleWindow);
    const isOpen = await service.isDriveOpen('membership');
    expect(isOpen).toBe(true);
  });

  it('determines if drive is closed when isOpen is false', async () => {
    mockPrisma.driveWindow.findUnique.mockResolvedValueOnce({
      ...sampleWindow,
      isOpen: false,
    });
    const isOpen = await service.isDriveOpen('membership');
    expect(isOpen).toBe(false);
  });

  it('toggles drive window state and creates audit record', async () => {
    mockPrisma.driveWindow.findUnique.mockResolvedValueOnce(sampleWindow);
    mockPrisma.driveWindow.update.mockResolvedValueOnce({
      ...sampleWindow,
      isOpen: false,
    });

    const result = await service.toggleWindow('membership', false, 'admin-1');

    expect(result.is_open).toBe(false);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'DRIVE_WINDOW_TOGGLE' }),
      }),
    );
  });

  it('throws NotFoundException when toggling unknown drive window', async () => {
    mockPrisma.driveWindow.findUnique.mockResolvedValueOnce(null);
    await expect(service.toggleWindow('unknown', true)).rejects.toThrow(NotFoundException);
  });

  it('throws ConflictException when creating window with invalid date order', async () => {
    await expect(
      service.createOrUpdateWindow({
        type: 'membership',
        opens_at: '2026-10-01T00:00:00.000Z',
        closes_at: '2026-09-01T00:00:00.000Z',
        is_open: true,
      }),
    ).rejects.toThrow(ConflictException);
  });
});
