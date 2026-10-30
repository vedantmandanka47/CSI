import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service.js';
import {
  CurrentUser,
  PermissionCode,
  CreateAttendanceSessionSchema,
  CheckInQrSchema,
  CheckInTotpSchema,
  CheckInManualSchema,
  BatchSyncAttendanceSchema,
} from '@csi/shared';
import { RequirePermission, ReqUser } from '../../common/decorators/index.js';
import { RateLimiterService } from '../../common/services/rate-limiter.service.js';

@Controller()
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  /**
   * List attendance sessions for an event.
   */
  @Get('events/:eventId/attendance-sessions')
  @RequirePermission(PermissionCode.ATTENDANCE_TAKE)
  async listSessions(@Param('eventId') eventId: string) {
    const data = await this.attendanceService.listSessions(eventId);
    return { data };
  }

  /**
   * Create an attendance session for an event.
   */
  @Post('events/:eventId/attendance-sessions')
  @RequirePermission(PermissionCode.ATTENDANCE_MANAGE)
  async createSession(
    @Param('eventId') eventId: string,
    @Body() rawBody: unknown,
    @ReqUser() currentUser: CurrentUser,
  ) {
    const parseResult = CreateAttendanceSessionSchema.safeParse(rawBody);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid attendance session data.',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    const data = await this.attendanceService.createSession(
      eventId,
      parseResult.data,
      currentUser.id,
    );
    return { data };
  }

  /**
   * Retrieve session details (with live TOTP code for authorized organizers).
   */
  @Get('attendance/sessions/:sessionId')
  @RequirePermission(PermissionCode.ATTENDANCE_TAKE)
  async getSession(@Param('sessionId') sessionId: string) {
    const data = await this.attendanceService.getSession(sessionId);
    return { data };
  }

  /**
   * Toggle session open/closed status.
   */
  @Post('attendance/sessions/:sessionId/toggle')
  @RequirePermission(PermissionCode.ATTENDANCE_MANAGE)
  async toggleSession(
    @Param('sessionId') sessionId: string,
    @ReqUser() currentUser: CurrentUser,
  ) {
    const data = await this.attendanceService.toggleSession(sessionId, currentUser.id);
    return { data };
  }

  /**
   * Check in attendee via dynamic rotating QR pass.
   */
  @Post('attendance/check-in/qr')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionCode.ATTENDANCE_TAKE)
  async checkInQr(
    @Body() rawBody: unknown,
    @ReqUser() currentUser: CurrentUser,
  ) {
    this.rateLimiter.assertLimit(`check-in:${currentUser.id}`, 60, 60 * 1000);
    const parseResult = CheckInQrSchema.safeParse(rawBody);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid QR check-in input.',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    const data = await this.attendanceService.checkInQr(parseResult.data, currentUser.id);
    return { data };
  }

  /**
   * Check in attendee via 6-digit rotating TOTP code.
   */
  @Post('attendance/check-in/totp')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionCode.ATTENDANCE_TAKE)
  async checkInTotp(
    @Body() rawBody: unknown,
    @ReqUser() currentUser: CurrentUser,
  ) {
    this.rateLimiter.assertLimit(`check-in:${currentUser.id}`, 60, 60 * 1000);
    const parseResult = CheckInTotpSchema.safeParse(rawBody);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid TOTP check-in input.',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    const data = await this.attendanceService.checkInTotp(parseResult.data, currentUser.id);
    return { data };
  }

  /**
   * Manual volunteer attendance override.
   */
  @Post('attendance/check-in/manual')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionCode.ATTENDANCE_TAKE)
  async checkInManual(
    @Body() rawBody: unknown,
    @ReqUser() currentUser: CurrentUser,
  ) {
    this.rateLimiter.assertLimit(`check-in:${currentUser.id}`, 60, 60 * 1000);
    const parseResult = CheckInManualSchema.safeParse(rawBody);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid manual check-in input.',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    const data = await this.attendanceService.checkInManual(parseResult.data, currentUser.id);
    return { data };
  }

  /**
   * Offline synchronization batch endpoint.
   */
  @Post('attendance/sync')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionCode.ATTENDANCE_TAKE)
  async syncOfflineOperations(
    @Body() rawBody: unknown,
    @ReqUser() currentUser: CurrentUser,
  ) {
    const parseResult = BatchSyncAttendanceSchema.safeParse(rawBody);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid offline synchronization batch payload.',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    const data = await this.attendanceService.syncOfflineOperations(
      parseResult.data,
      currentUser.id,
    );
    return { data };
  }
}

