import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';
import { WorkspacesController } from './workspaces.controller.js';
import { WorkspacesService } from './workspaces.service.js';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
