import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Request } from 'express';
import { Public, RequirePermission, ReqUser } from '../../../common/decorators/index.js';
import {
  PermissionCode,
  CurrentUser,
  RevokeCertificateInputSchema,
  PublicCertificateVerificationResponse,
  PublicPassportVerificationResponse,
  VerificationOutcome,
  CertificateDetail,
} from '@csi/shared';
import { CertificateVerificationService } from '../verification/certificate-verification.service.js';
import { PublicVerificationRateLimitGuard } from '../verification/public-verification-rate-limit.guard.js';
import { PassportVerificationService } from '../../passports/services/passport-verification.service.js';

@Controller()
export class PublicVerificationController {
  constructor(
    private readonly verificationService: CertificateVerificationService,
    @Inject(forwardRef(() => PassportVerificationService))
    private readonly passportVerificationService: PassportVerificationService,
  ) {}

  /**
   * Unified public unauthenticated verification endpoint for CSI certificates and activity passports.
   * Rate-limited to prevent brute-force code enumeration.
   */
  @Public()
  @UseGuards(PublicVerificationRateLimitGuard)
  @Get('verify/:code')
  async verifyCredential(
    @Param('code') code: string,
  ): Promise<PublicCertificateVerificationResponse | PublicPassportVerificationResponse> {
    const certResult = await this.verificationService.verifyCertificate(code);
    if (certResult.status !== VerificationOutcome.NOT_FOUND) {
      return certResult;
    }

    // Fallback to passport verification for unified verification portal
    const passportResult = await this.passportVerificationService.verifyPassport(code);
    if (passportResult.status !== VerificationOutcome.NOT_FOUND) {
      return passportResult;
    }

    return certResult;
  }

  /**
   * Alias public verification route under /api/certificates/verify/:code.
   */
  @Public()
  @UseGuards(PublicVerificationRateLimitGuard)
  @Get('certificates/verify/:code')
  async verifyCertificateAlias(
    @Param('code') code: string,
  ): Promise<PublicCertificateVerificationResponse> {
    return this.verificationService.verifyCertificate(code);
  }

  /**
   * Administrative revocation of an issued certificate with mandatory reason.
   * Requires cert.generate permission.
   */
  @Post('certificates/:id/revoke')
  @RequirePermission(PermissionCode.CERT_GENERATE)
  async revokeCertificate(
    @Param('id') id: string,
    @Body() body: unknown,
    @ReqUser() user: CurrentUser,
    @Req() req: Request,
  ): Promise<CertificateDetail> {
    const parseResult = RevokeCertificateInputSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid certificate revocation request payload',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    // AUD-SEC-01: Trust Express req.ip over raw header
    const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';

    return this.verificationService.revokeCertificate(
      id,
      parseResult.data.reason,
      user.id,
      clientIp,
    );
  }
}
