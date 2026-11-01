import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TermsService } from './terms.service.js';
import { RolloverService } from './rollover.service.js';
import {
  CreateAcademicTermSchema,
  UpdateAcademicTermSchema,
  RolloverPreviewRequestSchema,
  ExecuteRolloverRequestSchema,
  CurrentUser,
  PermissionCode,
} from '@csi/shared';
import { RequirePermission, ReqUser } from '../../common/decorators/index.js';

@Controller('admin')
export class TermsController {
  constructor(
    private readonly termsService: TermsService,
    private readonly rolloverService: RolloverService,
  ) {}

  /**
   * List all academic terms
   */
  @Get('terms')
  @RequirePermission(PermissionCode.ROSTER_MANAGE)
  async getTerms() {
    return this.termsService.getTerms();
  }

  /**
   * Create a new academic term
   */
  @Post('terms')
  @RequirePermission(PermissionCode.ROSTER_MANAGE)
  async createTerm(
    @ReqUser() user: CurrentUser,
    @Body() body: unknown,
  ) {
    const parseResult = CreateAcademicTermSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid academic term input parameters',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    return this.termsService.createTerm(user.id, parseResult.data);
  }

  /**
   * Get an academic term by ID
   */
  @Get('terms/:id')
  @RequirePermission(PermissionCode.ROSTER_MANAGE)
  async getTermById(@Param('id') id: string) {
    return this.termsService.getTermById(id);
  }

  /**
   * Update an academic term
   */
  @Patch('terms/:id')
  @RequirePermission(PermissionCode.ROSTER_MANAGE)
  async updateTerm(
    @ReqUser() user: CurrentUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parseResult = UpdateAcademicTermSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid update parameters',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    return this.termsService.updateTerm(user.id, id, parseResult.data);
  }

  /**
   * Delete a draft academic term
   */
  @Delete('terms/:id')
  @RequirePermission(PermissionCode.ROSTER_MANAGE)
  async deleteTerm(
    @ReqUser() user: CurrentUser,
    @Param('id') id: string,
  ) {
    return this.termsService.deleteTerm(user.id, id);
  }

  /**
   * Get historical snapshot of an academic term
   */
  @Get('terms/:id/snapshot')
  @RequirePermission(PermissionCode.ROSTER_MANAGE)
  async getTermSnapshot(@Param('id') id: string) {
    return this.rolloverService.getTermSnapshot(id);
  }

  /**
   * Preview proposed annual rollover transition
   */
  @Post('rollover/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionCode.ROSTER_MANAGE)
  async previewRollover(@Body() body: unknown) {
    const parseResult = RolloverPreviewRequestSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid rollover preview request parameters',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    return this.rolloverService.generatePreview(parseResult.data);
  }

  /**
   * Execute annual rollover transition
   */
  @Post('rollover/execute')
  @RequirePermission(PermissionCode.ROSTER_MANAGE)
  async executeRollover(
    @ReqUser() user: CurrentUser,
    @Body() body: unknown,
  ) {
    const parseResult = ExecuteRolloverRequestSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid rollover execution parameters',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    return this.rolloverService.executeRollover(user.id, parseResult.data);
  }

  /**
   * Get history of executed rollovers
   */
  @Get('rollover/history')
  @RequirePermission(PermissionCode.ROSTER_MANAGE)
  async getRolloverHistory() {
    return this.rolloverService.getRolloverHistory();
  }
}
