import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '@csi/shared';
import { Authenticated, ReqUser } from '../../common/decorators/index.js';
import { CertificateIssuanceService } from './certificate-issuance.service.js';

@Controller('me')
export class MeCertificatesController {
  constructor(private readonly issuanceService: CertificateIssuanceService) {}

  /**
   * Member self-service endpoint retrieving all certificates issued to the authenticated member.
   */
  @Authenticated()
  @Get('certificates')
  async getMyCertificates(@ReqUser() currentUser: CurrentUser) {
    return this.issuanceService.listUserCertificates(currentUser.id, currentUser.email);
  }
}

