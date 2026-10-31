import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DriveWindowsService } from './drive-windows.service.js';
import {
  CreateDriveWindowSchema,
  UpdateDriveWindowSchema,
  ToggleDriveWindowSchema,
  CurrentUser,
  PermissionCode,
} from '@csi/shared';
import { RequirePermission, ReqUser } from '../../../common/decorators/index.js';

@Controller('admin/drives')
export class DrivesController {
  constructor(private readonly driveService: DriveWindowsService) {}

  /**
   * List all configured recruitment drive windows
   */
  @Get()
  @RequirePermission(PermissionCode.DRIVE_TOGGLE)
  async listDrives() {
    const data = await this.driveService.listAllWindows();
    return { data };
  }

  /**
   * Create or update drive window
   */
  @Post()
  @RequirePermission(PermissionCode.DRIVE_TOGGLE)
  async createDrive(
    @Body() rawBody: unknown,
    @ReqUser() currentUser: CurrentUser,
  ) {
    const parseResult = CreateDriveWindowSchema.safeParse(rawBody);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid drive window parameters',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    const data = await this.driveService.createOrUpdateWindow(parseResult.data, currentUser.id);
    return { data };
  }

  /**
   * Toggle drive window active state (per Appendix C: POST /api/admin/drives/{type})
   */
  @Post(':type')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionCode.DRIVE_TOGGLE)
  async toggleDrive(
    @Param('type') type: string,
    @Body() rawBody: unknown,
    @ReqUser() currentUser: CurrentUser,
  ) {
    let isOpen: boolean | undefined;
    if (rawBody && typeof rawBody === 'object' && 'is_open' in rawBody) {
      const parseResult = ToggleDriveWindowSchema.safeParse(rawBody);
      if (parseResult.success) {
        isOpen = parseResult.data.is_open;
      }
    }

    const data = await this.driveService.toggleWindow(type, isOpen, currentUser.id);
    return { data };
  }

  /**
   * Update drive window
   */
  @Put(':id')
  @RequirePermission(PermissionCode.DRIVE_TOGGLE)
  async updateDrive(
    @Param('id') _id: string,
    @Body() rawBody: unknown,
    @ReqUser() currentUser: CurrentUser,
  ) {
    const parseResult = UpdateDriveWindowSchema.safeParse(rawBody);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid drive window update parameters',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    const data = await this.driveService.createOrUpdateWindow(
      {
        type: 'membership',
        opens_at: parseResult.data.opens_at || new Date().toISOString(),
        closes_at: parseResult.data.closes_at || new Date().toISOString(),
        is_open: parseResult.data.is_open ?? true,
      },
      currentUser.id,
    );
    return { data };
  }
}
