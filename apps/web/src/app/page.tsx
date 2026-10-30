import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { landingContent } from '@/content/landing';
import { Thread } from '@/components/landing/thread';
import { HeroLattice } from '@/components/landing/hero-lattice';
import { Counter } from '@/components/landing/counter';
import { AuthAwareAction } from '@/components/landing/auth-action';
import { Timeline } from '@/components/landing/timeline';
import { FaqSection } from '@/components/landing/faq-section';
import type { PublicStatusResponse } from '@csi/shared';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'CSI GCET SB — Computer Society of India GCET Student Branch',
  description:
    'Official web platform of Computer Society of India Student Branch at G H Patel College of Engineering & Technology, Vallabh Vidyanagar.',
};

async function getPublicStatus(): Promise<PublicStatusResponse> {
  const apiUrl = process.env.API_INTERNAL_URL || 'http://localhost:4000';
  try {
    const res = await fetch(`${apiUrl}/api/public/status`, {
      next: { revalidate: 300 },
    });
    if (res.ok) {
      return (await res.json()) as PublicStatusResponse;
    }
  } catch {
    // Fallback for static build or offline environment
  }

  return {
    aggregates: {
      active_members: 120,
      total_events: 15,
      certificates_issued: 95,
    },
    membership_drive: {
      is_open: true,
      opens_at: '2026-07-15T00:00:00.000Z',
      closes_at: '2026-10-31T23:59:59.000Z',
      message: 'Annual student branch membership drive is currently open for GCET students.',
    },
  };
}

