import { describe, it, expect } from 'vitest';
import {
  RoleCode,
  PermissionCode,
  ALL_ROLE_CODES,
  ALL_PERMISSION_CODES,
  PERMISSION_MATRIX,
  roleHasPermission,
  computeEffectivePermissions,
  hasPermission,
  canTransitionEvent,
  EventState,
} from '@csi/shared';

describe('Permission Matrix (Appendix A)', () => {
  it('should cover every defined role code in the matrix', () => {
    expect(Object.keys(PERMISSION_MATRIX).sort()).toEqual([...ALL_ROLE_CODES].sort());
  });

  it('should match the exact matrix snapshot', () => {
    // Convert sets to sorted arrays for reliable deterministic snapshotting
    const snapshot: Record<string, string[]> = {};
    for (const [role, perms] of Object.entries(PERMISSION_MATRIX)) {
      snapshot[role] = Array.from(perms).sort();
    }
    expect(snapshot).toMatchSnapshot();
  });

  it('should grant GUEST only public.view', () => {
    expect(roleHasPermission(RoleCode.GUEST, PermissionCode.PUBLIC_VIEW)).toBe(true);
    expect(roleHasPermission(RoleCode.GUEST, PermissionCode.SELF_DASHBOARD)).toBe(false);
    expect(roleHasPermission(RoleCode.GUEST, PermissionCode.EVENT_REGISTER)).toBe(false);
  });

  it('should grant EVENT_GUEST public.view and event.view_own only', () => {
    expect(roleHasPermission(RoleCode.EVENT_GUEST, PermissionCode.PUBLIC_VIEW)).toBe(true);
    expect(roleHasPermission(RoleCode.EVENT_GUEST, PermissionCode.EVENT_VIEW_OWN)).toBe(true);
    expect(roleHasPermission(RoleCode.EVENT_GUEST, PermissionCode.SELF_DASHBOARD)).toBe(false);
    expect(roleHasPermission(RoleCode.EVENT_GUEST, PermissionCode.EVENT_REGISTER)).toBe(false);
  });

  it('should grant MEMBER standard member permissions', () => {
    const memberPerms = [
      PermissionCode.PUBLIC_VIEW,
      PermissionCode.SELF_DASHBOARD,
      PermissionCode.SELF_IDCARD,
      PermissionCode.EVENT_REGISTER,
      PermissionCode.EVENT_VIEW_OWN,
    ];
    for (const perm of memberPerms) {
      expect(roleHasPermission(RoleCode.MEMBER, perm)).toBe(true);
    }
    expect(roleHasPermission(RoleCode.MEMBER, PermissionCode.ATTENDANCE_TAKE)).toBe(false);
    expect(roleHasPermission(RoleCode.MEMBER, PermissionCode.ROSTER_MANAGE)).toBe(false);
  });

  it('should grant COMMITTEE member permissions plus workspace and attendance take', () => {
    expect(roleHasPermission(RoleCode.COMMITTEE, PermissionCode.ATTENDANCE_TAKE)).toBe(true);
    expect(roleHasPermission(RoleCode.COMMITTEE, PermissionCode.ASSETS_UPLOAD)).toBe(true);
    expect(roleHasPermission(RoleCode.COMMITTEE, PermissionCode.WORKSPACE_LOGISTICS)).toBe(true);
    expect(roleHasPermission(RoleCode.COMMITTEE, PermissionCode.WORKSPACE_TECHNICAL)).toBe(true);
    expect(roleHasPermission(RoleCode.COMMITTEE, PermissionCode.WORKSPACE_GRAPHICS)).toBe(true);
    expect(roleHasPermission(RoleCode.COMMITTEE, PermissionCode.VENUE_BOOK)).toBe(false);
  });

  it('should grant SUBCORE committee permissions plus venue.book', () => {
    expect(roleHasPermission(RoleCode.SUBCORE, PermissionCode.VENUE_BOOK)).toBe(true);
    expect(roleHasPermission(RoleCode.SUBCORE, PermissionCode.ATTENDANCE_MANAGE)).toBe(false);
    expect(roleHasPermission(RoleCode.SUBCORE, PermissionCode.EVENT_CREATE)).toBe(false);
  });

  it('should grant CORE subcore permissions plus management, certs, and export', () => {
    expect(roleHasPermission(RoleCode.CORE, PermissionCode.ATTENDANCE_MANAGE)).toBe(true);
    expect(roleHasPermission(RoleCode.CORE, PermissionCode.EVENT_CREATE)).toBe(true);
    expect(roleHasPermission(RoleCode.CORE, PermissionCode.EVENT_EDIT)).toBe(true);
    expect(roleHasPermission(RoleCode.CORE, PermissionCode.CERT_GENERATE)).toBe(true);
    expect(roleHasPermission(RoleCode.CORE, PermissionCode.EXPORT_DATA)).toBe(true);
    expect(roleHasPermission(RoleCode.CORE, PermissionCode.ROSTER_MANAGE)).toBe(false);
    expect(roleHasPermission(RoleCode.CORE, PermissionCode.DRIVE_TOGGLE)).toBe(false);
    expect(roleHasPermission(RoleCode.CORE, PermissionCode.AUDIT_VIEW)).toBe(false);
  });

  it('should grant PRESIDENT and VP branch administration permissions', () => {
    for (const role of [RoleCode.PRESIDENT, RoleCode.VP]) {
      expect(roleHasPermission(role, PermissionCode.ROSTER_MANAGE)).toBe(true);
      expect(roleHasPermission(role, PermissionCode.DRIVE_TOGGLE)).toBe(true);
      expect(roleHasPermission(role, PermissionCode.AUDIT_VIEW)).toBe(true);
      expect(roleHasPermission(role, PermissionCode.SETTINGS_EDIT)).toBe(false);
    }
  });

  it('should grant FACULTY dashboard, idcard, event view, and data export only', () => {
    expect(roleHasPermission(RoleCode.FACULTY, PermissionCode.PUBLIC_VIEW)).toBe(true);
    expect(roleHasPermission(RoleCode.FACULTY, PermissionCode.SELF_DASHBOARD)).toBe(true);
    expect(roleHasPermission(RoleCode.FACULTY, PermissionCode.SELF_IDCARD)).toBe(true);
    expect(roleHasPermission(RoleCode.FACULTY, PermissionCode.EVENT_VIEW_OWN)).toBe(true);
    expect(roleHasPermission(RoleCode.FACULTY, PermissionCode.EXPORT_DATA)).toBe(true);
    expect(roleHasPermission(RoleCode.FACULTY, PermissionCode.EVENT_REGISTER)).toBe(false);
    expect(roleHasPermission(RoleCode.FACULTY, PermissionCode.ATTENDANCE_TAKE)).toBe(false);
  });

  it('should grant ADMIN all permissions including settings.edit', () => {
    for (const perm of ALL_PERMISSION_CODES) {
      expect(roleHasPermission(RoleCode.ADMIN, perm)).toBe(true);
    }
  });

  it('should compute effective permissions union across multiple roles', () => {
    const roles = [RoleCode.MEMBER, RoleCode.COMMITTEE];
    const effective = computeEffectivePermissions(roles);
    expect(effective.has(PermissionCode.PUBLIC_VIEW)).toBe(true);
    expect(effective.has(PermissionCode.EVENT_REGISTER)).toBe(true);
    expect(effective.has(PermissionCode.ATTENDANCE_TAKE)).toBe(true);
    expect(effective.has(PermissionCode.ROSTER_MANAGE)).toBe(false);
  });

  it('should check hasPermission across multiple roles', () => {
    expect(hasPermission([RoleCode.MEMBER], PermissionCode.ATTENDANCE_TAKE)).toBe(false);
    expect(
      hasPermission([RoleCode.MEMBER, RoleCode.COMMITTEE], PermissionCode.ATTENDANCE_TAKE),
    ).toBe(true);
  });
});

describe('Event State Machine', () => {
  it('should allow valid transitions', () => {
    expect(canTransitionEvent(EventState.DRAFT, EventState.PUBLISHED)).toBe(true);
    expect(canTransitionEvent(EventState.PUBLISHED, EventState.REGISTRATION_OPEN)).toBe(true);
    expect(canTransitionEvent(EventState.REGISTRATION_OPEN, EventState.LIVE)).toBe(true);
    expect(canTransitionEvent(EventState.LIVE, EventState.COMPLETED)).toBe(true);
    expect(canTransitionEvent(EventState.COMPLETED, EventState.CERTIFIED)).toBe(true);
  });

  it('should reject invalid transitions', () => {
    expect(canTransitionEvent(EventState.DRAFT, EventState.LIVE)).toBe(false);
    expect(canTransitionEvent(EventState.COMPLETED, EventState.LIVE)).toBe(false);
    expect(canTransitionEvent(EventState.CERTIFIED, EventState.DRAFT)).toBe(false);
    expect(canTransitionEvent(EventState.CANCELLED, EventState.LIVE)).toBe(false);
  });
});
