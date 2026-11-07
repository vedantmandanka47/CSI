import { describe, it, expect } from 'vitest';
import {
  SignupPayloadSchema,
  LoginPayloadSchema,
  ForgotPasswordPayloadSchema,
  ResetPasswordPayloadSchema,
  VerifyEmailPayloadSchema,
  CurrentUserSchema,
} from '@csi/shared';

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

  it('accepts both @gcet.ac.in and @gcet.edu.in institutional email domains on signup (TASK-018 / F04)', () => {
    const acIn = SignupPayloadSchema.parse({
      email: 'student@gcet.ac.in',
      password: 'StrongPassword123!',
      full_name: 'GCET Student',
    });
    expect(acIn.email).toBe('student@gcet.ac.in');

    const eduIn = SignupPayloadSchema.parse({
      email: 'student@gcet.edu.in',
      password: 'StrongPassword123!',
      full_name: 'GCET Student',
    });
    expect(eduIn.email).toBe('student@gcet.edu.in');
  });

  it('rejects non-institutional email domains on signup (TASK-018 / F04)', () => {
    const nonInstitutional = [
      'student@gmail.com',
      'student@yahoo.co.in',
      'student@outlook.com',
      'student@fake-gcet.edu.in',
      'student@gcet.edu.in.attacker.com',
    ];

    for (const email of nonInstitutional) {
      expect(() =>
        SignupPayloadSchema.parse({
          email,
          password: 'StrongPassword123!',
          full_name: 'External Person',
        }),
      ).toThrow();
    }
  });

  it('validates enrollment number formats and normalizes empty string to null (TASK-018 / F04)', () => {
    // 12-digit numeric
    const numeric = SignupPayloadSchema.parse({
      email: 'student@gcet.ac.in',
      password: 'StrongPassword123!',
      full_name: 'Numeric Student',
      enrollment_no: '210010116099',
    });
    expect(numeric.enrollment_no).toBe('210010116099');

    // Alphanumeric
    const alphaNum = SignupPayloadSchema.parse({
      email: 'student@gcet.ac.in',
      password: 'StrongPassword123!',
      full_name: 'AlphaNum Student',
      enrollment_no: '23CS101',
    });
    expect(alphaNum.enrollment_no).toBe('23CS101');

    // Empty string normalized to null
    const emptyString = SignupPayloadSchema.parse({
      email: 'student@gcet.ac.in',
      password: 'StrongPassword123!',
      full_name: 'Empty No Student',
      enrollment_no: '',
    });
    expect(emptyString.enrollment_no).toBeNull();

    // Reject too short or special characters
    expect(() =>
      SignupPayloadSchema.parse({
        email: 'student@gcet.ac.in',
        password: 'StrongPassword123!',
        full_name: 'Short No Student',
        enrollment_no: '123',
      }),
    ).toThrow();

    expect(() =>
      SignupPayloadSchema.parse({
        email: 'student@gcet.ac.in',
        password: 'StrongPassword123!',
        full_name: 'Invalid No Student',
        enrollment_no: '21CS!@#01',
      }),
    ).toThrow();
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

  it('validates current user schema with both full_name and optional name (U4)', () => {
    const user = CurrentUserSchema.parse({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      email: 'admin@gcet.ac.in',
      name: 'Site Admin',
      full_name: 'Site Admin',
      status: 'active',
      enrollment_no: null,
      avatar_url: null,
      roles: ['admin'],
      permissions: ['ALL'],
    });
    expect(user.roles).toContain('admin');
    expect(user.full_name).toBe('Site Admin');
    expect(user.name).toBe('Site Admin');
  });
});

