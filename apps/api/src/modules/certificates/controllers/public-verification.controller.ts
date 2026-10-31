import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { Public, RequirePermission, ReqUser } from '../../../common/decorators/index.js';
import {
  PermissionCode,
  CurrentUser,
  RevokeCertificateInputSchema,
  PublicCertificateVerificationResponse,
  CertificateDetail,
} from '@csi/shared';
import { CertificateVerificationService } from '../verification/certificate-verification.service.js';
import { PublicVerificationRateLimitGuard } from '../verification/public-verification-rate-limit.guard.js';

@Controller()
export class PublicVerificationController {
  constructor(private readonly verificationService: CertificateVerificationService) {}

  /**
   * Public unauthenticated verification endpoint for CSI certificates.
   * Rate-limited to prevent brute-force code enumeration.
   */
  @Public()
  @UseGuards(PublicVerificationRateLimitGuard)
  @Get('verify/:code')
  async verifyCertificate(
    @Param('code') code: string,
  ): Promise<PublicCertificateVerificationResponse> {
    return this.verificationService.verifyCertificate(code);
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

    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '127.0.0.1';

    return this.verificationService.revokeCertificate(
      id,
      parseResult.data.reason,
      user.id,
      clientIp,
    );
  }
}
