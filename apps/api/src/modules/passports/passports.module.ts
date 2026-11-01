import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { CertificatesModule } from '../certificates/certificates.module.js';
import { PassportStorageService } from './services/passport-storage.service.js';
import { PassportAggregationService } from './services/passport-aggregation.service.js';
import { PassportPdfService } from './services/passport-pdf.service.js';
import { PassportVerificationService } from './services/passport-verification.service.js';
import { PassportExportService } from './services/passport-export.service.js';
import { MePassportController } from './controllers/me-passport.controller.js';
import { PassportsController } from './controllers/passports.controller.js';

@Module({
  imports: [PrismaModule, CertificatesModule],
  controllers: [MePassportController, PassportsController],
  providers: [
    PassportStorageService,
    PassportAggregationService,
    PassportPdfService,
    PassportVerificationService,
    PassportExportService,
  ],
  exports: [
    PassportStorageService,
    PassportAggregationService,
    PassportPdfService,
    PassportVerificationService,
    PassportExportService,
  ],
})
export class PassportsModule {}

