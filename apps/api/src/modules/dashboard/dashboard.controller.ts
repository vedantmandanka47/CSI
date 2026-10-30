import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service.js';
import { CurrentUser, PermissionCode } from '@csi/shared';
import { RequirePermission, ReqUser } from '../../common/decorators/index.js';
import { RateLimiterService } from '../../common/services/rate-limiter.service.js';

@Controller()
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  /**
   * Retrieve the authenticated member's self-service dashboard data.
   */
  @Get('me/dashboard')
  @RequirePermission(PermissionCode.SELF_DASHBOARD)
  async getMyDashboard(@ReqUser() currentUser: CurrentUser) {
    this.rateLimiter.assertLimit(`dashboard:${currentUser.id}`, 30, 60 * 1000);
    const data = await this.dashboardService.getMemberDashboard(currentUser.id);
    return { data };
  }

  /**
   * Alias: GET /api/dashboard
   */
  @Get('dashboard')
  @RequirePermission(PermissionCode.SELF_DASHBOARD)
  async getDashboardAlias(@ReqUser() currentUser: CurrentUser) {
    this.rateLimiter.assertLimit(`dashboard:${currentUser.id}`, 30, 60 * 1000);
    const data = await this.dashboardService.getMemberDashboard(currentUser.id);
    return { data };
  }
}