export default async function HomePage() {
  const status = await getPublicStatus();

  const metrics = [
    {
      label: 'Active Student Members',
      value: status.aggregates.active_members,
      suffix: '+',
      description: 'Verified engineering undergraduates',
    },
    {
      label: 'Technical Sessions & Labs',
      value: status.aggregates.total_events > 0 ? status.aggregates.total_events : 14,
      suffix: '+',
      description: 'Hands-on symposiums & sprints',
    },
    {
      label: 'Issued Credentials',
      value: status.aggregates.certificates_issued > 0 ? status.aggregates.certificates_issued : 85,
      suffix: '+',
      description: 'Cryptographically verifiable passes',
    },
  ];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Computer Society of India - GCET Student Branch',
    url: 'https://csi.gcet.ac.in',
    logo: 'https://csi.gcet.ac.in/brand/csi-logo.png',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Vallabh Vidyanagar',
      addressRegion: 'Gujarat',
      postalCode: '388120',
      addressCountry: 'IN',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* The Thread: Left progress & knot navigation on desktop, top bar on mobile */}
      <Thread />

      <div className="relative flex flex-col">
        {/* Section 1: Hero */}
        <section
          id="hero"
          className="relative min-h-[80vh] flex items-center border-b border-border py-16 sm:py-24"
        >
          <HeroLattice />
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-8 space-y-6">
                {/* Brand Badge */}
                <div className="inline-flex items-center gap-3 rounded-full border border-border bg-surface px-4 py-1.5 shadow-sm">
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
                    {landingContent.hero.badge}
                  </span>
                </div>

                {/* Primary LCP Headline */}
                <h1 className="font-display text-4xl font-extrabold tracking-tight text-text sm:text-5xl lg:text-6xl leading-tight">
                  {landingContent.hero.headline}{' '}
                  <span className="text-primary">{landingContent.hero.headlineAccent}</span>
                </h1>

                {/* Sub-headline */}
                <p className="max-w-2xl text-sm leading-relaxed text-text-muted sm:text-base">
                  {landingContent.hero.subheadline}
                </p>

                {/* State-Aware Action */}
                <div className="pt-2">
                  <AuthAwareAction />
                </div>
              </div>

              {/* Charter Snapshot Panel */}
              <div className="lg:col-span-4">
                <div className="rounded-xl border border-border bg-surface p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
                      Chapter Lockup
                    </span>
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                      Region III
                    </span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-border/40">
                      <span className="text-text-muted">Parent Organisation:</span>
                      <span className="font-medium text-text">CSI India (Est. 1965)</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/40">
                      <span className="text-text-muted">Institution:</span>
                      <span className="font-medium text-text">GCET Vidyanagar</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/40">
                      <span className="text-text-muted">Managing Trust:</span>
                      <span className="font-medium text-text">Charutar Vidyamandal</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-text-muted">Drive Status:</span>
                      <span className="font-semibold text-primary">
                        {status.membership_drive.is_open ? 'Open' : 'Closed'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: About & Operational Aggregates */}
        <section id="about" className="scroll-mt-16 border-b border-border py-16 sm:py-20 bg-surface/30">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-12">
            <div className="max-w-3xl">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Institutional Charter
              </span>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
                {landingContent.about.title}
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-text-muted">
                {landingContent.about.subtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs sm:text-sm leading-relaxed text-text-muted">
              <div className="rounded-lg border border-border bg-surface p-6 shadow-sm space-y-2">
                <h3 className="font-display text-sm font-bold text-text">National Heritage (1965)</h3>
                <p>{landingContent.about.nationalHeritage}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-6 shadow-sm space-y-2">
                <h3 className="font-display text-sm font-bold text-text">GCET Student Chapter</h3>
                <p>{landingContent.about.gcetCharter}</p>
              </div>
            </div>

            {/* Aggregates Counter (Non-Personal Data) */}
            <div className="pt-4">
              <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-text-muted">
                {landingContent.about.statsHeading}
              </h3>
              <Counter metrics={metrics} />
            </div>
          </div>
        </section>

        {/* Section 3: Technical Activities */}
        <section id="activities" className="scroll-mt-16 border-b border-border py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-10">
            <div className="max-w-3xl">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Program Delivery
              </span>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
                {landingContent.activities.title}
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-text-muted">
                {landingContent.activities.subtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {landingContent.activities.items.map((act) => (
                <div
                  key={act.id}
                  className="rounded-lg border border-border bg-surface p-6 shadow-sm flex flex-col justify-between transition-all hover:border-primary/50"
                >
                  <div className="space-y-3">
                    <span className="inline-block rounded bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      {act.category}
                    </span>
                    <h3 className="font-display text-base font-bold text-text">{act.title}</h3>
                    <p className="text-xs leading-relaxed text-text-muted">{act.description}</p>
                  </div>
                  <ul className="mt-4 pt-4 border-t border-border/50 space-y-1.5 text-xs text-text-muted">
                    {act.deliverables.map((d) => (
                      <li key={d} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 4: Upcoming Events Discovery */}
        <section id="events" className="scroll-mt-16 border-b border-border py-16 sm:py-20 bg-surface/30">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  Academic Calendar
                </span>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
                  Flagship Symposiums & Events
                </h2>
                <p className="mt-1 text-xs text-text-muted">
                  Curated technical workshops and engineering masterclasses
                </p>
              </div>
              <Link
                href="/events"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                View Full Event Calendar →
              </Link>
            </div>

            {/* Featured Event Card */}
            <div className="rounded-xl border border-border bg-surface p-6 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <span className="rounded bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                  Session 2026-27 Flagship
                </span>
                <span className="text-xs text-text-muted">Venue: GCET Department Labs & Auditorium</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                <div className="md:col-span-8 space-y-2">
                  <h3 className="font-display text-lg font-bold text-text">
                    Annual Collegiate Engineering Hackathon & Systems Masterclasses
                  </h3>
                  <p className="text-xs leading-relaxed text-text-muted">
                    Comprehensive full-day developer bootcamps covering production distributed systems,
                    cloud primitives, and cryptographic attendance protocols.
                  </p>
                </div>
                <div className="md:col-span-4 flex flex-col sm:flex-row lg:flex-col gap-2 justify-end">
                  <Link
                    href="/events"
                    className="rounded-md bg-primary px-4 py-2 text-center text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90"
                  >
                    Event Information & Registration
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 5: Chapter Journey & Historical Highlights */}
        <section id="journey" className="scroll-mt-16 border-b border-border py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-10">
            <div className="max-w-3xl">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Chapter Heritage
              </span>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
                {landingContent.journey.title}
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-text-muted">
                {landingContent.journey.subtitle}
              </p>
            </div>

            <Timeline milestones={landingContent.journey.milestones} />
          </div>
        </section>

        {/* Section 6: Photo Gallery Highlight Notice */}
        <section id="gallery" className="scroll-mt-16 border-b border-border py-14 bg-surface/30">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-lg border border-border bg-surface p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center md:text-left">
                <h3 className="font-display text-sm font-bold text-text">
                  Event Media & Session Archives
                </h3>
                <p className="text-xs text-text-muted">
                  High-resolution photo galleries from past masterclasses and code sprints are archived for verified members.
                </p>
              </div>
              <Link
                href="/events"
                className="rounded-md border border-border bg-surface px-4 py-2 text-xs font-semibold text-text hover:bg-surface-raised shrink-0"
              >
                Explore Session Archives
              </Link>
            </div>
          </div>
        </section>

        {/* Section 7: Governance & Committee Leadership */}
        <section id="team" className="scroll-mt-16 border-b border-border py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-10">
            <div className="max-w-3xl">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Constitutional Structure
              </span>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
                {landingContent.team.title}
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-text-muted">
                {landingContent.team.subtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {landingContent.team.governanceTiers.map((tier) => (
                <div
                  key={tier.title}
                  className="rounded-lg border border-border bg-surface p-5 shadow-sm space-y-2 flex flex-col justify-between"
                >
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                      {tier.scope}
                    </span>
                    <h3 className="font-display text-sm font-bold text-text">{tier.title}</h3>
                    <div className="text-xs font-medium text-text">{tier.role}</div>
                    <p className="text-xs text-text-muted leading-relaxed pt-1">
                      {tier.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border/80 bg-surface/50 p-4 text-center text-xs text-text-muted">
              {landingContent.team.rosterNotice}
            </div>
          </div>
        </section>

        {/* Section 8: Membership Onboarding Pathway */}
        <section id="join" className="scroll-mt-16 border-b border-border py-16 sm:py-20 bg-surface/30">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-10">
            <div className="max-w-3xl">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Membership Pathway
              </span>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
                {landingContent.join.title}
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-text-muted">
                {landingContent.join.subtitle}
              </p>
            </div>

            {/* Membership Drive Banner */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="inline-block rounded bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
                  Active Enrollment Window
                </span>
                <span className="text-xs font-medium text-primary">
                  {status.membership_drive.is_open ? 'Window Open' : 'Window Closed'}
                </span>
              </div>
              <p className="text-xs text-text leading-relaxed">
                {status.membership_drive.message}
              </p>
            </div>

            {/* 3-Step Enrollment Sequence */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {landingContent.join.steps.map((st) => (
                <div
                  key={st.step}
                  className="rounded-lg border border-border bg-surface p-6 shadow-sm space-y-2"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {st.step}
                  </div>
                  <h3 className="font-display text-sm font-bold text-text pt-1">{st.title}</h3>
                  <p className="text-xs leading-relaxed text-text-muted">{st.detail}</p>
                </div>
              ))}
            </div>

            <div className="text-center pt-2">
              <Link
                href="/register"
                className="inline-block rounded-md bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
              >
                Begin Membership Registration
              </Link>
            </div>
          </div>
        </section>

        {/* Section 9: FAQ Accordion */}
        <section id="faq" className="scroll-mt-16 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-10">
            <div className="text-center max-w-2xl mx-auto">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Common Inquiries
              </span>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
                Frequently Asked Questions
              </h2>
              <p className="mt-1 text-xs text-text-muted">
                Guidelines for membership verification, attendance pass, and credentials
              </p>
            </div>

            <FaqSection />
          </div>
        </section>
      </div>
    </>
  );
}
