import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Committee & Team — CSI GCET SB',
  description: 'Leadership and student working committee of CSI GCET Student Branch.',
};

export default function TeamPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-text">Our Team & Committees</h1>
          <p className="mt-2 text-xs text-text-muted">
            Meet the faculty counselors, student branch executive core, and committee heads
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Executive Core */}
          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
            <h2 className="font-display text-base font-semibold text-text">Executive Core</h2>
            <p className="mt-1 text-xs text-text-muted">
              President, Vice President, Secretary, and Treasurer overseeing branch governance.
            </p>
            <div className="mt-4 rounded-md border border-border bg-surface-raised p-3 text-xs text-text-muted">
              Official roster appointments for the academic year are registered and verified.
            </div>
          </div>

          {/* Technical Committee */}
          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
            <h2 className="font-display text-base font-semibold text-text">Technical Working Group</h2>
            <p className="mt-1 text-xs text-text-muted">
              Leads hands-on workshops, coding challenges, infrastructure development, and labs.
            </p>
            <div className="mt-4 rounded-md border border-border bg-surface-raised p-3 text-xs text-text-muted">
              Workshops: Web Platforms, Cloud Native, Python Engineering & AI Tooling.
            </div>
          </div>

          {/* Logistics & Creative */}
          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
            <h2 className="font-display text-base font-semibold text-text">Logistics & Creative Team</h2>
            <p className="mt-1 text-xs text-text-muted">
              Manages symposium coordination, venue logistics, graphics, and documentation.
            </p>
            <div className="mt-4 rounded-md border border-border bg-surface-raised p-3 text-xs text-text-muted">
              Handles campus operations, branding, and event photography.
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-6 text-center">
          <Link href="/" className="text-xs font-semibold text-primary hover:underline">
            ← Return to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
