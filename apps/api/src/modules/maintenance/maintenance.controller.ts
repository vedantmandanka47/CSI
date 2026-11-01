import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { RetentionService, RetentionPurgeSummary } from './retention.service.js';
import { RequirePermission, ReqUser } from '../../common/decorators/index.js';
import { CurrentUser, PermissionCode } from '@csi/shared';
import { RateLimiterService } from '../../common/services/rate-limiter.service.js';

@Controller('admin/maintenance')
export class MaintenanceController {
  constructor(
    private readonly retentionService: RetentionService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  /**
   * Triggers automated DPDP data retention purge & guest anonymization job.
   * Purges expired sessions, expired verification tokens, and anonymizes concluded event guest records.
   */
  @RequirePermission(PermissionCode.ROSTER_MANAGE)
  @Post('retention-purge')
  @HttpCode(HttpStatus.OK)
  async triggerRetentionPurge(
    @ReqUser() currentUser: CurrentUser,
    @Query('guestRetentionDays') guestRetentionDays?: string,
  ): Promise<{ data: RetentionPurgeSummary }> {
    this.rateLimiter.assertLimit(`retention-purge:${currentUser.id}`, 5, 60 * 1000);

    const days = guestRetentionDays ? parseInt(guestRetentionDays, 10) : 90;
    const summary = await this.retentionService.runRetentionPurge(
      currentUser.id,
      isNaN(days) ? 90 : days,
    );

    return { data: summary };
  }
}
