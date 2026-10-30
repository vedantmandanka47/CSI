import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service.js';
import { AttendanceController } from './attendance.controller.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { IdCardModule } from '../id-card/id-card.module.js';
import { RateLimiterService } from '../../common/services/rate-limiter.service.js';

@Module({
  imports: [PrismaModule, IdCardModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, RateLimiterService],
  exports: [AttendanceService],
})
export class AttendanceModule {}

