import { z } from 'zod';
import { UserStatusSchema } from './user.schema.js';

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.string().email('Invalid email address'));

export const PasswordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password cannot exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const SignupPayloadSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  full_name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name cannot exceed 100 characters').trim(),
  enrollment_no: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
});

export type SignupPayload = z.infer<typeof SignupPayloadSchema>;

export const LoginPayloadSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Password is required'),
});

export type LoginPayload = z.infer<typeof LoginPayloadSchema>;

export const ForgotPasswordPayloadSchema = z.object({
  email: EmailSchema,
});

export type ForgotPasswordPayload = z.infer<typeof ForgotPasswordPayloadSchema>;

export const ResetPasswordPayloadSchema = z.object({
  token: z.string().min(1, 'Reset token is required').trim(),
  new_password: PasswordSchema,
});

export type ResetPasswordPayload = z.infer<typeof ResetPasswordPayloadSchema>;

export const VerifyEmailPayloadSchema = z.object({
  token: z.string().min(1, 'Verification token is required').trim(),
});

export type VerifyEmailPayload = z.infer<typeof VerifyEmailPayloadSchema>;

export const CurrentUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string(),
  name: z.string().optional(),
  status: UserStatusSchema,
  enrollment_no: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
});

export type CurrentUser = z.infer<typeof CurrentUserSchema>;

export const AuthSessionResponseSchema = z.object({
  message: z.string(),
  user: CurrentUserSchema,
});

export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;
