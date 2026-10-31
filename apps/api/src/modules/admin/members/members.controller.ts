import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MemberAdminService } from './member-admin.service.js';
import {
  MemberApplicationQuerySchema,
  ApplicationActionSchema,
  CurrentUser,
  PermissionCode,
} from '@csi/shared';
import { RequirePermission, ReqUser } from '../../../common/decorators/index.js';

@Controller('admin/members')
export class MembersController {
  constructor(private readonly memberAdminService: MemberAdminService) {}

  /**
   * List student membership applications
   */
  @Get('applications')
  @RequirePermission(PermissionCode.ROSTER_MANAGE)
  async listApplications(@Query() rawQuery: Record<string, unknown>) {
    const parseResult = MemberApplicationQuerySchema.safeParse(rawQuery);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid application query parameters',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    return this.memberAdminService.listApplications(parseResult.data);
  }

  /**
   * Approve student membership application
   */
  @Post('applications/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionCode.ROSTER_MANAGE)
  async approveApplication(
    @Param('id') userId: string,
    @ReqUser() currentUser: CurrentUser,
  ) {
    const data = await this.memberAdminService.approveApplication(userId, currentUser.id);
    return {
      message: 'Student membership application successfully approved.',
      data,
    };
  }

  /**
   * Reject student membership application
   */
  @Post('applications/:id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionCode.ROSTER_MANAGE)
  async rejectApplication(
    @Param('id') userId: string,
    @Body() rawBody: unknown,
    @ReqUser() currentUser: CurrentUser,
  ) {
    let reason: string | undefined;
    if (rawBody && typeof rawBody === 'object') {
      const parseResult = ApplicationActionSchema.safeParse(rawBody);
      if (parseResult.success) {
        reason = parseResult.data.reason;
      }
    }

    const data = await this.memberAdminService.rejectApplication(userId, reason, currentUser.id);
    return {
      message: 'Student membership application rejected.',
      data,
    };
  }
}
