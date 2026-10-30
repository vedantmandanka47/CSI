import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-12rem)] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="max-w-md space-y-4 rounded-xl border border-border bg-surface p-8 shadow-sm">
        <span className="font-mono text-3xl font-extrabold text-primary">404</span>
        <h1 className="font-display text-2xl font-bold tracking-tight text-text">
          Page Not Found
        </h1>
        <p className="text-xs text-text-muted leading-relaxed">
          The requested collegiate resource or URL path does not exist or may have been reorganized.
        </p>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-block rounded-md bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-90 shadow-sm"
          >
            Return to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
