import { Module } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service.js';
import { AuditLogsController } from './audit-logs.controller.js';

@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsService],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}
