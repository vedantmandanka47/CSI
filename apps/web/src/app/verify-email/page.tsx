'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api-client';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleVerify = useCallback(async (tokenToVerify: string) => {
    setLoading(true);
    setErrorMsg(null);

    try {
      await apiClient.post('/auth/verify-email', { token: tokenToVerify });
      setSuccess(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Verification failed. Token may be invalid or expired.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      void handleVerify(token);
    }
  }, [token, handleVerify]);

  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-surface p-8 text-center shadow-sm">
        {/* Brand Header */}
        <div className="flex flex-col items-center space-y-2">
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
            Email Verification
          </h1>
          <p className="text-xs text-text-muted leading-relaxed max-w-xs">
            Computer Society of India GCET Student Branch Account Proofing
          </p>
        </div>

        {loading ? (
          <div className="space-y-4 py-6">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-xs text-text-muted">Verifying token with CSI GCET server...</p>
          </div>
        ) : success ? (
          <div className="space-y-4 py-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-text">Email Address Verified</p>
              <p className="text-xs text-text-muted leading-relaxed">
                Your institutional email has been verified and your CSI GCET account is now active.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/login"
                className="inline-block w-full rounded-md bg-primary py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-90 shadow-sm"
              >
                Proceed to Sign In
              </Link>
            </div>
          </div>
        ) : errorMsg ? (
          <div className="space-y-4 py-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger/15 text-danger">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-danger">{errorMsg}</p>
              <p className="text-xs text-text-muted leading-relaxed">
                The verification link may have expired or was already redeemed. You can request a new link from the sign-in page.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/login"
                className="inline-block w-full rounded-md border border-border bg-surface py-2 text-xs font-semibold text-text hover:bg-surface-raised"
              >
                Return to Sign In
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <p className="text-xs text-text-muted leading-relaxed">
              No verification token was detected in the URL. Please open the link sent to your GCET email inbox.
            </p>
            <div className="pt-2">
              <Link
                href="/login"
                className="inline-block w-full rounded-md border border-border bg-surface py-2 text-xs font-semibold text-text hover:bg-surface-raised"
              >
                Go to Sign In
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
