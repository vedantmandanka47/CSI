import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Data Protection & Privacy — CSI GCET SB',
  description: 'Data protection and student privacy governance of the Computer Society of India GCET Student Branch.',
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary border border-primary/20">
          Institutional Governance
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-text sm:text-4xl">
          Data Protection &amp; Student Privacy Policy
        </h1>
        <p className="text-xs text-text-muted">
          Last Reviewed: Academic Session 2026-27 &bull; G H Patel College of Engineering &amp; Technology
        </p>
      </div>

      {/* Structured Policy Content */}
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-surface p-6 sm:p-8 shadow-sm space-y-3">
          <h2 className="font-display text-lg font-bold text-text">1. Institutional Scope &amp; Purpose</h2>
          <p className="text-xs sm:text-sm text-text-muted leading-relaxed">
            The Computer Society of India (CSI) Student Branch at G H Patel College of Engineering &amp; Technology
            (GCET) collects and processes student personal data exclusively to manage branch membership, conduct
            technical symposiums, authenticate event attendance, and issue verifiable academic certificates.
          </p>
        </section>

        <section className="rounded-xl border border-border bg-surface p-6 sm:p-8 shadow-sm space-y-3">
          <h2 className="font-display text-lg font-bold text-text">2. Categories of Student Data Handled</h2>
          <div className="space-y-3 text-xs sm:text-sm text-text-muted">
            <div className="rounded border border-border bg-surface-raised p-3">
              <strong className="text-text block mb-1">Roster &amp; Identity Records:</strong>
              Student full name, institutional email address, department, enrollment number, and contact details
              verified against official college enrollment records.
            </div>
            <div className="rounded border border-border bg-surface-raised p-3">
              <strong className="text-text block mb-1">Authentication Credentials:</strong>
              Argon2id cryptographic password hashes, active session tokens, and security audit logs. Plaintext
              passwords are never stored or accessible by administrators.
            </div>
            <div className="rounded border border-border bg-surface-raised p-3">
              <strong className="text-text block mb-1">Participation &amp; Certification History:</strong>
              Symposium registrations, workshop check-in timestamps, attendance validations, and digital certificate
              hashes.
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-6 sm:p-8 shadow-sm space-y-3">
          <h2 className="font-display text-lg font-bold text-text">3. Security &amp; Audit Immutability</h2>
          <p className="text-xs sm:text-sm text-text-muted leading-relaxed">
            Security-critical operations, role assignments, and permission changes are recorded in an append-only
            audit trail protected at the PostgreSQL database level. Access control is strictly enforced on the server
            using least-privilege role-based access control (RBAC).
          </p>
        </section>

        <section className="rounded-xl border border-border bg-surface p-6 sm:p-8 shadow-sm space-y-3">
          <h2 className="font-display text-lg font-bold text-text">4. Third-Party Sharing &amp; Minimization</h2>
          <p className="text-xs sm:text-sm text-text-muted leading-relaxed">
            Student records are never sold, rented, or commercialized. Data access is restricted to authorized
            student branch executives and faculty counselors strictly for verified academic and operational purposes.
          </p>
        </section>

        <section className="rounded-xl border border-border bg-surface p-6 sm:p-8 shadow-sm space-y-3">
          <h2 className="font-display text-lg font-bold text-text">5. Student Rights &amp; Grievances</h2>
          <p className="text-xs sm:text-sm text-text-muted leading-relaxed">
            Students retain the right to review their active profile details, request rectification of institutional
            records, and inquire about event participation records through the faculty counseling desk or student branch
            secretariat.
          </p>
        </section>
      </div>

      <div className="border-t border-border pt-4">
        <Link href="/" className="text-xs font-semibold text-primary hover:underline">
          Return to Branch Homepage
        </Link>
      </div>
    </div>
  );
}
