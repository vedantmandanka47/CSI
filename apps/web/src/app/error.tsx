'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log unexpected client error securely
    console.error('Unhandled web application error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[calc(100vh-12rem)] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="max-w-md space-y-4 rounded-xl border border-border bg-surface p-8 shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger/15 text-danger">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-text">
          Service Request Error
        </h1>
        <p className="text-xs text-text-muted leading-relaxed">
          An unexpected error occurred while rendering this interface view. You can attempt to retry the request or return to the main portal.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 shadow-sm"
          >
            Retry Request
          </button>
          <Link
            href="/"
            className="rounded-md border border-border bg-surface px-4 py-2 text-xs font-semibold text-text hover:bg-surface-raised"
          >
            Return to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
