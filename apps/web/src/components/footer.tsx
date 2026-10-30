import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer id="footer" className="border-t border-border bg-surface text-text transition-colors duration-200">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4 lg:grid-cols-5">
          {/* Institutional Brand info */}
          <div className="space-y-4 md:col-span-2">
            <div className="flex items-center gap-3">
              <div className="relative h-9 w-9 overflow-hidden rounded-md border border-border bg-surface p-1 shadow-sm">
                <Image
                  src="/brand/csi-logo.png"
                  alt="CSI GCET Logo"
                  width={36}
                  height={36}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="flex flex-col">
                <span className="font-display text-base font-bold text-text">
                  CSI GCET Student Branch
                </span>
                <span className="text-xs text-text-muted">
                  Computer Society of India Region III
                </span>
              </div>
            </div>
            <p className="max-w-md text-xs leading-relaxed text-text-muted">
              Computer Society of India Student Branch at G H Patel College of Engineering &
              Technology, Vallabh Vidyanagar. Advancing computing education, technical symposiums,
              peer engineering, and verified credentials across Gujarat.
            </p>
            <div className="text-xs text-text-muted">
              Charutar Vidyamandal (CVM) Educational Hub
            </div>
          </div>

          {/* Core Navigation */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text">Navigation</h3>
            <ul className="mt-3 space-y-2 text-xs">
              <li>
                <Link href="/" className="text-text-muted transition-colors hover:text-text">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/events" className="text-text-muted transition-colors hover:text-text">
                  Events &amp; Workshops
                </Link>
              </li>
              <li>
                <Link href="/team" className="text-text-muted transition-colors hover:text-text">
                  Committees &amp; Team
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-text-muted transition-colors hover:text-text">
                  About CSI GCET
                </Link>
              </li>
            </ul>
          </div>

          {/* Membership Portal */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text">Membership</h3>
            <ul className="mt-3 space-y-2 text-xs">
              <li>
                <Link href="/register" className="text-text-muted transition-colors hover:text-text">
                  Student Registration
                </Link>
              </li>
              <li>
                <Link href="/login" className="text-text-muted transition-colors hover:text-text">
                  Member Portal Sign In
                </Link>
              </li>
              <li>
                <Link href="/verify-email" className="text-text-muted transition-colors hover:text-text">
                  Email Verification
                </Link>
              </li>
              <li>
                <Link href="/forgot-password" className="text-text-muted transition-colors hover:text-text">
                  Password Recovery
                </Link>
              </li>
            </ul>
          </div>

          {/* Platform & Governance */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text">Governance</h3>
            <ul className="mt-3 space-y-2 text-xs">
              <li>
                <Link href="/health" className="text-text-muted transition-colors hover:text-text">
                  System Diagnostics
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-text-muted transition-colors hover:text-text">
                  Data Protection &amp; Privacy
                </Link>
              </li>
              <li>
                <a
                  href="https://gcet.ac.in"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-muted transition-colors hover:text-text"
                >
                  GCET Official Website
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 text-xs text-text-muted sm:flex-row">
          <p>&copy; {currentYear} Computer Society of India &mdash; GCET Student Branch. All rights reserved.</p>
          <p>Operated by CSI Student Branch under GCET Faculty Guidance</p>
        </div>
      </div>
    </footer>
  );
}
