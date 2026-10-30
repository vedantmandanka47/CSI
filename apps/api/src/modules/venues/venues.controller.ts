import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { VenuesService } from './venues.service.js';
import {
  CreateVenueSchema,
  UpdateVenueSchema,
  VenueQuerySchema,
  PermissionCode,
  CurrentUser,
} from '@csi/shared';
import { Public, RequirePermission, ReqUser } from '../../common/decorators/index.js';

@Controller('venues')
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  /**
   * Public list of campus venues (filtered for public view if not admin/venue.book).
   */
  @Public()
  @Get()
  async listVenues(
    @Query() rawQuery: Record<string, unknown>,
    @ReqUser() currentUser?: CurrentUser,
  ) {
    const parseResult = VenueQuerySchema.safeParse(rawQuery);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid venue query parameters.',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    const isAdmin =
      currentUser?.permissions?.includes(PermissionCode.VENUE_BOOK) ?? false;
    const data = await this.venuesService.listVenues(parseResult.data, isAdmin);
    return { data };
  }

  /**
   * Venue details by ID.
   */
  @Public()
  @Get(':id')
  async getVenueById(
    @Param('id') id: string,
    @ReqUser() currentUser?: CurrentUser,
  ) {
    const isAdmin =
      currentUser?.permissions?.includes(PermissionCode.VENUE_BOOK) ?? false;
    const data = await this.venuesService.getVenueById(id, isAdmin);
    return { data };
  }

  /**
   * Create a new campus venue record (Core/Admin).
   */
  @Post()
  @RequirePermission(PermissionCode.VENUE_BOOK)
  async createVenue(
    @Body() rawBody: unknown,
    @ReqUser() currentUser: CurrentUser,
  ) {
    const parseResult = CreateVenueSchema.safeParse(rawBody);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid venue creation data.',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    const data = await this.venuesService.createVenue(parseResult.data, currentUser.id);
    return { data };
  }

  /**
   * Update an existing campus venue record.
   */
  @Put(':id')
  @RequirePermission(PermissionCode.VENUE_BOOK)
  async updateVenue(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @ReqUser() currentUser: CurrentUser,
  ) {
    const parseResult = UpdateVenueSchema.safeParse(rawBody);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid venue update data.',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    const data = await this.venuesService.updateVenue(id, parseResult.data, currentUser.id);
    return { data };
  }
}

