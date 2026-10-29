import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Events & Workshops — CSI GCET SB',
  description: 'Upcoming and past technical events organized by CSI GCET Student Branch.',
};

export default function EventsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-text">Events & Workshops</h1>
          <p className="mt-2 text-xs text-text-muted">
            Explore technical symposiums, hands-on masterclasses, and student branch activities
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-12 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-text">Upcoming Schedule Announcement</h2>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-text-muted">
            The event calendar for the current academic session is being scheduled by the Core Committee.
            Sign in to receive instant notifications when registration opens.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/register"
              className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              Join to Get Notified
            </Link>
            <Link
              href="/"
              className="rounded-md border border-border bg-surface px-4 py-2 text-xs font-semibold text-text hover:bg-surface-raised"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
