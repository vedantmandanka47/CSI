import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { EventsService } from './events.service.js';
import {
  EventListQuerySchema,
  GuestRegisterSchema,
  CurrentUser,
  PublicEventDetail,
  RegistrationResponse,
} from '@csi/shared';
import { Public, ReqUser } from '../../common/decorators/index.js';
import { RateLimiterService } from '../../common/services/rate-limiter.service.js';

@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  /**
   * Public event discovery with filters and pagination
   */
  @Public()
  @Get()
  async getEvents(@Query() rawQuery: Record<string, unknown>) {
    const parseResult = EventListQuerySchema.safeParse(rawQuery);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid event list query parameters',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    return this.eventsService.findPublicEvents(parseResult.data);
  }

  /**
   * Public calendar subscription feed (RFC 5545)
   */
  @Public()
  @Get('calendar.ics')
  async getCalendarFeed(
    @Query('category') category: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    this.rateLimiter.assertLimit(`cal-feed:${ip}`, 60, 60 * 60 * 1000); // 60/hr

    const icsContent = await this.eventsService.generateCalendarFeed(category);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="csi-gcet-events.ics"');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.send(icsContent);
  }

  /**
   * Single event RFC 5545 download
   */
  @Public()
  @Get(':id/ics')
  async getSingleEventIcs(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { ics, slug } = await this.eventsService.generateEventIcs(id);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.ics"`);
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.send(ics);
  }

  /**
   * Public event details by slug or UUID
   */
  @Public()
  @Get(':slug')
  async getEventBySlug(
    @Param('slug') slug: string,
    @ReqUser() currentUser: CurrentUser | null,
  ): Promise<{ data: PublicEventDetail }> {
    const data = await this.eventsService.findPublicEventBySlug(slug, currentUser?.id);
    return { data };
  }

  /**
   * Authenticated member event registration
   */
  @Post(':id/register')
  @HttpCode(HttpStatus.OK)
  async registerMember(
    @Param('id') eventId: string,
    @ReqUser() currentUser: CurrentUser,
    @Body() body: { notes?: string },
  ): Promise<{ data: RegistrationResponse }> {
    this.rateLimiter.assertLimit(`register-user:${currentUser.id}`, 20, 60 * 1000); // 20/min
    const data = await this.eventsService.registerMember(eventId, currentUser.id, body?.notes);
    return { data };
  }

  /**
   * Public guest event registration with DPDP consent
   */
  @Public()
  @Post(':id/guests')
  @HttpCode(HttpStatus.OK)
  async registerGuest(
    @Param('id') eventId: string,
    @Body() rawBody: unknown,
    @Req() req: Request,
  ): Promise<{ data: RegistrationResponse }> {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    this.rateLimiter.assertLimit(`register-guest:${ip}`, 10, 60 * 1000); // 10/min

    const parseResult = GuestRegisterSchema.safeParse(rawBody);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid guest registration data',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    const data = await this.eventsService.registerGuest(eventId, parseResult.data, ip);
    return { data };
  }

  /**
   * Cancel event registration
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelRegistration(
    @Param('id') eventId: string,
    @ReqUser() currentUser: CurrentUser,
  ): Promise<{ message: string; promoted_waitlist_id?: string }> {
    return this.eventsService.cancelRegistration(eventId, currentUser.id);
  }
}
