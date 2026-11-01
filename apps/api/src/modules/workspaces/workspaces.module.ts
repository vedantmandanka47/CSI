import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';
import { WorkspacesController } from './workspaces.controller.js';
import { WorkspacesService } from './workspaces.service.js';
import { TasksService } from './tasks.service.js';
import { ChecklistsService } from './checklists.service.js';
import { AssetsService } from './assets.service.js';
import { WorkspaceAssetStorageService } from './workspace-asset-storage.service.js';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [WorkspacesController],
  providers: [
    WorkspacesService,
    TasksService,
    ChecklistsService,
    AssetsService,
    WorkspaceAssetStorageService,
  ],
  exports: [
    WorkspacesService,
    TasksService,
    ChecklistsService,
    AssetsService,
    WorkspaceAssetStorageService,
  ],
})
export class WorkspacesModule {}
