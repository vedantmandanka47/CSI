import { Module } from '@nestjs/common';
import { RetentionService } from './retention.service.js';
import { MaintenanceController } from './maintenance.controller.js';
import { RateLimiterService } from '../../common/services/rate-limiter.service.js';

@Module({
  controllers: [MaintenanceController],
  providers: [RetentionService, RateLimiterService],
  exports: [RetentionService],
})
export class MaintenanceModule {}

