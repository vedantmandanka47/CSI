'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-context';

export function AuthAwareAction() {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center gap-3">
        <div className="h-11 w-32 animate-pulse rounded-md bg-surface-raised" />
        <div className="h-11 w-32 animate-pulse rounded-md bg-surface-raised" />
      </div>
    );
  }

  if (isAuthenticated && user) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard"
          className="rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
        >
          Open Member Dashboard
        </Link>
        <span className="text-xs text-text-muted">
          Signed in as <strong className="font-medium text-text">{user.full_name}</strong>
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        href="/register"
        className="rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
      >
        Join CSI GCET
      </Link>
      <Link
        href="/login"
        className="rounded-md border border-border bg-surface px-6 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-surface-raised"
      >
        Member Portal
      </Link>
    </div>
  );
}

