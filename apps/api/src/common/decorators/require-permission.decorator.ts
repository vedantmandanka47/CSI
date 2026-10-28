import { SetMetadata } from '@nestjs/common';
import { PermissionCode } from '@csi/shared';

export const PERMISSION_KEY = 'requiredPermission';
export const RequirePermission = (permission: PermissionCode) =>
  SetMetadata(PERMISSION_KEY, permission);
