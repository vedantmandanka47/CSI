import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { env } from './config/env.js';
import { DenyByDefaultGuard } from './common/guards/deny-by-default.guard.js';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { HealthModule } from './modules/health/health.module.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: true,
                },
              }
            : undefined,
        // SEC-24: Structured logs with field redaction
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'password',
            'token',
            'cookie',
            'authorization',
            'phone',
            'email',
            'password_hash',
            'code_secret',
            '*.password',
            '*.token',
          ],
          censor: '[REDACTED]',
        },
      },
    }),
    HealthModule,
    PrismaModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: DenyByDefaultGuard,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
