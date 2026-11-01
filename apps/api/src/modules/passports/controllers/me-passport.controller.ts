import {
  Controller,
  Get,
  Post,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { Authenticated, RequirePermission, ReqUser } from '../../../common/decorators/index.js';
import { CurrentUser, PermissionCode, StudentPassportResponse } from '@csi/shared';
import { PassportAggregationService } from '../services/passport-aggregation.service.js';
import { PassportExportService } from '../services/passport-export.service.js';

@Controller('me/passport')
@Authenticated()
export class MePassportController {
  constructor(
    private readonly aggregationService: PassportAggregationService,
    private readonly exportService: PassportExportService,
  ) {}

  /**
   * Retrieves the authenticated student's own verified activity passport.
   */
  @Get()
  @RequirePermission(PermissionCode.SELF_DASHBOARD)
  async getMyPassport(@ReqUser() currentUser: CurrentUser): Promise<StudentPassportResponse> {
    return this.aggregationService.getStudentPassport(currentUser.id);
  }

  /**
   * Exports and downloads a verified, tamper-evident PDF dossier for the authenticated member.
   */
  @Post('export')
  @RequirePermission(PermissionCode.SELF_DASHBOARD)
  async exportMyPassport(
    @ReqUser() currentUser: CurrentUser,
    @Res() res: Response,
  ) {
    const { pdfBuffer, filename } = await this.exportService.exportPassport(
      currentUser.id,
      currentUser,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.status(HttpStatus.OK).send(pdfBuffer);
  }

  /**
   * Downloads the latest generated passport PDF for the authenticated member.
   */
  @Get('download')
  @RequirePermission(PermissionCode.SELF_DASHBOARD)
  async downloadMyPassport(
    @ReqUser() currentUser: CurrentUser,
    @Res() res: Response,
  ) {
    const { pdfBuffer, filename } = await this.exportService.getLatestPassportDownload(
      currentUser.id,
      currentUser,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.status(HttpStatus.OK).send(pdfBuffer);
  }
}

