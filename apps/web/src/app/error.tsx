'use client';

import { useEffect } from 'react';

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
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <h1 className="font-display text-3xl font-bold tracking-tight text-danger sm:text-5xl">
        Something went wrong
      </h1>
      <p className="mt-4 max-w-md text-text-muted">
        An unexpected error occurred while loading this view.
      </p>
      <div className="mt-8">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
