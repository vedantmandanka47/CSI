import { PermissionCode } from '../enums/permission.enum.js';
import { RoleCode } from '../enums/role.enum.js';

export const PERMISSION_MATRIX: Readonly<Record<RoleCode, ReadonlySet<PermissionCode>>> = {
  [RoleCode.GUEST]: new Set<PermissionCode>([PermissionCode.PUBLIC_VIEW]),

  [RoleCode.EVENT_GUEST]: new Set<PermissionCode>([
    PermissionCode.PUBLIC_VIEW,
    PermissionCode.EVENT_VIEW_OWN,
  ]),

  [RoleCode.MEMBER]: new Set<PermissionCode>([
    PermissionCode.PUBLIC_VIEW,
    PermissionCode.SELF_DASHBOARD,
    PermissionCode.SELF_IDCARD,
    PermissionCode.EVENT_REGISTER,
    PermissionCode.EVENT_VIEW_OWN,
  ]),

  [RoleCode.COMMITTEE]: new Set<PermissionCode>([
    PermissionCode.PUBLIC_VIEW,
    PermissionCode.SELF_DASHBOARD,
    PermissionCode.SELF_IDCARD,
    PermissionCode.EVENT_REGISTER,
    PermissionCode.EVENT_VIEW_OWN,
    PermissionCode.ATTENDANCE_TAKE,
    PermissionCode.ASSETS_UPLOAD,
    PermissionCode.WORKSPACE_LOGISTICS,
    PermissionCode.WORKSPACE_TECHNICAL,
    PermissionCode.WORKSPACE_GRAPHICS,
  ]),

  [RoleCode.SUBCORE]: new Set<PermissionCode>([
    PermissionCode.PUBLIC_VIEW,
    PermissionCode.SELF_DASHBOARD,
    PermissionCode.SELF_IDCARD,
    PermissionCode.EVENT_REGISTER,
    PermissionCode.EVENT_VIEW_OWN,
    PermissionCode.ATTENDANCE_TAKE,
    PermissionCode.ASSETS_UPLOAD,
    PermissionCode.WORKSPACE_LOGISTICS,
    PermissionCode.WORKSPACE_TECHNICAL,
    PermissionCode.WORKSPACE_GRAPHICS,
    PermissionCode.VENUE_BOOK,
  ]),

  [RoleCode.CORE]: new Set<PermissionCode>([
    PermissionCode.PUBLIC_VIEW,
    PermissionCode.SELF_DASHBOARD,
    PermissionCode.SELF_IDCARD,
    PermissionCode.EVENT_REGISTER,
    PermissionCode.EVENT_VIEW_OWN,
    PermissionCode.ATTENDANCE_TAKE,
    PermissionCode.ATTENDANCE_MANAGE,
    PermissionCode.EVENT_CREATE,
    PermissionCode.EVENT_EDIT,
    PermissionCode.CERT_GENERATE,
    PermissionCode.ASSETS_UPLOAD,
    PermissionCode.WORKSPACE_LOGISTICS,
    PermissionCode.WORKSPACE_TECHNICAL,
    PermissionCode.WORKSPACE_GRAPHICS,
    PermissionCode.VENUE_BOOK,
    PermissionCode.EXPORT_DATA,
  ]),

  [RoleCode.PRESIDENT]: new Set<PermissionCode>([
    PermissionCode.PUBLIC_VIEW,
    PermissionCode.SELF_DASHBOARD,
    PermissionCode.SELF_IDCARD,
    PermissionCode.EVENT_REGISTER,
    PermissionCode.EVENT_VIEW_OWN,
    PermissionCode.ATTENDANCE_TAKE,
    PermissionCode.ATTENDANCE_MANAGE,
    PermissionCode.EVENT_CREATE,
    PermissionCode.EVENT_EDIT,
    PermissionCode.CERT_GENERATE,
    PermissionCode.ASSETS_UPLOAD,
    PermissionCode.WORKSPACE_LOGISTICS,
    PermissionCode.WORKSPACE_TECHNICAL,
    PermissionCode.WORKSPACE_GRAPHICS,
    PermissionCode.VENUE_BOOK,
    PermissionCode.EXPORT_DATA,
    PermissionCode.ROSTER_MANAGE,
    PermissionCode.DRIVE_TOGGLE,
    PermissionCode.AUDIT_VIEW,
  ]),

  [RoleCode.VP]: new Set<PermissionCode>([
    PermissionCode.PUBLIC_VIEW,
    PermissionCode.SELF_DASHBOARD,
    PermissionCode.SELF_IDCARD,
    PermissionCode.EVENT_REGISTER,
    PermissionCode.EVENT_VIEW_OWN,
    PermissionCode.ATTENDANCE_TAKE,
    PermissionCode.ATTENDANCE_MANAGE,
    PermissionCode.EVENT_CREATE,
    PermissionCode.EVENT_EDIT,
    PermissionCode.CERT_GENERATE,
    PermissionCode.ASSETS_UPLOAD,
    PermissionCode.WORKSPACE_LOGISTICS,
    PermissionCode.WORKSPACE_TECHNICAL,
    PermissionCode.WORKSPACE_GRAPHICS,
    PermissionCode.VENUE_BOOK,
    PermissionCode.EXPORT_DATA,
    PermissionCode.ROSTER_MANAGE,
    PermissionCode.DRIVE_TOGGLE,
    PermissionCode.AUDIT_VIEW,
  ]),

  [RoleCode.FACULTY]: new Set<PermissionCode>([
    PermissionCode.PUBLIC_VIEW,
    PermissionCode.SELF_DASHBOARD,
    PermissionCode.SELF_IDCARD,
    PermissionCode.EVENT_VIEW_OWN,
    PermissionCode.EXPORT_DATA,
  ]),

  [RoleCode.ADMIN]: new Set<PermissionCode>([
    PermissionCode.PUBLIC_VIEW,
    PermissionCode.SELF_DASHBOARD,
    PermissionCode.SELF_IDCARD,
    PermissionCode.EVENT_REGISTER,
    PermissionCode.EVENT_VIEW_OWN,
    PermissionCode.ATTENDANCE_TAKE,
    PermissionCode.ATTENDANCE_MANAGE,
    PermissionCode.EVENT_CREATE,
    PermissionCode.EVENT_EDIT,
    PermissionCode.CERT_GENERATE,
    PermissionCode.ASSETS_UPLOAD,
    PermissionCode.WORKSPACE_LOGISTICS,
    PermissionCode.WORKSPACE_TECHNICAL,
    PermissionCode.WORKSPACE_GRAPHICS,
    PermissionCode.VENUE_BOOK,
    PermissionCode.EXPORT_DATA,
    PermissionCode.ROSTER_MANAGE,
    PermissionCode.DRIVE_TOGGLE,
    PermissionCode.AUDIT_VIEW,
    PermissionCode.SETTINGS_EDIT,
  ]),
};

/**
 * Checks whether a given role holds the specified permission.
 */
export function roleHasPermission(role: RoleCode, permission: PermissionCode): boolean {
  return PERMISSION_MATRIX[role]?.has(permission) ?? false;
}

/**
 * Computes effective permissions for a set of roles.
 */
export function computeEffectivePermissions(roles: Iterable<RoleCode>): Set<PermissionCode> {
  const effective = new Set<PermissionCode>();
  for (const role of roles) {
    const rolePermissions = PERMISSION_MATRIX[role];
    if (rolePermissions) {
      for (const perm of rolePermissions) {
        effective.add(perm);
      }
    }
  }
  return effective;
}

/**
 * Checks if a set of roles satisfies a required permission.
 */
export function hasPermission(roles: Iterable<RoleCode>, permission: PermissionCode): boolean {
  for (const role of roles) {
    if (PERMISSION_MATRIX[role]?.has(permission)) {
      return true;
    }
  }
  return false;
}
