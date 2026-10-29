'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api-client';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const hasMinLength = newPassword.length >= 10;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasLowercase = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
  const isPasswordValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!token) {
      setErrorMsg('Missing or invalid reset token. Please request a new link.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match');
      return;
    }

    if (!isPasswordValid) {
      setErrorMsg('Password does not satisfy all security requirements');
      return;
    }

    setSubmitting(true);

    try {
      await apiClient.post('/auth/reset-password', {
        token,
        new_password: newPassword,
      });

      setSuccess(true);
      setTimeout(() => {
        router.push('/login');
      }, 2500);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to reset password. Token may be invalid or expired.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-border bg-surface p-8 shadow-sm">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight text-text">
            Set New Password
          </h1>
          <p className="mt-2 text-xs text-text-muted">
            Enter your new secure password to restore access to your account
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-md border border-danger/30 bg-danger/10 p-3 text-xs text-danger"
          >
            {errorMsg}
          </div>
        )}

        {success ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-text">Password Reset Successfully!</p>
            <p className="text-xs text-text-muted">
              All previous sessions have been invalidated. Redirecting you to the sign-in page...
            </p>
            <div className="pt-2">
              <Link
                href="/login"
                className="inline-block rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                Sign In Now
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="newPassword" className="block text-xs font-semibold uppercase tracking-wider text-text">
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-xs font-semibold uppercase tracking-wider text-text">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="rounded-md border border-border bg-surface-raised p-3 text-xs">
              <span className="font-semibold text-text">Password Requirements:</span>
              <ul className="mt-1.5 space-y-1 text-[11px]">
                <li className={`flex items-center gap-1.5 ${hasMinLength ? 'text-success' : 'text-text-muted'}`}>
                  <span>{hasMinLength ? '✓' : '•'}</span> 10+ characters
                </li>
                <li className={`flex items-center gap-1.5 ${hasUppercase ? 'text-success' : 'text-text-muted'}`}>
                  <span>{hasUppercase ? '✓' : '•'}</span> At least 1 uppercase letter
                </li>
                <li className={`flex items-center gap-1.5 ${hasLowercase ? 'text-success' : 'text-text-muted'}`}>
                  <span>{hasLowercase ? '✓' : '•'}</span> At least 1 lowercase letter
                </li>
                <li className={`flex items-center gap-1.5 ${hasNumber ? 'text-success' : 'text-text-muted'}`}>
                  <span>{hasNumber ? '✓' : '•'}</span> At least 1 number
                </li>
                <li className={`flex items-center gap-1.5 ${hasSpecial ? 'text-success' : 'text-text-muted'}`}>
                  <span>{hasSpecial ? '✓' : '•'}</span> At least 1 special character
                </li>
              </ul>
            </div>

            <button
              type="submit"
              disabled={submitting || !isPasswordValid}
              className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Resetting Password...' : 'Save New Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
