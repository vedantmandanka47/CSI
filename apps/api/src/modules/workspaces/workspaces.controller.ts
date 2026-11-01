import {
  Controller,
  Get,
  Param,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Authenticated, ReqUser } from '../../common/decorators/index.js';
import {
  CurrentUser,
  RoleCode,
  CommitteeWorkspaceDetails,
  CommitteeMemberItem,
  CommitteeWorkspaceEvent,
  CommitteeWorkspaceSession,
  WorkspacesListResponse,
} from '@csi/shared';
import { WorkspacesService } from './workspaces.service.js';

@Controller()
@Authenticated()
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  /**
   * List all committee workspaces accessible to the authenticated user.
   * Executive roles receive branch-wide oversight across all committees.
   */
  @Get('me/workspaces')
  async getMyWorkspaces(@ReqUser() currentUser: CurrentUser): Promise<WorkspacesListResponse> {
    const roles = currentUser.roles as RoleCode[];
    return this.workspacesService.getMyWorkspaces(currentUser.id, roles);
  }

  /**
   * Retrieve full workspace details, team roster, metrics, and operations for a specific committee.
   * Enforces committee membership, active tenure, and cross-committee security boundaries.
   */
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

  /**
   * Retrieve active team members roster for a committee workspace.
   */
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

  /**
   * Retrieve operational events and open attendance sessions for a committee workspace.
   */
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
}
