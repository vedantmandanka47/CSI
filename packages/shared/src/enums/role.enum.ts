export const RoleCode = {
  GUEST: 'guest',
  EVENT_GUEST: 'event_guest',
  MEMBER: 'member',
  COMMITTEE: 'committee',
  SUBCORE: 'subcore',
  CORE: 'core',
  PRESIDENT: 'president',
  VP: 'vp',
  FACULTY: 'faculty',
  ADMIN: 'admin',
} as const;

export type RoleCode = (typeof RoleCode)[keyof typeof RoleCode];

export const ALL_ROLE_CODES = Object.values(RoleCode);
