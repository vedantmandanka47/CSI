import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { IdCardService } from './id-card.service.js';
import { CurrentUser, PermissionCode, VerifyQrPassSchema } from '@csi/shared';
import { RequirePermission, ReqUser, Public } from '../../common/decorators/index.js';
import { RateLimiterService } from '../../common/services/rate-limiter.service.js';

@Controller('id-card')
export class IdCardController {
  constructor(
    private readonly idCardService: IdCardService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  /**
   * Get digital ID card alias
   */
  @Get('me')
  @RequirePermission(PermissionCode.SELF_IDCARD)
  async getIdCard(@ReqUser() currentUser: CurrentUser) {
    this.rateLimiter.assertLimit(`id-card:${currentUser.id}`, 30, 60 * 1000);
    const data = await this.idCardService.getIdCard(currentUser.id);
    return { data };
  }

  /**
   * Cryptographically verify attendee dynamic QR pass (for volunteer/admin scanning)
   */
  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyQrPass(@Body() rawBody: unknown) {
    const parseResult = VerifyQrPassSchema.safeParse(rawBody);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid QR pass verification input',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    const data = await this.idCardService.verifyQrPass(parseResult.data.token);
    return { data };
  }
}
