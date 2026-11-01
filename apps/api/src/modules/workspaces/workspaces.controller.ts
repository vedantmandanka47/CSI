import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Authenticated, ReqUser } from '../../common/decorators/index.js';
import {
  CurrentUser,
  RoleCode,
  CommitteeWorkspaceDetails,
  CommitteeMemberItem,
  CommitteeWorkspaceEvent,
  CommitteeWorkspaceSession,
  WorkspacesListResponse,
  CreateTaskSchema,
  UpdateTaskSchema,
  TaskResponse,
  TaskListResponse,
  CreateChecklistSchema,
  CreateChecklistItemInputSchema,
  UpdateChecklistItemSchema,
  CreateChecklistRunSchema,
  SignOffChecklistRunSchema,
  ChecklistResponse,
  ChecklistItemResponse,
  ChecklistRunResponse,
  UploadAssetSchema,
  ReviewAssetSchema,
  AssetResponse,
  AssetListResponse,
} from '@csi/shared';
import { WorkspacesService } from './workspaces.service.js';
import { TasksService } from './tasks.service.js';
import { ChecklistsService } from './checklists.service.js';
import { AssetsService } from './assets.service.js';

@Controller()
@Authenticated()
export class WorkspacesController {
  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly tasksService: TasksService,
    private readonly checklistsService: ChecklistsService,
    private readonly assetsService: AssetsService,
  ) {}

  // =========================================================================
  // M15 Workspace Hub & Details
  // =========================================================================

  @Get('me/workspaces')
  async getMyWorkspaces(@ReqUser() currentUser: CurrentUser): Promise<WorkspacesListResponse> {
    const roles = currentUser.roles as RoleCode[];
    return this.workspacesService.getMyWorkspaces(currentUser.id, roles);
  }

  @Get('workspaces/:committeeCode')
  async getWorkspaceDetails(
    @ReqUser() currentUser: CurrentUser,
    @Param('committeeCode') committeeCode: string,
    @Req() req: Request,
  ): Promise<CommitteeWorkspaceDetails> {
    const roles = currentUser.roles as RoleCode[];
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return this.workspacesService.getWorkspaceDetails(
      currentUser.id,
      roles,
      committeeCode,
      ip,
    );
  }

  @Get('workspaces/:committeeCode/members')
  async getWorkspaceMembers(
    @ReqUser() currentUser: CurrentUser,
    @Param('committeeCode') committeeCode: string,
  ): Promise<{ members: CommitteeMemberItem[] }> {
    const roles = currentUser.roles as RoleCode[];
    return this.workspacesService.getWorkspaceMembers(
      currentUser.id,
      roles,
      committeeCode,
    );
  }

  @Get('workspaces/:committeeCode/events')
  async getWorkspaceEvents(
    @ReqUser() currentUser: CurrentUser,
    @Param('committeeCode') committeeCode: string,
  ): Promise<{ events: CommitteeWorkspaceEvent[]; activeSessions: CommitteeWorkspaceSession[] }> {
    const roles = currentUser.roles as RoleCode[];
    return this.workspacesService.getWorkspaceEvents(
      currentUser.id,
      roles,
      committeeCode,
    );
  }

  // =========================================================================
  // M16 Task Management
  // =========================================================================

  @Post('workspaces/:committeeCode/tasks')
  async createTask(
    @ReqUser() currentUser: CurrentUser,
    @Param('committeeCode') committeeCode: string,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<TaskResponse> {
    const input = CreateTaskSchema.parse(body);
    const roles = currentUser.roles as RoleCode[];
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return this.tasksService.createTask(
      currentUser.id,
      roles,
      committeeCode,
      input,
      ip,
    );
  }

  @Get('workspaces/:committeeCode/tasks')
  async getTasks(
    @ReqUser() currentUser: CurrentUser,
    @Param('committeeCode') committeeCode: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('eventId') eventId?: string,
  ): Promise<TaskListResponse> {
    const roles = currentUser.roles as RoleCode[];
    return this.tasksService.getTasks(currentUser.id, roles, committeeCode, {
      status,
      priority,
      assignedToId,
      eventId,
    });
  }

  @Get('workspaces/:committeeCode/tasks/:taskId')
  async getTaskById(
    @ReqUser() currentUser: CurrentUser,
    @Param('committeeCode') committeeCode: string,
    @Param('taskId') taskId: string,
  ): Promise<TaskResponse> {
    const roles = currentUser.roles as RoleCode[];
    return this.tasksService.getTaskById(currentUser.id, roles, committeeCode, taskId);
  }

  @Patch('workspaces/:committeeCode/tasks/:taskId')
  async updateTask(
    @ReqUser() currentUser: CurrentUser,
    @Param('committeeCode') committeeCode: string,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<TaskResponse> {
    const input = UpdateTaskSchema.parse(body);
    const roles = currentUser.roles as RoleCode[];
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return this.tasksService.updateTask(
      currentUser.id,
      roles,
      committeeCode,
      taskId,
      input,
      ip,
    );
  }

  @Delete('workspaces/:committeeCode/tasks/:taskId')
  async deleteTask(
    @ReqUser() currentUser: CurrentUser,
    @Param('committeeCode') committeeCode: string,
    @Param('taskId') taskId: string,
    @Req() req: Request,
  ): Promise<{ success: boolean; taskId: string }> {
    const roles = currentUser.roles as RoleCode[];
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return this.tasksService.deleteTask(
      currentUser.id,
      roles,
      committeeCode,
      taskId,
      ip,
    );
  }

  // =========================================================================
  // M16 Checklists & Pre-Event Run Protocols
  // =========================================================================

  @Post('workspaces/:committeeCode/checklists')
  async createChecklist(
    @ReqUser() currentUser: CurrentUser,
    @Param('committeeCode') committeeCode: string,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<ChecklistResponse> {
    const input = CreateChecklistSchema.parse(body);
    const roles = currentUser.roles as RoleCode[];
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return this.checklistsService.createChecklist(
      currentUser.id,
      roles,
      committeeCode,
      input,
      ip,
    );
  }

  @Get('workspaces/:committeeCode/checklists')
  async getChecklists(
    @ReqUser() currentUser: CurrentUser,
    @Param('committeeCode') committeeCode: string,
  ): Promise<ChecklistResponse[]> {
    const roles = currentUser.roles as RoleCode[];
    return this.checklistsService.getChecklists(currentUser.id, roles, committeeCode);
  }

  @Get('workspaces/:committeeCode/checklists/:checklistId')
  async getChecklistById(
    @ReqUser() currentUser: CurrentUser,
    @Param('committeeCode') committeeCode: string,
    @Param('checklistId') checklistId: string,
  ): Promise<ChecklistResponse> {
    const roles = currentUser.roles as RoleCode[];
    return this.checklistsService.getChecklistById(
      currentUser.id,
      roles,
      committeeCode,
      checklistId,
    );
  }

  @Post('workspaces/:committeeCode/checklists/:checklistId/items')
  async addChecklistItem(
    @ReqUser() currentUser: CurrentUser,
    @Param('committeeCode') committeeCode: string,
    @Param('checklistId') checklistId: string,
    @Body() body: unknown,
  ): Promise<ChecklistItemResponse> {
    const input = CreateChecklistItemInputSchema.parse(body);
    const roles = currentUser.roles as RoleCode[];
    return this.checklistsService.addChecklistItem(
      currentUser.id,
      roles,
      committeeCode,
      checklistId,
      input,
    );
  }

  @Patch('workspaces/:committeeCode/checklists/:checklistId/items/:itemId')
  async updateChecklistItem(
    @ReqUser() currentUser: CurrentUser,
    @Param('committeeCode') committeeCode: string,
    @Param('checklistId') checklistId: string,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
  ): Promise<ChecklistItemResponse> {
    const input = UpdateChecklistItemSchema.parse(body);
    const roles = currentUser.roles as RoleCode[];
    return this.checklistsService.updateChecklistItem(
      currentUser.id,
      roles,
      committeeCode,
      checklistId,
      itemId,
      input,
    );
  }

  @Delete('workspaces/:committeeCode/checklists/:checklistId/items/:itemId')
  async deleteChecklistItem(
    @ReqUser() currentUser: CurrentUser,
    @Param('committeeCode') committeeCode: string,
    @Param('checklistId') checklistId: string,
    @Param('itemId') itemId: string,
  ): Promise<{ success: boolean; itemId: string }> {
    const roles = currentUser.roles as RoleCode[];
    return this.checklistsService.deleteChecklistItem(
      currentUser.id,
      roles,
      committeeCode,
      checklistId,
      itemId,
    );
  }

  @Post('workspaces/:committeeCode/checklist-runs')
  async createChecklistRun(
    @ReqUser() currentUser: CurrentUser,
    @Param('committeeCode') committeeCode: string,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<ChecklistRunResponse> {
    const input = CreateChecklistRunSchema.parse(body);
    const roles = currentUser.roles as RoleCode[];
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return this.checklistsService.createChecklistRun(
      currentUser.id,
      roles,
      committeeCode,
      input,
      ip,
    );
  }

  @Get('workspaces/:committeeCode/checklist-runs')
  async getChecklistRuns(
    @ReqUser() currentUser: CurrentUser,
    @Param('committeeCode') committeeCode: string,
  ): Promise<ChecklistRunResponse[]> {
    const roles = currentUser.roles as RoleCode[];
    return this.checklistsService.getChecklistRuns(currentUser.id, roles, committeeCode);
  }

  @Post('workspaces/:committeeCode/checklist-runs/:runId/sign-off')
  async signOffChecklistRun(
    @ReqUser() currentUser: CurrentUser,
    @Param('committeeCode') committeeCode: string,
    @Param('runId') runId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<ChecklistRunResponse> {
    const input = SignOffChecklistRunSchema.parse(body);
    const roles = currentUser.roles as RoleCode[];
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return this.checklistsService.signOffChecklistRun(
      currentUser.id,
      roles,
      committeeCode,
      runId,
      input,
      ip,
    );
  }

  // =========================================================================
  // M16 Media Asset Pipeline
  // =========================================================================

  @Post('workspaces/:committeeCode/assets')
  async uploadAsset(
    @ReqUser() currentUser: CurrentUser,
    @Param('committeeCode') committeeCode: string,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<AssetResponse> {
    const input = UploadAssetSchema.parse(body);
    const roles = currentUser.roles as RoleCode[];
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return this.assetsService.uploadAsset(
      currentUser.id,
      roles,
      committeeCode,
      input,
      ip,
    );
  }

  @Get('workspaces/:committeeCode/assets')
  async getAssets(
    @ReqUser() currentUser: CurrentUser,
    @Param('committeeCode') committeeCode: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('eventId') eventId?: string,
  ): Promise<AssetListResponse> {
    const roles = currentUser.roles as RoleCode[];
    return this.assetsService.getAssets(currentUser.id, roles, committeeCode, {
      category,
      status,
      eventId,
    });
  }

  @Get('workspaces/:committeeCode/assets/:assetId')
  async getAssetById(
    @ReqUser() currentUser: CurrentUser,
    @Param('committeeCode') committeeCode: string,
    @Param('assetId') assetId: string,
  ): Promise<AssetResponse> {
    const roles = currentUser.roles as RoleCode[];
    return this.assetsService.getAssetById(currentUser.id, roles, committeeCode, assetId);
  }

  @Get('workspaces/:committeeCode/assets/:assetId/download')
  async downloadAsset(
    @ReqUser() currentUser: CurrentUser,
    @Param('committeeCode') committeeCode: string,
    @Param('assetId') assetId: string,
    @Res() res: Response,
  ): Promise<void> {
    const roles = currentUser.roles as RoleCode[];
    const { buffer, fileName, mimeType } = await this.assetsService.downloadAsset(
      currentUser.id,
      roles,
      committeeCode,
      assetId,
    );

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }

  @Post('workspaces/:committeeCode/assets/:assetId/review')
  async reviewAsset(
    @ReqUser() currentUser: CurrentUser,
    @Param('committeeCode') committeeCode: string,
    @Param('assetId') assetId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<AssetResponse> {
    const input = ReviewAssetSchema.parse(body);
    const roles = currentUser.roles as RoleCode[];
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return this.assetsService.reviewAsset(
      currentUser.id,
      roles,
      committeeCode,
      assetId,
      input,
      ip,
    );
  }

  @Delete('workspaces/:committeeCode/assets/:assetId')
  async deleteAsset(
    @ReqUser() currentUser: CurrentUser,
    @Param('committeeCode') committeeCode: string,
    @Param('assetId') assetId: string,
    @Req() req: Request,
  ): Promise<{ success: boolean; assetId: string }> {
    const roles = currentUser.roles as RoleCode[];
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return this.assetsService.deleteAsset(
      currentUser.id,
      roles,
      committeeCode,
      assetId,
      ip,
    );
  }
}
