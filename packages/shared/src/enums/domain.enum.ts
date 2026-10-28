export const UserStatus = {
  PENDING: 'pending',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  GRADUATED: 'graduated',
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const EventState = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  REGISTRATION_OPEN: 'registration_open',
  LIVE: 'live',
  COMPLETED: 'completed',
  CERTIFIED: 'certified',
  CANCELLED: 'cancelled',
} as const;

export type EventState = (typeof EventState)[keyof typeof EventState];

export const RegistrationStatus = {
  REGISTERED: 'registered',
  WAITLISTED: 'waitlisted',
  CANCELLED: 'cancelled',
  ATTENDED: 'attended',
  NO_SHOW: 'no_show',
} as const;

export type RegistrationStatus = (typeof RegistrationStatus)[keyof typeof RegistrationStatus];

export const AttendanceAudience = {
  PARTICIPANTS: 'participants',
  VOLUNTEERS: 'volunteers',
  SUBCORE: 'subcore',
  CORE: 'core',
} as const;

export type AttendanceAudience = (typeof AttendanceAudience)[keyof typeof AttendanceAudience];

export const AttendanceMethod = {
  QR_SCAN: 'qr_scan',
  ROTATING_CODE: 'rotating_code',
  MANUAL: 'manual',
} as const;

export type AttendanceMethod = (typeof AttendanceMethod)[keyof typeof AttendanceMethod];

export const RecipientType = {
  MEMBER: 'member',
  GUEST: 'guest',
} as const;

export type RecipientType = (typeof RecipientType)[keyof typeof RecipientType];
