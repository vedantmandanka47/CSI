import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { EventsService } from './events.service.js';
import { Public } from '../../common/decorators/index.js';
import { RateLimiterService } from '../../common/services/rate-limiter.service.js';

@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  /**
   * Calendar subscription feed alias (RFC 5545) per prompt.md §771
   */
  @Public()
  @Get('feed.ics')
  async getCalendarFeed(
    @Query('category') category: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    this.rateLimiter.assertLimit(`cal-feed:${ip}`, 60, 60 * 60 * 1000); // 60/hr

    const icsContent = await this.eventsService.generateCalendarFeed(category);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="csi-gcet-feed.ics"');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.send(icsContent);
  }
}
