import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service.js';
import { Public } from '../../common/decorators/public.decorator.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  getLiveness() {
    return this.healthService.getLiveness();
  }

  @Public()
  @Get('ready')
  async getReadiness() {
    return this.healthService.getReadiness();
  }
}
