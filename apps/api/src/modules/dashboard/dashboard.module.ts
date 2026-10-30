import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service.js';
import { DashboardController } from './dashboard.controller.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { RateLimiterService } from '../../common/services/rate-limiter.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [DashboardController],
  providers: [DashboardService, RateLimiterService],
  exports: [DashboardService],
})
export class DashboardModule {}

