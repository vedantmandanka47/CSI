import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { RequirePermission, Authenticated, ReqUser } from '../../common/decorators/index.js';
import {
  PermissionCode,
  ErrorCode,
  CurrentUser,
  UserQuerySchema,
  UpdateUserStatusSchema,
  UpdatePhotoConsentSchema,
} from '@csi/shared';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @RequirePermission(PermissionCode.ROSTER_MANAGE)
  @Get()
  async getUsers(@Query() rawQuery: Record<string, unknown>) {
    const query = UserQuerySchema.parse(rawQuery);
    return this.usersService.findAll(query);
  }

  @RequirePermission(PermissionCode.ROSTER_MANAGE)
  @Get(':id')
  async getUserById(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    return { data: user };
  }

  @RequirePermission(PermissionCode.ROSTER_MANAGE)
  @Patch(':id/status')
  async updateUserStatus(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @ReqUser() currentUser: CurrentUser,
  ) {
    const body = UpdateUserStatusSchema.parse(rawBody);
    const user = await this.usersService.updateStatus(id, body.status, currentUser.id, body.reason);
    return { data: user };
  }

  @Authenticated()
  @Patch(':id/photo-consent')
  async updatePhotoConsent(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @ReqUser() currentUser: CurrentUser,
  ) {
    const isSelf = currentUser.id === id;
    const hasRosterManage =
      currentUser.roles?.includes('admin') ||
      currentUser.roles?.includes('president') ||
      currentUser.permissions?.includes(PermissionCode.ROSTER_MANAGE);

    if (!isSelf && !hasRosterManage) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'You are not authorized to update photo consent for another member',
      });
    }

    const body = UpdatePhotoConsentSchema.parse(rawBody);
    const user = await this.usersService.updatePhotoConsent(id, body.photo_consent, currentUser.id);
    return { data: user };
  }
}
