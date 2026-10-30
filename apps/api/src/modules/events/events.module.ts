import { Module } from '@nestjs/common';
import { EventsController } from './events.controller.js';
import { CalendarController } from './calendar.controller.js';
import { EventsService } from './events.service.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { RateLimiterService } from '../../common/services/rate-limiter.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [EventsController, CalendarController],
  providers: [EventsService, RateLimiterService],
  exports: [EventsService],
})
export class EventsModule {}
