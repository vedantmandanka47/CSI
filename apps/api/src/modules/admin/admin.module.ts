import { Module } from '@nestjs/common';
import { DrivesController } from './drives/drives.controller.js';
import { MembersController } from './members/members.controller.js';
import { DriveWindowsService } from './drives/drive-windows.service.js';
import { MemberAdminService } from './members/member-admin.service.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [DrivesController, MembersController],
  providers: [DriveWindowsService, MemberAdminService],
  exports: [DriveWindowsService, MemberAdminService],
})
export class AdminModule {}
