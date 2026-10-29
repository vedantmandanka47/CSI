import { describe, it, expect } from 'vitest';
import {
  SignupPayloadSchema,
  LoginPayloadSchema,
  ForgotPasswordPayloadSchema,
  ResetPasswordPayloadSchema,
  VerifyEmailPayloadSchema,
  CurrentUserSchema,
} from '../src/schemas/auth.schema.js';

describe('Auth Schemas', () => {
  it('validates correct signup payload and normalizes email', () => {
    const parsed = SignupPayloadSchema.parse({
      email: '  STUDENT@GCET.AC.IN  ',
      password: 'StrongPassword123!',
      full_name: 'Jane Doe',
      enrollment_no: '210010116001',
    });

    expect(parsed.email).toBe('student@gcet.ac.in');
    expect(parsed.full_name).toBe('Jane Doe');
    expect(parsed.enrollment_no).toBe('210010116001');
  });

  it('rejects weak passwords for signup', () => {
    const weakPasswords = [
      'short1!',
      'nouppercase123!',
      'NOLOWERCASE123!',
      'NoSpecialChar123',
      'NoNumberChar!',
    ];

    for (const password of weakPasswords) {
      expect(() =>
        SignupPayloadSchema.parse({
          email: 'test@gcet.ac.in',
          password,
          full_name: 'Test User',
        }),
      ).toThrow();
    }
  });

  it('validates login payload', () => {
    const parsed = LoginPayloadSchema.parse({
      email: '  USER@GCET.AC.IN  ',
      password: 'mypassword',
    });
    expect(parsed.email).toBe('user@gcet.ac.in');
    expect(parsed.password).toBe('mypassword');
  });

  it('validates forgot password and reset password schemas', () => {
    const forgot = ForgotPasswordPayloadSchema.parse({ email: 'user@gcet.ac.in' });
    expect(forgot.email).toBe('user@gcet.ac.in');

    const reset = ResetPasswordPayloadSchema.parse({
      token: 'tok-12345',
      new_password: 'ValidPassword123!',
    });
    expect(reset.token).toBe('tok-12345');
    expect(reset.new_password).toBe('ValidPassword123!');
  });

  it('validates verify email payload', () => {
    const verify = VerifyEmailPayloadSchema.parse({ token: 'abc123token' });
    expect(verify.token).toBe('abc123token');
  });

  it('validates current user schema', () => {
    const user = CurrentUserSchema.parse({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      email: 'admin@gcet.ac.in',
      full_name: 'Site Admin',
      status: 'active',
      enrollment_no: null,
      avatar_url: null,
      roles: ['admin'],
      permissions: ['ALL'],
    });
    expect(user.roles).toContain('admin');
  });
});

