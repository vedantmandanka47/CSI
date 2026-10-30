import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Committees & Leadership — CSI GCET SB',
  description: 'Faculty counselors, executive core, and committee working groups of CSI GCET Student Branch.',
};

export default function TeamPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 space-y-12">
      {/* Header */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary border border-primary/20">
          Student Branch Governance
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-text sm:text-4xl">
          Leadership &amp; Committee Structure
        </h1>
        <p className="max-w-2xl text-xs sm:text-sm text-text-muted leading-relaxed">
          The Computer Society of India GCET Student Branch operates under a structured governance framework
          combining institutional faculty counseling with student-led executive committees.
        </p>
      </div>

      {/* Tier 1: Faculty Counselors & Mentorship */}
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-bold text-text">Faculty Counseling &amp; Advisory</h2>
          <p className="text-xs text-text-muted">
            Academic oversight and mentorship from the Department of Computer Engineering &amp; Information Technology
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-display font-semibold text-text text-base">Student Branch Counselor</span>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Faculty Role</span>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Provides overall branch stewardship, liaises with Computer Society of India Region III leadership,
              and validates technical workshop curriculums and event certifications.
            </p>
            <div className="rounded border border-border bg-surface-raised p-3 text-xs text-text-muted">
              Appointed by the Principal &amp; Head of Department, GCET
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-display font-semibold text-text text-base">Department Faculty Advisory Board</span>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Academic Board</span>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Faculty members across Computer Engineering and Information Technology departments offering laboratory
              facilities, technical guidance, and judge panels for student competitions.
            </p>
            <div className="rounded border border-border bg-surface-raised p-3 text-xs text-text-muted">
              Supporting Computing Laboratories &amp; Research Centers
            </div>
          </div>
        </div>
      </section>

      {/* Tier 2: Executive Core */}
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-bold text-text">Student Executive Core</h2>
          <p className="text-xs text-text-muted">
            Elected student officers responsible for overall annual strategy, budgeting, and operations
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary block">President</span>
            <span className="font-display font-bold text-text text-sm block">Branch President</span>
            <p className="text-xs text-text-muted leading-relaxed">
              Directs branch initiatives, presides over general committee assemblies, and represents the student branch.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary block">Vice President</span>
            <span className="font-display font-bold text-text text-sm block">Vice President</span>
            <p className="text-xs text-text-muted leading-relaxed">
              Coordinates working committee operations, tracks project timelines, and supports administrative stewardship.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary block">Secretariat</span>
            <span className="font-display font-bold text-text text-sm block">General Secretary</span>
            <p className="text-xs text-text-muted leading-relaxed">
              Maintains official branch records, proceedings, student correspondence, and institutional event approvals.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary block">Treasury</span>
            <span className="font-display font-bold text-text text-sm block">Treasurer</span>
            <p className="text-xs text-text-muted leading-relaxed">
              Oversees event logistics budgeting, expenditure statements, and annual audited financial records.
            </p>
          </div>
        </div>
      </section>

      {/* Tier 3: Specialized Working Committees */}
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-bold text-text">Working Committees &amp; Operations</h2>
          <p className="text-xs text-text-muted">
            Six specialized student committees executing the annual technical roadmap
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Committee 1 */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-display font-semibold text-text text-base">Technical Committee</span>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Systems &amp; Labs</span>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Manages branch web infrastructure, lab setups for hands-on bootcamps, automated judging platforms,
              and technical workshop mentoring.
            </p>
            <div className="text-xs text-text-muted pt-2 border-t border-border/60">
              Scope: Software Development &bull; Cloud &bull; Code Sprints
            </div>
          </div>

          {/* Committee 2 */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-display font-semibold text-text text-base">Content &amp; Documentation</span>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Publications</span>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Curates technical newsletters, workshop recap proceedings, event reports for CSI Region III,
              and technical student articles.
            </p>
            <div className="text-xs text-text-muted pt-2 border-t border-border/60">
              Scope: Editorial Writing &bull; Event Records &bull; Archives
            </div>
          </div>

          {/* Committee 3 */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-display font-semibold text-text text-base">Design &amp; Media</span>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Creative</span>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Develops visual branding, promotional brochures, UI layouts, event badges, digital backdrops,
              and identity guidelines.
            </p>
            <div className="text-xs text-text-muted pt-2 border-t border-border/60">
              Scope: Graphic Design &bull; Brand Kit &bull; Web Assets
            </div>
          </div>

          {/* Committee 4 */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-display font-semibold text-text text-base">Public Relations</span>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Outreach</span>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Manages student community communication, departmental announcements, social broadcast channels,
              and inter-institutional symposium invitations.
            </p>
            <div className="text-xs text-text-muted pt-2 border-t border-border/60">
              Scope: Student Engagement &bull; Outreach &bull; Publicity
            </div>
          </div>

          {/* Committee 5 */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-display font-semibold text-text text-base">Motion &amp; Cinematography</span>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Production</span>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Records technical speaker sessions, captures high-resolution event photography, and edits
              recap aftermovies and promotional teasers.
            </p>
            <div className="text-xs text-text-muted pt-2 border-t border-border/60">
              Scope: Videography &bull; Photography &bull; Post-Production
            </div>
          </div>

          {/* Committee 6 */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-display font-semibold text-text text-base">Logistics &amp; Operations</span>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Execution</span>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Manages physical auditorium reservations, hardware setup, check-in desk coordination,
              sound systems, and participant credential verification.
            </p>
            <div className="text-xs text-text-muted pt-2 border-t border-border/60">
              Scope: Venue Management &bull; Check-In &bull; Operations
            </div>
          </div>
        </div>
      </section>

      {/* Directory Status / Roster Privacy Notice */}
      <div className="rounded-xl border border-border bg-surface-raised p-6 text-xs text-text-muted space-y-2">
        <span className="font-display font-semibold text-text text-sm">Committee Member Directory Notice</span>
        <p className="leading-relaxed">
          Student appointments, committee assignments, and term durations are verified against the institutional
          branch roster. In accordance with student privacy guidelines, individual profiles and contact records
          are displayed upon annual term induction and member consent.
        </p>
        <div className="pt-2">
          <Link href="/about" className="font-semibold text-primary hover:underline">
            Read more about our branch charter &amp; objectives
          </Link>
        </div>
      </div>
    </div>
  );
}
