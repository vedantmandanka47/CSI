import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Events & Workshops — CSI GCET SB',
  description: 'Technical symposiums, hands-on masterclasses, and student branch activities organized by CSI GCET Student Branch.',
};

export default function EventsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 space-y-10">
      {/* Page Header */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary border border-primary/20">
          CSI GCET Technical Calendar
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-text sm:text-4xl">
          Events, Workshops &amp; Symposiums
        </h1>
        <p className="max-w-2xl text-xs sm:text-sm text-text-muted leading-relaxed">
          Explore upcoming hands-on masterclasses, annual technical competitions, and collaborative
          engineering symposiums organized by the Computer Society of India GCET Student Branch.
        </p>
      </div>

      {/* Featured Event Schedule Briefing Card */}
      <div className="rounded-xl border border-border bg-surface p-6 sm:p-8 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success border border-success/20">
                Current Session: 2026-27
              </span>
              <span className="text-xs text-text-muted">&bull; In Planning &amp; Scheduling</span>
            </div>

            <h2 className="font-display text-xl sm:text-2xl font-bold text-text">
              Annual Flagship Technical Symposium &amp; Bootcamps
            </h2>

            <p className="text-xs leading-relaxed text-text-muted sm:text-sm">
              The CSI GCET Student Branch Core Committee, under the guidance of faculty counselors, is curating
              the annual academic session calendar. Tracks include competitive programming, distributed web platforms,
              applied machine intelligence, and systems security.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
              <div className="rounded border border-border bg-surface-raised p-3">
                <span className="text-text-muted block text-xs">Primary Venue</span>
                <span className="font-semibold text-text">GCET Computer Labs &amp; Auditorium</span>
              </div>
              <div className="rounded border border-border bg-surface-raised p-3">
                <span className="text-text-muted block text-xs">Target Audience</span>
                <span className="font-semibold text-text">Enrolled Engineering Students</span>
              </div>
              <div className="rounded border border-border bg-surface-raised p-3">
                <span className="text-text-muted block text-xs">Credential Output</span>
                <span className="font-semibold text-text">Verifiable Digital Certificate</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-5 text-xs space-y-2">
            <span className="font-display font-semibold text-text text-sm">Event Notification Service</span>
            <p className="text-text-muted leading-relaxed">
              When registration windows open, authenticated members can enroll in one click and generate their
              digital attendance pass.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <Link
                href="/register"
                className="w-full rounded bg-primary py-2 text-center font-semibold text-primary-foreground hover:opacity-90"
              >
                Join to Receive Announcements
              </Link>
              <Link
                href="/login"
                className="w-full rounded border border-border bg-surface py-2 text-center font-semibold text-text hover:bg-surface-raised"
              >
                Sign In to Member Portal
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Structured Event Program Tracks */}
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-xl font-bold text-text">Recurring Event Formats</h2>
          <p className="mt-1 text-xs text-text-muted">
            The standard technical activities organized throughout the academic year
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Track 1 */}
          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm flex flex-col justify-between space-y-4">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  Laboratory Track
                </span>
                <span className="text-xs text-text-muted">Hands-On</span>
              </div>
              <h3 className="font-display text-base font-bold text-text">Developer Masterclasses</h3>
              <p className="text-xs leading-relaxed text-text-muted">
                Intensive technical workshops focused on core programming stacks, Linux environments, database design,
                and cloud infrastructure, mentored directly by faculty and senior student developers.
              </p>
            </div>
            <div className="border-t border-border pt-3 text-xs text-text-muted flex justify-between">
              <span>Duration: Full Day</span>
              <span className="font-medium text-text">GCET Labs</span>
            </div>
          </div>

          {/* Track 2 */}
          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm flex flex-col justify-between space-y-4">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="rounded bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                  Competition Track
                </span>
                <span className="text-xs text-text-muted">Annual</span>
              </div>
              <h3 className="font-display text-base font-bold text-text">Code Sprints &amp; Hackathons</h3>
              <p className="text-xs leading-relaxed text-text-muted">
                Fast-paced engineering hackathons and algorithmic coding challenges where multidisciplinary student
                teams develop solutions evaluated by industry professionals and faculty.
              </p>
            </div>
            <div className="border-t border-border pt-3 text-xs text-text-muted flex justify-between">
              <span>Duration: 24 to 36 Hours</span>
              <span className="font-medium text-text">Auditorium &amp; Center</span>
            </div>
          </div>

          {/* Track 3 */}
          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm flex flex-col justify-between space-y-4">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="rounded bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                  Symposium Track
                </span>
                <span className="text-xs text-text-muted">Semestral</span>
              </div>
              <h3 className="font-display text-base font-bold text-text">Distinguished Tech Talks</h3>
              <p className="text-xs leading-relaxed text-text-muted">
                Keynotes, research presentations, and panel discussions with engineering leaders and GCET alumni
                sharing insights into emerging paradigms and real-world system architecture.
              </p>
            </div>
            <div className="border-t border-border pt-3 text-xs text-text-muted flex justify-between">
              <span>Duration: 2 to 3 Hours</span>
              <span className="font-medium text-text">Seminar Hall</span>
            </div>
          </div>
        </div>
      </div>

      {/* Attendance & Certification Policy Banner */}
      <div className="rounded-lg border border-border bg-surface-raised p-6 text-xs text-text-muted space-y-2">
        <span className="font-display font-semibold text-text text-sm">Attendance Authentication &amp; Certificates</span>
        <p className="leading-relaxed">
          Event check-in is conducted at the venue entrance using the member&apos;s dynamic cryptographic ID card.
          Upon successful completion of workshop requirements, tamper-resistant digital certificates are minted
          and permanently linked to the member&apos;s profile for portfolio verification.
        </p>
      </div>
    </div>
  );
}
