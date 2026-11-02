import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { IdCardService, QrPassPayload } from '../../../../../apps/api/src/modules/id-card/id-card.service.js';
import { PrismaService } from '../../../../../apps/api/src/infra/prisma/prisma.service.js';
import { UserStatus } from '@csi/shared';
import { env } from '../../../../../apps/api/src/config/env.js';
import { createHmac } from 'crypto';

describe('IdCardService (M8, AUD-SEC-03)', () => {
  let service: IdCardService;
  let mockPrisma: {
    user: {
      findUnique: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdCardService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<IdCardService>(IdCardService);
  });

  describe('getIdCard', () => {
    it('returns digital ID card data with Ed25519 signed QR token for active member', async () => {
      const activeUser = {
        id: 'member-1',
        name: 'Jane Doe',
        email: 'jane@gcet.edu.in',
        enrollmentNo: '23CS101',
        branch: 'CSE',
        year: 2,
        status: UserStatus.ACTIVE,
        photo: null,
        createdAt: new Date('2026-08-01T10:00:00Z'),
        roleAssignments: [{ role: { code: 'member' } }],
      };

      mockPrisma.user.findUnique.mockResolvedValue(activeUser);

      const result = await service.getIdCard('member-1');

      expect(result.id).toBe('member-1');
      expect(result.name).toBe('Jane Doe');
      expect(result.status).toBe(UserStatus.ACTIVE);
      expect(result.qr_token).toMatch(/^csi_pass\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    });

    it('throws ForbiddenException when member status is pending', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'pending-1',
        status: UserStatus.PENDING,
        roleAssignments: [],
      });

      await expect(service.getIdCard('pending-1')).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when member status is inactive or graduated', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'inactive-1',
        status: UserStatus.INACTIVE,
        roleAssignments: [],
      });

      await expect(service.getIdCard('inactive-1')).rejects.toThrow(ForbiddenException);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'grad-1',
        status: UserStatus.GRADUATED,
        roleAssignments: [],
      });

      await expect(service.getIdCard('grad-1')).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getIdCard('not-found')).rejects.toThrow(NotFoundException);
    });
  });

  describe('verifyQrPass', () => {
    it('validates authentic, non-expired Ed25519 QR pass token successfully', async () => {
      const activeUser = {
        id: 'member-1',
        name: 'Jane Doe',
        email: 'jane@gcet.edu.in',
        enrollmentNo: '23CS101',
        branch: 'CSE',
        year: 2,
        status: UserStatus.ACTIVE,
        photo: null,
        createdAt: new Date('2026-08-01T10:00:00Z'),
        roleAssignments: [{ role: { code: 'member' } }],
      };

      mockPrisma.user.findUnique.mockResolvedValue(activeUser);

      const card = await service.getIdCard('member-1');

      // Verify that token using Ed25519 signature
      const verifyResult = await service.verifyQrPass(card.qr_token);
      expect(verifyResult.valid).toBe(true);
      expect(verifyResult.user_id).toBe('member-1');
      expect(verifyResult.name).toBe('Jane Doe');
    });

    it('verifies token signed with signQrPayload directly (AUD-SEC-03)', async () => {
      const activeUser = {
        id: 'member-ed25519',
        name: 'Asymmetric Verifier',
        email: 'ed25519@gcet.edu.in',
        enrollmentNo: '23CS200',
        branch: 'CSE',
        year: 3,
        status: UserStatus.ACTIVE,
        photo: null,
        createdAt: new Date('2026-08-01T10:00:00Z'),
      };
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);

      const nowSec = Math.floor(Date.now() / 1000);
      const payload: QrPassPayload = {
        sub: 'member-ed25519',
        eno: '23CS200',
        nam: 'Asymmetric Verifier',
        rol: ['member'],
        iat: nowSec,
        exp: nowSec + 60,
        jti: 'ed25519-jti-1',
      };

      const token = service.signQrPayload(payload);
      const verifyResult = await service.verifyQrPass(token);

      expect(verifyResult.valid).toBe(true);
      expect(verifyResult.user_id).toBe('member-ed25519');
    });

    it('rejects tampered or malformed token', async () => {
      const malformed = 'invalid.token';
      const result1 = await service.verifyQrPass(malformed);
      expect(result1.valid).toBe(false);

      const tampered = 'csi_pass.eyJzdWIiOiIxIn0.invalidsignaturehere123';
      const result2 = await service.verifyQrPass(tampered);
      expect(result2.valid).toBe(false);
      expect(result2.message).toContain('altered or forged');
    });

    it('rejects expired QR pass token', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const expiredPayload: QrPassPayload = {
        sub: 'member-1',
        eno: '23CS101',
        nam: 'Jane Doe',
        rol: ['member'],
        iat: nowSec - 120,
        exp: nowSec - 10,
        jti: 'test-jti',
      };
      const token = service.signQrPayload(expiredPayload);

      const result = await service.verifyQrPass(token);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('expired');
    });

    it('supports legacy HMAC token in test environment during rollover', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const payload = {
        sub: 'member-hmac',
        eno: '23CS999',
        nam: 'HMAC Legacy User',
        rol: ['member'],
        iat: nowSec,
        exp: nowSec + 60,
        jti: 'hmac-jti-1',
      };
      const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const secret = env.SESSION_SECRET || 'dev_session_secret_replace_in_production_32bytes';
      const signature = createHmac('sha256', secret).update(payloadEncoded).digest('base64url');
      const token = `csi_pass.${payloadEncoded}.${signature}`;

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'member-hmac',
        name: 'HMAC Legacy User',
        enrollmentNo: '23CS999',
        status: UserStatus.ACTIVE,
      });

      const result = await service.verifyQrPass(token);
      expect(result.valid).toBe(true);
      expect(result.user_id).toBe('member-hmac');
    });
  });
});
