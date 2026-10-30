import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'About CSI GCET SB — Computer Society of India',
  description: 'History, institutional charter, and core objectives of the Computer Society of India GCET Student Branch.',
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 space-y-12">
      {/* Header */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary border border-primary/20">
          Chartered Chapter &bull; Region III
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-text sm:text-4xl">
          About CSI GCET Student Branch
        </h1>
        <p className="max-w-2xl text-xs sm:text-sm text-text-muted leading-relaxed">
          Operating under the Computer Society of India, the GCET Student Branch is dedicated to advancing
          practical computer science, technical research, and student engineering leadership in Vallabh Vidyanagar.
        </p>
      </div>

      {/* Two-Column Institutional Background */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="rounded-xl border border-border bg-surface p-6 sm:p-8 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <span className="font-display font-bold text-text text-lg">Computer Society of India</span>
          </div>
          <p className="text-xs sm:text-sm text-text-muted leading-relaxed">
            Formed in 1965, the Computer Society of India (CSI) is the premier association of IT and computer
            science professionals in India. Dedicated to the advancement of computing theory, data communications,
            and informatics, the society unites researchers, educators, industry practitioners, and student engineers.
          </p>
          <div className="rounded-lg border border-border bg-surface-raised p-3 text-xs text-text-muted">
            National Network: Over 70 chapters and 500+ student branches nationwide.
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 sm:p-8 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <span className="font-display font-bold text-text text-lg">The GCET Chapter</span>
          </div>
          <p className="text-xs sm:text-sm text-text-muted leading-relaxed">
            Chartered at G H Patel College of Engineering &amp; Technology (GCET), an educational institution
            governed by the Charutar Vidyamandal (CVM) trust. The chapter functions as an active technical incubator
            for students across Computer Engineering and Information Technology disciplines.
          </p>
          <div className="rounded-lg border border-border bg-surface-raised p-3 text-xs text-text-muted">
            Location: Vallabh Vidyanagar, Gujarat &bull; Mentored by Department Faculty
          </div>
        </div>
      </div>

      {/* Strategic Objectives Grid */}
      <section className="space-y-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-text">Strategic Branch Objectives</h2>
          <p className="mt-1 text-xs text-text-muted">
            The core founding principles guiding every symposium, workshop, and committee initiative
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm space-y-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary block">Objective 1</span>
            <h3 className="font-display font-semibold text-text text-base">Industry Practice</h3>
            <p className="text-xs text-text-muted leading-relaxed">
              Bridge the divide between academic computer science theory and current industry engineering practices
              through real-world tooling.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm space-y-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent block">Objective 2</span>
            <h3 className="font-display font-semibold text-text text-base">Hands-On Mastery</h3>
            <p className="text-xs text-text-muted leading-relaxed">
              Equip student members with practical competence in distributed systems, web architectures, cloud
              infrastructure, and cyber defense.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm space-y-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-success block">Objective 3</span>
            <h3 className="font-display font-semibold text-text text-base">Student Leadership</h3>
            <p className="text-xs text-text-muted leading-relaxed">
              Foster collaboration, organizational stewardship, and ethical engineering through active participation
              in working committees.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm space-y-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-text block">Objective 4</span>
            <h3 className="font-display font-semibold text-text text-base">Verifiable Records</h3>
            <p className="text-xs text-text-muted leading-relaxed">
              Issue tamper-resistant digital certificates and cryptographically authenticated membership credentials
              for student career portfolios.
            </p>
          </div>
        </div>
      </section>

      {/* Membership & Enrollment Pathway */}
      <div className="rounded-xl border border-border bg-surface p-8 shadow-sm space-y-4">
        <h2 className="font-display text-xl font-bold text-text">Membership &amp; Community Participation</h2>
        <p className="text-xs sm:text-sm text-text-muted leading-relaxed">
          CSI GCET SB membership is open to enrolled engineering students at GCET. Registered members receive
          access to technical workshop allocations, verified certification issuance, eligibility for committee leadership,
          and dynamic digital passes for campus events.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/register"
            className="rounded-md bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            Apply for Student Membership
          </Link>
          <Link
            href="/team"
            className="rounded-md border border-border bg-surface px-5 py-2.5 text-xs font-semibold text-text hover:bg-surface-raised"
          >
            Explore Committee Structure
          </Link>
        </div>
      </div>
    </div>
  );
}
