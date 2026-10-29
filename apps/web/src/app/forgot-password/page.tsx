'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { apiClient, ApiError } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await apiClient.post<{ message: string; resetToken?: string }>(
        '/auth/forgot-password',
        { email },
      );
      setSubmitted(true);
      if (res.resetToken) {
        setResetToken(res.resetToken);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to process request. Please try again later.');
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
            Reset Password
          </h1>
          <p className="mt-2 text-xs text-text-muted">
            Enter your registered email address to receive password reset instructions
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

        {submitted ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <p className="text-xs text-text-muted">
              If an account exists with this email address, password reset instructions have been dispatched.
            </p>

            {resetToken && (
              <div className="rounded-md border border-border bg-surface-raised p-3 text-left">
                <span className="text-[10px] uppercase font-bold tracking-wider text-text-muted">
                  Dev / Test Reset Token:
                </span>
                <p className="mt-1 font-mono text-xs break-all text-primary">{resetToken}</p>
                <div className="mt-2 text-center">
                  <Link
                    href={`/reset-password?token=${resetToken}`}
                    className="inline-block text-xs font-semibold text-primary underline"
                  >
                    Proceed to reset password now →
                  </Link>
                </div>
              </div>
            )}

            <div className="pt-2">
              <Link
                href="/login"
                className="inline-block rounded-md border border-border bg-surface px-4 py-2 text-xs font-semibold text-text hover:bg-surface-raised"
              >
                Back to Sign In
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-text">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@gcet.ac.in"
                className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Dispatching Instructions...' : 'Send Reset Link'}
            </button>

            <div className="text-center text-xs text-text-muted">
              Remembered your credentials?{' '}
              <Link href="/login" className="font-semibold text-primary hover:underline">
                Sign In
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
