import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer id="footer" className="border-t border-border bg-surface text-text transition-colors duration-200">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Brand info */}
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
              <span className="font-display text-base font-bold text-text">
                CSI GCET Student Branch
              </span>
            </div>
            <p className="max-w-md text-xs leading-relaxed text-text-muted">
              Computer Society of India Student Branch at G H Patel College of Engineering &
              Technology (GCET), Vallabh Vidyanagar. Empowering future technologists through
              technical workshops, symposiums, and collaborative innovation.
            </p>
          </div>

          {/* Quick Links */}
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
                  Events & Workshops
                </Link>
              </li>
              <li>
                <Link href="/team" className="text-text-muted transition-colors hover:text-text">
                  Core Committee
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-text-muted transition-colors hover:text-text">
                  About Branch
                </Link>
              </li>
            </ul>
          </div>

          {/* System & Compliance */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text">Platform</h3>
            <ul className="mt-3 space-y-2 text-xs">
              <li>
                <Link href="/health" className="text-text-muted transition-colors hover:text-text">
                  System Status & Health
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-text-muted transition-colors hover:text-text">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <a
                  href="https://gcet.ac.in"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-muted transition-colors hover:text-text"
                >
                  GCET Official Portal ↗
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-6 text-center text-xs text-text-muted">
          <p>© {currentYear} Computer Society of India — GCET Student Branch. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

