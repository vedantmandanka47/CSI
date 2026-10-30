'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-surface p-8 shadow-sm">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="relative h-12 w-12 overflow-hidden rounded-md border border-border bg-surface p-1 shadow-sm mb-1">
            <Image
              src="/brand/csi-logo.png"
              alt="CSI GCET Logo"
              width={48}
              height={48}
              className="h-full w-full object-contain"
              priority
            />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-text">
            Account Password Recovery
          </h1>
          <p className="text-xs text-text-muted leading-relaxed max-w-xs">
            Enter your registered GCET student email to generate secure password reset instructions.
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger leading-relaxed"
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
            <div className="space-y-1">
              <p className="text-sm font-semibold text-text">Recovery Request Dispatched</p>
              <p className="text-xs text-text-muted leading-relaxed">
                If an account exists with this email address, cryptographic password reset instructions have been dispatched.
              </p>
            </div>

            {resetToken && (
              <div className="rounded-lg border border-border bg-surface-raised p-4 text-left space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted block">
                  Password Reset Token (Development Mode)
                </span>
                <p className="font-mono text-xs break-all text-primary bg-surface p-2 rounded border border-border/60">
                  {resetToken}
                </p>
                <div className="pt-2 text-center">
                  <Link
                    href={`/reset-password?token=${resetToken}`}
                    className="inline-block text-xs font-semibold text-primary underline hover:opacity-80"
                  >
                    Proceed to Reset Password Now
                  </Link>
                </div>
              </div>
            )}

            <div className="pt-2">
              <Link
                href="/login"
                className="inline-block w-full rounded-md border border-border bg-surface py-2 text-xs font-semibold text-text hover:bg-surface-raised"
              >
                Return to Member Sign In
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="email" className="block text-xs font-semibold text-text">
                Registered Institutional Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@gcet.ac.in"
                className="block w-full rounded-md border border-border bg-surface px-3 py-2 text-xs text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-primary py-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Generating Recovery Token...' : 'Send Password Reset Link'}
              </button>
            </div>

            <div className="border-t border-border pt-4 text-center text-xs text-text-muted">
              Remembered your credentials?{' '}
              <Link href="/login" className="font-semibold text-primary hover:underline">
                Sign In to Member Portal
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
