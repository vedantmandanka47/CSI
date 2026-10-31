import { Module } from '@nestjs/common';
import { FontManagerService } from './font-manager.service.js';
import { AssetManagerService } from './asset-manager.service.js';
import { LayoutEngineService } from './layout-engine.service.js';
import { CertificateTemplateEngineService } from './certificate-template-engine.service.js';
import { CertificatesController } from './certificates.controller.js';

@Module({
  controllers: [CertificatesController],
  providers: [
    FontManagerService,
    AssetManagerService,
    LayoutEngineService,
    CertificateTemplateEngineService,
  ],
  exports: [
    CertificateTemplateEngineService,
    FontManagerService,
    AssetManagerService,
    LayoutEngineService,
  ],
})
export class CertificatesModule {}
