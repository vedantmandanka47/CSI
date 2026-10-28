export const PermissionCode = {
  PUBLIC_VIEW: 'public.view',
  SELF_DASHBOARD: 'self.dashboard',
  SELF_IDCARD: 'self.idcard',
  EVENT_REGISTER: 'event.register',
  EVENT_VIEW_OWN: 'event.view_own',
  ATTENDANCE_TAKE: 'attendance.take',
  ATTENDANCE_MANAGE: 'attendance.manage',
  EVENT_CREATE: 'event.create',
  EVENT_EDIT: 'event.edit',
  CERT_GENERATE: 'cert.generate',
  ASSETS_UPLOAD: 'assets.upload',
  WORKSPACE_LOGISTICS: 'workspace.logistics',
  WORKSPACE_TECHNICAL: 'workspace.technical',
  WORKSPACE_GRAPHICS: 'workspace.graphics',
  VENUE_BOOK: 'venue.book',
  EXPORT_DATA: 'export.data',
  ROSTER_MANAGE: 'roster.manage',
  DRIVE_TOGGLE: 'drive.toggle',
  AUDIT_VIEW: 'audit.view',
  SETTINGS_EDIT: 'settings.edit',
} as const;

export type PermissionCode = (typeof PermissionCode)[keyof typeof PermissionCode];

export const ALL_PERMISSION_CODES = Object.values(PermissionCode);
