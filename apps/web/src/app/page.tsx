import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border bg-surface/50 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center text-center">
            {/* Elegant CSI Brand Badge */}
            <div className="mb-6 flex items-center gap-3 rounded-full border border-border bg-surface px-4 py-2 shadow-sm">
              <div className="relative h-6 w-6 overflow-hidden rounded-full">
                <Image
                  src="/brand/csi-logo.png"
                  alt="CSI GCET Logo"
                  width={24}
                  height={24}
                  className="h-full w-full object-contain"
                  priority
                />
              </div>
              <span className="text-xs font-semibold text-text">
                Computer Society of India • GCET SB Chapter
              </span>
            </div>

            {/* Main Headline */}
            <h1 className="max-w-3xl font-display text-4xl font-extrabold tracking-tight text-text sm:text-5xl lg:text-6xl">
              Fostering Innovation &{' '}
              <span className="text-primary">Engineering Leadership</span>
            </h1>

            {/* Sub-headline */}
            <p className="mt-6 max-w-2xl text-sm leading-relaxed text-text-muted sm:text-base">
              The official platform for CSI GCET Student Branch operations, technical symposiums,
              hands-on workshops, verified credentials, and collaborative student engineering.
            </p>

            {/* CTA Buttons */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/register"
                className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
              >
                Join CSI GCET
              </Link>
              <Link
                href="/login"
                className="rounded-md border border-border bg-surface px-6 py-3 text-sm font-semibold text-text transition-colors hover:bg-surface-raised"
              >
                Member Portal
              </Link>
              <Link
                href="/health"
                className="rounded-md border border-border/60 bg-transparent px-4 py-3 text-xs font-medium text-text-muted transition-colors hover:text-text"
              >
                Platform Health →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Pillars / Features Grid */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
              Student Branch Capabilities & Programs
            </h2>
            <p className="mt-2 text-xs text-text-muted">
              Built by students, driven by faculty mentorship, empowered by technology
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1 */}
            <div className="rounded-lg border border-border bg-surface p-6 shadow-sm transition-transform duration-200 hover:-translate-y-0.5">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
                </svg>
              </div>
              <h3 className="font-display text-base font-semibold text-text">Hands-On Workshops</h3>
              <p className="mt-2 text-xs leading-relaxed text-text-muted">
                Practical, curriculum-aligned bootcamps covering modern web engineering, cloud computing,
                cybersecurity, and embedded systems.
              </p>
            </div>

            {/* Card 2 */}
            <div className="rounded-lg border border-border bg-surface p-6 shadow-sm transition-transform duration-200 hover:-translate-y-0.5">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-accent/10 text-accent">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.504-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.004 0V5.625c0-.621-.504-1.125-1.125-1.125H9.871c-.621 0-1.125.504-1.125 1.125v8.625" />
                </svg>
              </div>
              <h3 className="font-display text-base font-semibold text-text">Technical Symposiums</h3>
              <p className="mt-2 text-xs leading-relaxed text-text-muted">
                Hackathons, algorithmic coding competitions, and project showcases evaluated by industry
                veterans and GCET alumni.
              </p>
            </div>

            {/* Card 3 */}
            <div className="rounded-lg border border-border bg-surface p-6 shadow-sm transition-transform duration-200 hover:-translate-y-0.5">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-highlight/15 text-warning">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                </svg>
              </div>
              <h3 className="font-display text-base font-semibold text-text">Verified Credentials</h3>
              <p className="mt-2 text-xs leading-relaxed text-text-muted">
                Cryptographically verifiable digital certificates and dynamic member ID cards with instant
                attendance authentication.
              </p>
            </div>

            {/* Card 4 */}
            <div className="rounded-lg border border-border bg-surface p-6 shadow-sm transition-transform duration-200 hover:-translate-y-0.5">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-success/10 text-success">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
              </div>
              <h3 className="font-display text-base font-semibold text-text">Collaborative Committees</h3>
              <p className="mt-2 text-xs leading-relaxed text-text-muted">
                Student-led technical, logistics, design, and documentation committees working together
                under GCET faculty guidance.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
