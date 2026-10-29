import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'About CSI GCET SB — Computer Society of India',
  description: 'History, objectives, and charter of the CSI GCET Student Branch.',
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="space-y-8 rounded-lg border border-border bg-surface p-8 shadow-sm">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-text">About CSI GCET SB</h1>
          <p className="mt-2 text-xs text-text-muted">Chartered under Computer Society of India Region III</p>
        </div>

        <section className="space-y-3 text-xs leading-relaxed text-text">
          <h2 className="text-base font-semibold text-text">About Computer Society of India</h2>
          <p>
            Formed in 1965, the Computer Society of India (CSI) is the largest and most prestigious
            association of IT and computer science professionals in India. The society is dedicated
            to the advancement of computer science, data communications, and informatics.
          </p>
        </section>

        <section className="space-y-3 text-xs leading-relaxed text-text">
          <h2 className="text-base font-semibold text-text">The GCET Student Branch</h2>
          <p>
            The Student Branch at G H Patel College of Engineering & Technology (GCET), Vallabh
            Vidyanagar, serves as an active hub for student technocrats. Under the mentorship of
            experienced faculty counselors, the branch organizes state and national level technical
            events, industrial visits, hackathons, and guest lectures from eminent industry leaders.
          </p>
        </section>

        <section className="space-y-3 text-xs leading-relaxed text-text">
          <h2 className="text-base font-semibold text-text">Branch Objectives</h2>
          <ul className="list-disc pl-5 space-y-1.5 text-text-muted">
            <li>Bridge the gap between academic theory and practical industry practices.</li>
            <li>Provide student members with hands-on exposure to emerging technical paradigms.</li>
            <li>Foster peer-to-peer collaboration, leadership, and professional ethics.</li>
            <li>Provide cryptographically verifiable certifications for event achievements.</li>
          </ul>
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
