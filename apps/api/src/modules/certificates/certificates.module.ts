import { Module, forwardRef } from '@nestjs/common';
import { FontManagerService } from './templates/font-manager.service.js';
import { AssetManagerService } from './templates/asset-manager.service.js';
import { LayoutEngineService } from './templates/layout-engine.service.js';
import { CertificateTemplateEngineService } from './templates/certificate-template-engine.service.js';
import { CertificateStorageService } from './storage/certificate-storage.service.js';
import { CertificateNumberGeneratorService } from './issuance/certificate-number-generator.service.js';
import { ParticipantResolverService } from './issuance/participant-resolver.service.js';
import { CertificateBatchProcessorService } from './batches/certificate-batch-processor.service.js';
import { CertificateIssuanceService } from './issuance/certificate-issuance.service.js';
import { VerificationCodeService } from './verification/verification-code.service.js';
import { CertificateVerificationService } from './verification/certificate-verification.service.js';
import { PublicVerificationRateLimitGuard } from './verification/public-verification-rate-limit.guard.js';
import { CertificatesController } from './controllers/certificates.controller.js';
import { MeCertificatesController } from './controllers/me-certificates.controller.js';
import { PublicVerificationController } from './controllers/public-verification.controller.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { PassportsModule } from '../passports/passports.module.js';

@Module({
  imports: [PrismaModule, forwardRef(() => PassportsModule)],
  controllers: [
    CertificatesController,
    MeCertificatesController,
    PublicVerificationController,
  ],
  providers: [
    FontManagerService,
    AssetManagerService,
    LayoutEngineService,
    CertificateTemplateEngineService,
    CertificateStorageService,
    CertificateNumberGeneratorService,
    ParticipantResolverService,
    CertificateBatchProcessorService,
    CertificateIssuanceService,
    VerificationCodeService,
    CertificateVerificationService,
    PublicVerificationRateLimitGuard,
  ],
  exports: [
    CertificateTemplateEngineService,
    CertificateIssuanceService,
    CertificateBatchProcessorService,
    CertificateStorageService,
    ParticipantResolverService,
    CertificateNumberGeneratorService,
    VerificationCodeService,
    CertificateVerificationService,
    FontManagerService,
    AssetManagerService,
    LayoutEngineService,
  ],
})
export class CertificatesModule {}
