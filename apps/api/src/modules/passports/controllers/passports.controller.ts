import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Res,
  Req,
  HttpStatus,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  Authenticated,
  Public,
  RequirePermission,
  ReqUser,
} from '../../../common/decorators/index.js';
import {
  CurrentUser,
  PermissionCode,
  StudentPassportResponse,
  PublicPassportVerificationResponse,
  RevokePassportInputSchema,
  ErrorCode,
} from '@csi/shared';
import { PassportAggregationService } from '../services/passport-aggregation.service.js';
import { PassportExportService } from '../services/passport-export.service.js';
import { PassportVerificationService } from '../services/passport-verification.service.js';
import { PublicVerificationRateLimitGuard } from '../../certificates/verification/public-verification-rate-limit.guard.js';

@Controller('passports')
export class PassportsController {
  constructor(
    private readonly aggregationService: PassportAggregationService,
    private readonly exportService: PassportExportService,
    private readonly verificationService: PassportVerificationService,
  ) {}

  /**
   * Public verification of a student activity passport by verification code.
   * Rate limited to prevent code enumeration.
   */
  @Public()
  @UseGuards(PublicVerificationRateLimitGuard)
  @Get('verify/:code')
  async verifyPassport(
    @Param('code') code: string,
  ): Promise<PublicPassportVerificationResponse> {
    return this.verificationService.verifyPassport(code);
  }

  /**
   * Retrieves any student's activity passport.
   * Enforces server-side authorization: student may access own passport,
   * administrators require EXPORT_DATA or ROSTER_MANAGE.
   */
  @Authenticated()
  @Get('user/:userId')
  async getStudentPassport(
    @Param('userId') userId: string,
    @ReqUser() currentUser: CurrentUser,
  ): Promise<StudentPassportResponse> {
    const isOwner = currentUser.id === userId;
    const hasAdminPerm =
      currentUser.permissions.includes(PermissionCode.EXPORT_DATA) ||
      currentUser.permissions.includes(PermissionCode.ROSTER_MANAGE);

    if (!isOwner && !hasAdminPerm) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'You are not authorized to view this student activity passport.',
      });
    }

    return this.aggregationService.getStudentPassport(userId);
  }

  /**
   * Exports and downloads an activity passport PDF for a specified student.
   * Enforces server-side authorization: student may export own passport,
   * administrators require EXPORT_DATA or ROSTER_MANAGE.
   */
  @Authenticated()
  @Post('user/:userId/export')
  async exportStudentPassport(
    @Param('userId') userId: string,
    @ReqUser() currentUser: CurrentUser,
    @Res() res: Response,
  ) {
    const isOwner = currentUser.id === userId;
    const hasAdminPerm =
      currentUser.permissions.includes(PermissionCode.EXPORT_DATA) ||
      currentUser.permissions.includes(PermissionCode.ROSTER_MANAGE);

    if (!isOwner && !hasAdminPerm) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'You are not authorized to export this student activity passport.',
      });
    }

    const { pdfBuffer, filename } = await this.exportService.exportPassport(
      userId,
      currentUser,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.status(HttpStatus.OK).send(pdfBuffer);
  }

  /**
   * Downloads an issued passport PDF by passport ID.
   * Enforces ownership or administrator permission server-side.
   */
  @Authenticated()
  @Get('download/:id')
  async downloadPassportById(
    @Param('id') id: string,
    @ReqUser() currentUser: CurrentUser,
    @Res() res: Response,
  ) {
    const { pdfBuffer, filename } = await this.exportService.getPassportDownload(
      id,
      currentUser,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.status(HttpStatus.OK).send(pdfBuffer);
  }

  /**
   * Administrative revocation of an issued student activity passport.
   * Requires cert.generate permission.
   */
  @Authenticated()
  @RequirePermission(PermissionCode.CERT_GENERATE)
  @Post(':id/revoke')
  async revokePassport(
    @Param('id') id: string,
    @Body() body: unknown,
    @ReqUser() currentUser: CurrentUser,
    @Req() req: Request,
  ) {
    const parseResult = RevokePassportInputSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid passport revocation request payload',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '127.0.0.1';

    return this.verificationService.revokePassport(
      id,
      parseResult.data.reason,
      currentUser.id,
      clientIp,
    );
  }
}

