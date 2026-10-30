import { Module } from '@nestjs/common';
import { MeIdCardController } from './me-id-card.controller.js';
import { IdCardController } from './id-card.controller.js';
import { IdCardService } from './id-card.service.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { RateLimiterService } from '../../common/services/rate-limiter.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [MeIdCardController, IdCardController],
  providers: [IdCardService, RateLimiterService],
  exports: [IdCardService],
})
export class IdCardModule {}
