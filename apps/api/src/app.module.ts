import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { env } from './config/env.js';
import { DenyByDefaultGuard } from './common/guards/deny-by-default.guard.js';
import { CsrfGuard } from './common/guards/csrf.guard.js';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { AuthMiddleware } from './common/middleware/auth.middleware.js';
import { HealthModule } from './modules/health/health.module.js';
import { RolesModule } from './modules/roles/roles.module.js';
import { CommitteesModule } from './modules/committees/committees.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module.js';
import { PublicModule } from './modules/public/public.module.js';
import { EventsModule } from './modules/events/events.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { IdCardModule } from './modules/id-card/id-card.module.js';
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
    RolesModule,
    CommitteesModule,
    UsersModule,
    AuthModule,
    AuditLogsModule,
    PublicModule,
    EventsModule,
    AdminModule,
    IdCardModule,
    PrismaModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
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
    consumer.apply(RequestIdMiddleware, AuthMiddleware).forRoutes('*');
  }
}
