import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Hero Section — Concise, Informative First Viewport */}
      <section className="border-b border-border bg-surface/50 py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
            {/* Left Column: Core Identity & Messaging */}
            <div className="lg:col-span-7 space-y-5">
              <div className="inline-flex items-center gap-2.5 rounded-full border border-border bg-surface px-3.5 py-1.5 shadow-sm">
                <div className="relative h-5 w-5 overflow-hidden rounded-full">
                  <Image
                    src="/brand/csi-logo.png"
                    alt="CSI GCET Logo"
                    width={20}
                    height={20}
                    className="h-full w-full object-contain"
                    priority
                  />
                </div>
                <span className="text-xs font-semibold text-text">
                  Computer Society of India &bull; GCET Student Branch Chapter
                </span>
              </div>

              <h1 className="font-display text-3xl font-extrabold tracking-tight text-text sm:text-4xl lg:text-5xl leading-tight">
                Advancing Computing Excellence &amp; Technical Leadership
              </h1>

              <p className="max-w-2xl text-sm leading-relaxed text-text-muted sm:text-base">
                The institutional technology organisation of G H Patel College of Engineering &amp; Technology,
                Vallabh Vidyanagar. Bridging academic curricula with hands-on systems engineering, verified
                credentials, and collaborative student committees.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  href="/register"
                  className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                >
                  Join CSI GCET
                </Link>
                <Link
                  href="/events"
                  className="rounded-md border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-surface-raised"
                >
                  Explore Events
                </Link>
                <Link
                  href="/login"
                  className="rounded-md border border-border/80 bg-surface-raised px-4 py-2.5 text-xs font-medium text-text transition-colors hover:text-primary"
                >
                  Member Portal
                </Link>
              </div>
            </div>

            {/* Right Column: Institutional Snapshot Panel */}
            <div className="lg:col-span-5">
              <div className="rounded-xl border border-border bg-surface p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <span className="font-display text-sm font-bold text-text">Branch Charter Snapshot</span>
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary border border-primary/20">
                    Region III
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-start">
                    <span className="text-text-muted">Parent Institution</span>
                    <span className="font-semibold text-text text-right">Computer Society of India</span>
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-text-muted">Campus Location</span>
                    <span className="font-semibold text-text text-right">GCET, Vallabh Vidyanagar</span>
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-text-muted">Academic Affiliation</span>
                    <span className="font-semibold text-text text-right">Charutar Vidyamandal (CVM)</span>
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-text-muted">Core Focus</span>
                    <span className="font-semibold text-text text-right">Systems, AI, Workshops &amp; R&amp;D</span>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-surface-raised p-3 text-xs text-text-muted">
                  Official student branch operations are conducted under Department of Computer Engineering &amp;
                  Information Technology faculty mentorship.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Branch Highlights & Strategic Pillars */}
      <section className="py-14 sm:py-18 border-b border-border bg-surface/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
              Core Capabilities &amp; Student Programs
            </h2>
            <p className="mt-2 text-xs text-text-muted leading-relaxed">
              Curated technical initiatives empowering student engineers with industry-aligned competencies.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Pillar 1 */}
            <div className="rounded-lg border border-border bg-surface p-6 shadow-sm flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
                  </svg>
                </div>
                <h3 className="font-display text-base font-semibold text-text">Hands-On Workshops</h3>
                <p className="text-xs leading-relaxed text-text-muted">
                  Intensive laboratory bootcamps covering Linux system administration, backend development,
                  cloud infrastructure, and cyber defense fundamentals.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border/60 text-xs font-medium text-primary">
                Curriculum Aligned &bull; Lab Focused
              </div>
            </div>

            {/* Pillar 2 */}
            <div className="rounded-lg border border-border bg-surface p-6 shadow-sm flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/10 text-accent">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.504-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.004 0V5.625c0-.621-.504-1.125-1.125-1.125H9.871c-.621 0-1.125.504-1.125 1.125v8.625" />
                  </svg>
                </div>
                <h3 className="font-display text-base font-semibold text-text">Technical Symposiums</h3>
                <p className="text-xs leading-relaxed text-text-muted">
                  Multi-track technical symposiums, hackathons, and software paper presentations judged by
                  industry veterans and GCET alumni.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border/60 text-xs font-medium text-accent">
                Collaborative Sprints &bull; Peer Evaluation
              </div>
            </div>

            {/* Pillar 3 */}
            <div className="rounded-lg border border-border bg-surface p-6 shadow-sm flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-success/10 text-success">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                  </svg>
                </div>
                <h3 className="font-display text-base font-semibold text-text">Cryptographic Verification</h3>
                <p className="text-xs leading-relaxed text-text-muted">
                  Digitally signed credentials, verifiable membership passes, and tamper-resistant audit
                  logging preserving achievement integrity.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border/60 text-xs font-medium text-success">
                Instant QR Verification &bull; Portfolio Ready
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Events & Calendar Track */}
      <section className="py-14 sm:py-18 border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
                Featured Events &amp; Workshops
              </h2>
              <p className="mt-2 text-xs text-text-muted">
                Academic session technical symposium calendar and schedule briefings.
              </p>
            </div>
            <Link
              href="/events"
              className="inline-flex items-center text-xs font-semibold text-primary hover:underline"
            >
              Browse Event Calendar
            </Link>
          </div>

          <div className="mt-8 rounded-xl border border-border bg-surface p-8 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-8 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary border border-primary/20">
                    Session 2026-27 Schedule Briefing
                  </span>
                  <span className="text-xs text-text-muted">&bull; Auditorium &amp; Lab Complex</span>
                </div>
                <h3 className="font-display text-xl font-bold text-text">
                  Annual Technical Symposium &amp; Developer Masterclass Series
                </h3>
                <p className="text-xs leading-relaxed text-text-muted">
                  The Core Committee and faculty coordinators are curating hands-on workshops on distributed systems,
                  full-stack architecture, and competitive algorithm design. Published schedules, speaker announcements,
                  and registration windows are released through this portal.
                </p>
              </div>
              <div className="lg:col-span-4 flex flex-col gap-2.5 sm:flex-row lg:flex-col justify-end">
                <Link
                  href="/register"
                  className="rounded-md bg-primary px-4 py-2.5 text-center text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  Join to Receive Alerts
                </Link>
                <Link
                  href="/events"
                  className="rounded-md border border-border bg-surface px-4 py-2.5 text-center text-xs font-semibold text-text hover:bg-surface-raised"
                >
                  View Event Tracks
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Leadership & Working Committees Overview */}
      <section className="py-14 sm:py-18 border-b border-border bg-surface/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-5 space-y-4">
              <h2 className="font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
                Collaborative Student Governance
              </h2>
              <p className="text-xs leading-relaxed text-text-muted">
                The CSI GCET Student Branch operates through structured working committees led by student
                executives and guided by faculty counselors from the Department of Computer Engineering and
                Information Technology.
              </p>
              <div className="pt-2">
                <Link
                  href="/team"
                  className="rounded-md border border-border bg-surface px-4 py-2 text-xs font-semibold text-text hover:bg-surface-raised"
                >
                  Meet Branch Committees
                </Link>
              </div>
            </div>

            <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-3.5">
              <div className="rounded-lg border border-border bg-surface p-4 text-xs space-y-1">
                <span className="font-semibold text-text block">Technical</span>
                <span className="text-text-muted text-xs">Workshops &amp; Web Platform</span>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4 text-xs space-y-1">
                <span className="font-semibold text-text block">Documentation</span>
                <span className="text-text-muted text-xs">Reports &amp; Proceedings</span>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4 text-xs space-y-1">
                <span className="font-semibold text-text block">Design &amp; Media</span>
                <span className="text-text-muted text-xs">Visual Branding &amp; UI</span>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4 text-xs space-y-1">
                <span className="font-semibold text-text block">Public Relations</span>
                <span className="text-text-muted text-xs">Outreach &amp; Campus Relations</span>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4 text-xs space-y-1">
                <span className="font-semibold text-text block">Cinematography</span>
                <span className="text-text-muted text-xs">Media Capture &amp; Archives</span>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4 text-xs space-y-1">
                <span className="font-semibold text-text block">Logistics</span>
                <span className="text-text-muted text-xs">Operations &amp; Venues</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Membership Onboarding Callout Banner */}
      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-border bg-surface p-8 sm:p-12 shadow-sm text-center space-y-5">
            <h2 className="font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
              Ready to Expand Your Technical Portfolio?
            </h2>
            <p className="mx-auto max-w-xl text-xs sm:text-sm leading-relaxed text-text-muted">
              Enroll as an official student member of Computer Society of India GCET Student Branch.
              Gain direct access to technical symposiums, hands-on masterclasses, and verifiable credentials.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Link
                href="/register"
                className="rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
              >
                Register for Membership
              </Link>
              <Link
                href="/about"
                className="rounded-md border border-border bg-surface px-6 py-2.5 text-sm font-semibold text-text hover:bg-surface-raised"
              >
                Learn About Branch Charter
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
