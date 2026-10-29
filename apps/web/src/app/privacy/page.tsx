import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — CSI GCET SB',
  description: 'Data protection and privacy commitments of Computer Society of India GCET Student Branch.',
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="space-y-8 rounded-lg border border-border bg-surface p-8 shadow-sm">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-text">Privacy Policy</h1>
          <p className="mt-2 text-xs text-text-muted">Last Updated: October 2026</p>
        </div>

        <section className="space-y-3 text-xs leading-relaxed text-text">
          <h2 className="text-base font-semibold text-text">1. Purpose & Scope</h2>
          <p>
            The Computer Society of India (CSI) Student Branch at G H Patel College of Engineering &
            Technology (GCET) is committed to protecting student and member privacy. This policy
            outlines the personal data we collect, why we collect it, how it is secured, and your
            rights under applicable data protection principles.
          </p>
        </section>

        <section className="space-y-3 text-xs leading-relaxed text-text">
          <h2 className="text-base font-semibold text-text">2. Data We Collect</h2>
          <ul className="list-disc pl-5 space-y-1.5 text-text-muted">
            <li>
              <strong className="text-text">Account Information:</strong> Full name, institutional
              email address, academic branch, year of study, and enrollment number.
            </li>
            <li>
              <strong className="text-text">Authentication & Security Credentials:</strong> Cryptographically
              hashed passwords (Argon2id), session identifiers, and IP addresses for audit logging.
            </li>
            <li>
              <strong className="text-text">Activity Data:</strong> Event registrations, attendance records,
              workshop participation, and digital ID card issuances.
            </li>
          </ul>
        </section>

        <section className="space-y-3 text-xs leading-relaxed text-text">
          <h2 className="text-base font-semibold text-text">3. Security & Immutability</h2>
          <p>
            All security-critical actions and authentication attempts are recorded in an append-only
            audit trail protected at the PostgreSQL database level against tampering or deletion.
            Passwords are never stored in plaintext and cannot be recovered by administrators.
          </p>
        </section>

        <section className="space-y-3 text-xs leading-relaxed text-text">
          <h2 className="text-base font-semibold text-text">4. Third-Party Sharing</h2>
          <p>
            We do not sell, rent, or trade student personal data. Data is exclusively utilized
            internally by the GCET Student Branch Core Committee and faculty advisors for student
            branch operations, certification issuance, and event logistics.
          </p>
        </section>

        <div className="border-t border-border pt-4">
          <Link href="/" className="text-xs font-semibold text-primary hover:underline">
            ← Return to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
