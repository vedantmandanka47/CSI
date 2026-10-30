'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-context';

export function Navbar() {
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/events', label: 'Events' },
    { href: '/team', label: 'Team' },
    { href: '/about', label: 'About' },
    { href: '/health', label: 'Status' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-surface/90 backdrop-blur-md transition-colors duration-200">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand & Logo */}
        <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-90">
          <div className="relative h-10 w-10 overflow-hidden rounded-md border border-border bg-surface p-1 shadow-sm">
            <Image
              src="/brand/csi-logo.png"
              alt="CSI GCET Student Branch Logo"
              width={40}
              height={40}
              className="h-full w-full object-contain"
              priority
            />
          </div>
          <div className="flex flex-col">
            <span className="font-display text-base font-bold tracking-tight text-text">
              CSI GCET SB
            </span>
            <span className="text-xs uppercase tracking-wider text-text-muted">
              Computer Society of India
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links with Active State */}
        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-surface-raised font-semibold text-primary'
                    : 'text-text-muted hover:bg-surface-raised hover:text-text'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Desktop Actions: Auth */}
        <div className="hidden items-center gap-3 md:flex">
          {/* User Status / Login Buttons */}
          {isLoading ? (
            <div className="h-8 w-20 animate-pulse rounded-md bg-surface-raised" />
          ) : isAuthenticated && user ? (
            <div className="flex items-center gap-3">
              <div className="flex flex-col text-right">
                <span className="text-xs font-semibold text-text">{user.full_name}</span>
                <span className="text-xs uppercase tracking-wider text-text-muted">
                  {user.roles[0] ?? 'member'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-raised"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-md border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-raised"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
              >
                Register
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Actions: Menu Button */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="inline-flex items-center justify-center rounded-md p-2 text-text-muted hover:bg-surface-raised hover:text-text focus:outline-none"
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="border-b border-border bg-surface px-4 pb-4 pt-2 md:hidden">
          <nav className="flex flex-col gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`rounded-md px-3 py-2 text-sm font-medium ${
                    isActive
                      ? 'bg-surface-raised font-semibold text-primary'
                      : 'text-text-muted hover:bg-surface-raised hover:text-text'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}

            <div className="mt-3 border-t border-border pt-3">
              {isAuthenticated && user ? (
                <div className="flex flex-col gap-2">
                  <div className="px-3 text-xs text-text-muted">
                    Signed in as <span className="font-medium text-text">{user.full_name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void logout();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full rounded-md border border-border px-3 py-2 text-left text-sm font-medium text-text hover:bg-surface-raised"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Link
                    href="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full rounded-md border border-border px-3 py-2 text-center text-sm font-medium text-text hover:bg-surface-raised"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    Register
                  </Link>
                </div>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
