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
import { CertificatesController } from './certificates.controller.js';
import { MeCertificatesController } from './me-certificates.controller.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [CertificatesController, MeCertificatesController],
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
  ],
  exports: [
    CertificateTemplateEngineService,
    CertificateIssuanceService,
    CertificateBatchProcessorService,
    CertificateStorageService,
    ParticipantResolverService,
    CertificateNumberGeneratorService,
    FontManagerService,
    AssetManagerService,
    LayoutEngineService,
  ],
})
export class CertificatesModule {}
