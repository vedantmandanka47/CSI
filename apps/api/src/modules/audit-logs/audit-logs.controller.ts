import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service.js';
import { AuditLogQuerySchema, AuditLogResponse, PermissionCode } from '@csi/shared';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';

@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @RequirePermission(PermissionCode.AUDIT_VIEW)
  @Get()
  async getAuditLogs(@Query() rawQuery: unknown): Promise<AuditLogResponse> {
    const parsed = AuditLogQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid audit log query parameters',
        fields: parsed.error.flatten().fieldErrors,
      });
    }

    return this.auditLogsService.findAll(parsed.data);
  }
}
