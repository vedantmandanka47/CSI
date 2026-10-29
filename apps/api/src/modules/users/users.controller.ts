import { Controller, Get, Patch, Param, Query, Body, Req } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { PermissionCode, UserQuerySchema, UpdateUserStatusSchema } from '@csi/shared';
import { Request } from 'express';

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
    @Req() req: Request,
  ) {
    const body = UpdateUserStatusSchema.parse(rawBody);
    const actorId = (req as unknown as { user?: { id: string } }).user?.id;
    const user = await this.usersService.updateStatus(id, body.status, actorId, body.reason);
    return { data: user };
  }
}

