import { Controller, Get } from '@nestjs/common';
import { IdCardService } from './id-card.service.js';
import { CurrentUser, PermissionCode } from '@csi/shared';
import { RequirePermission, ReqUser } from '../../common/decorators/index.js';
import { RateLimiterService } from '../../common/services/rate-limiter.service.js';

@Controller('me')
export class MeIdCardController {
  constructor(
    private readonly idCardService: IdCardService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  /**
   * Get authenticated user's digital membership ID card and signed QR pass (prompt.md §762).
   */
  @Get('id-card')
  @RequirePermission(PermissionCode.SELF_IDCARD)
  async getIdCard(@ReqUser() currentUser: CurrentUser) {
    this.rateLimiter.assertLimit(`id-card:${currentUser.id}`, 30, 60 * 1000);
    const data = await this.idCardService.getIdCard(currentUser.id);
    return { data };
  }
}
