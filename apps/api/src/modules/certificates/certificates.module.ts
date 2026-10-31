import { Module } from '@nestjs/common';
import { FontManagerService } from './font-manager.service.js';
import { AssetManagerService } from './asset-manager.service.js';
import { LayoutEngineService } from './layout-engine.service.js';
import { CertificateTemplateEngineService } from './certificate-template-engine.service.js';
import { CertificateStorageService } from './certificate-storage.service.js';
import { CertificateNumberGeneratorService } from './certificate-number-generator.service.js';
import { ParticipantResolverService } from './participant-resolver.service.js';
import { CertificateBatchProcessorService } from './certificate-batch-processor.service.js';
import { CertificateIssuanceService } from './certificate-issuance.service.js';
import { VerificationCodeService } from './verification-code.service.js';
import { CertificateVerificationService } from './certificate-verification.service.js';
import { PublicVerificationRateLimitGuard } from './public-verification-rate-limit.guard.js';
import { CertificatesController } from './certificates.controller.js';
import { MeCertificatesController } from './me-certificates.controller.js';
import { PublicVerificationController } from './public-verification.controller.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
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
