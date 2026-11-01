import { Module } from '@nestjs/common';
import { TermsController } from './terms.controller.js';
import { TermsService } from './terms.service.js';
import { RolloverService } from './rollover.service.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [TermsController],
  providers: [TermsService, RolloverService],
  exports: [TermsService, RolloverService],
})
export class TermsModule {}
