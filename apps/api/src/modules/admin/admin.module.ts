import { Module } from '@nestjs/common';
import { DrivesController } from './drives.controller.js';
import { MembersController } from './members.controller.js';
import { DriveWindowsService } from './drive-windows.service.js';
import { MemberAdminService } from './member-admin.service.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [DrivesController, MembersController],
  providers: [DriveWindowsService, MemberAdminService],
  exports: [DriveWindowsService, MemberAdminService],
})
export class AdminModule {}
