import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { RateLimiterService } from '../../common/services/rate-limiter.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, RateLimiterService],
  exports: [AuthService, RateLimiterService],
})
export class AuthModule {}
