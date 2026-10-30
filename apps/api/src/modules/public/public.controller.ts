import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { PublicService } from './public.service.js';
import { PublicStatusResponse } from '@csi/shared';

@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Public()
  @Get('status')
  async getStatus(): Promise<PublicStatusResponse> {
    return this.publicService.getStatus();
  }
}

