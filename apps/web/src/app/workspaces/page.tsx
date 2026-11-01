'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import { WorkspacesListResponse } from '@csi/shared';
import {
  Users,
  ShieldAlert,
  ArrowRight,
  Layers,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

export default function WorkspacesIndexPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<WorkspacesListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function fetchWorkspaces() {
      if (!isAuthenticated) return;
      setLoading(true);
      setErrorMessage(null);

      try {
        const response = await apiClient.get<WorkspacesListResponse>('/me/workspaces');
        setData(response);

        // If user has exactly one workspace, auto-redirect to it
        if (response.workspaces.length === 1 && !response.isExecutive && response.workspaces[0]) {
          router.replace(`/workspaces/${response.workspaces[0].code}`);
        }
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          setErrorMessage(err.message);
        } else {
          setErrorMessage('Unable to retrieve committee workspaces.');
        }
      } finally {
        setLoading(false);
      }
    }

    if (isAuthenticated) {
      void fetchWorkspaces();
    }
  }, [isAuthenticated, router]);

  if (authLoading || (loading && isAuthenticated)) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center px-4 py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-text-muted">Loading committee workspaces...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl flex-col items-center justify-center px-4 py-12 text-center">
        <div className="rounded-full bg-surface-raised p-4 ring-8 ring-surface-raised/50">
          <Users className="h-10 w-10 text-primary" />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-text">
          Committee Authentication Required
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Please sign in to access dedicated committee workspaces and operational shells.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            Sign In
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-border bg-surface px-5 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-raised"
          >
            Return to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  // Error state
  if (errorMessage) {
    return (
      <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-3xl px-4 py-12">
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <ShieldAlert className="h-6 w-6 text-accent" />
            <div>
              <h2 className="text-base font-semibold text-text">Workspace Access Error</h2>
              <p className="mt-1 text-sm text-text-muted">{errorMessage}</p>
              <div className="mt-4">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  Return to Dashboard <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const workspaces = data?.workspaces ?? [];

  // Empty state: User has no committee assignment
  if (workspaces.length === 0) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col items-center justify-center px-4 py-12 text-center">
        <div className="rounded-full bg-surface-raised p-4 ring-8 ring-surface-raised/50">
          <Layers className="h-10 w-10 text-text-muted" />
        </div>
        <div className="mt-6 inline-flex items-center gap-1.5 rounded-pill bg-surface-raised px-3 py-1 text-xs font-medium text-text-muted">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>Role-Specific Shells</span>
        </div>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-text">
          No Active Committee Assignment
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-text-muted">
          Committee workspaces are private operational hubs reserved for appointed volunteers,
          sub-core executives, and core heads across Technical, Content &amp; Documentation, Design &amp;
          Media, Public Relations, Motion &amp; Cinematography, and Logistics &amp; Operations.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
          >
            Go to Member Dashboard
          </Link>
          <Link
            href="/team"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-5 py-2.5 text-sm font-medium text-text hover:bg-surface-raised"
          >
            Meet the Committees
          </Link>
        </div>
      </main>
    );
  }

  // Multi-workspace selection view (or executive overview)
  return (
    <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="border-b border-border pb-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-pill bg-surface-raised px-3 py-1 text-xs font-semibold text-primary">
              <Layers className="h-3.5 w-3.5" />
              <span>{data?.isExecutive ? 'Executive Oversight' : 'Committee Hubs'}</span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
              Committee Workspaces
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Select an authorized committee workspace to enter its operational shell and tools.
            </p>
          </div>
          {data?.primaryWorkspace && (
            <div>
              <Link
                href={`/workspaces/${data.primaryWorkspace.code}`}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
              >
                <span>Enter {data.primaryWorkspace.name}</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Committee Workspace Cards Grid */}
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {workspaces.map((ws) => (
          <Link
            key={ws.code}
            href={`/workspaces/${ws.code}`}
            className="group flex flex-col justify-between rounded-lg border border-border bg-surface p-6 shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-surface-raised px-2.5 py-1 font-mono text-xs font-semibold text-primary uppercase">
                  {ws.code}
                </span>
                <span className="rounded-pill bg-surface-raised px-2.5 py-0.5 text-xs font-medium text-text-muted">
                  {ws.userRoleName}
                </span>
              </div>
              <h2 className="mt-4 font-display text-lg font-bold text-text group-hover:text-primary transition-colors">
                {ws.name}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-text-muted line-clamp-3">
                {ws.description}
              </p>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-xs font-medium text-primary">
              <span>Open Workspace Shell</span>
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
