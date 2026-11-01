'use client';

import React, { useState, useEffect, use, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import {
  CommitteeWorkspaceDetails,
  WorkspacesListResponse,
} from '@csi/shared';
import {
  Users,
  ShieldAlert,
  ArrowRight,
  Layers,
  Calendar,
  QrCode,
  Building2,
  FileCheck,
  Search,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';

interface WorkspacePageProps {
  params: Promise<{ code: string }>;
}

export default function CommitteeWorkspacePage({ params }: WorkspacePageProps) {
  const resolvedParams = use(params);
  const committeeCode = resolvedParams.code;

  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [workspace, setWorkspace] = useState<CommitteeWorkspaceDetails | null>(null);
  const [allWorkspaces, setAllWorkspaces] = useState<WorkspacesListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<{
    code: string;
    message: string;
    isForbidden?: boolean;
    isNotFound?: boolean;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<'overview' | 'roster' | 'operations'>('overview');
  const [memberSearch, setMemberSearch] = useState('');
  const [switcherOpen, setSwitcherOpen] = useState(false);

  useEffect(() => {
    async function loadWorkspace() {
      if (!isAuthenticated) return;
      setLoading(true);
      setErrorStatus(null);

      try {
        const [wsDetails, wsList] = await Promise.all([
          apiClient.get<CommitteeWorkspaceDetails>(`/workspaces/${committeeCode}`),
          apiClient.get<WorkspacesListResponse>('/me/workspaces'),
        ]);

        setWorkspace(wsDetails);
        setAllWorkspaces(wsList);
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          setErrorStatus({
            code: err.code,
            message: err.message,
            isForbidden: err.status === 403,
            isNotFound: err.status === 404,
          });
        } else {
          setErrorStatus({
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred while loading this workspace.',
          });
        }
      } finally {
        setLoading(false);
      }
    }

    if (isAuthenticated) {
      void loadWorkspace();
    }
  }, [committeeCode, isAuthenticated]);

  // Filtered members for roster tab
  const filteredMembers = useMemo(() => {
    if (!workspace) return [];
    if (!memberSearch.trim()) return workspace.members;

    const q = memberSearch.toLowerCase();
    return workspace.members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.branch && m.branch.toLowerCase().includes(q)) ||
        m.roleName.toLowerCase().includes(q),
    );
  }, [workspace, memberSearch]);

  if (authLoading || (loading && isAuthenticated)) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center px-4 py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-text-muted">Loading committee workspace shell...</p>
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

  // Error / Boundary handling
  if (errorStatus) {
    return (
      <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-3xl px-4 py-12">
        <div className="rounded-lg border border-border bg-surface p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-surface-raised p-3">
              {errorStatus.isForbidden ? (
                <ShieldAlert className="h-8 w-8 text-accent" />
              ) : (
                <AlertTriangle className="h-8 w-8 text-primary" />
              )}
            </div>
            <div className="flex-1">
              <span className="rounded-md bg-surface-raised px-2.5 py-1 font-mono text-xs font-semibold text-accent uppercase">
                {errorStatus.code}
              </span>
              <h1 className="mt-3 font-display text-xl font-bold tracking-tight text-text">
                {errorStatus.isForbidden ? 'Workspace Access Restricted' : 'Committee Not Found'}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                {errorStatus.message}
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-6">
                <Link
                  href="/workspaces"
                  className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90"
                >
                  View My Authorized Workspaces
                </Link>
                <Link
                  href="/dashboard"
                  className="rounded-md border border-border bg-surface px-4 py-2 text-xs font-medium text-text hover:bg-surface-raised"
                >
                  Return to Dashboard
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!workspace) {
    return null;
  }

  const { committee, currentUserAccess, metrics, recentEvents, activeSessions } = workspace;
  const userCaps = currentUserAccess.capabilities;
  const multiWorkspaces = (allWorkspaces?.workspaces.length ?? 0) > 1;

  return (
    <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Workspace Header & Dual-Role Context Switcher */}
      <div className="border-b border-border pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-surface-raised px-2.5 py-1 font-mono text-xs font-semibold text-primary uppercase">
                {committee.code}
              </span>
              <span className="rounded-pill bg-primary/10 px-3 py-0.5 text-xs font-semibold text-primary">
                {currentUserAccess.roleName}
              </span>
              {currentUserAccess.isExecutive && (
                <span className="rounded-pill bg-surface-raised px-2.5 py-0.5 text-xs font-medium text-text-muted">
                  Executive Oversight
                </span>
              )}
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
              {committee.name}
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Dedicated operational workspace and leadership shell
            </p>
          </div>

          {/* Dual-Role Context Switcher Dropdown */}
          {multiWorkspaces && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setSwitcherOpen(!switcherOpen)}
                className="flex items-center gap-2 rounded-md border border-border bg-surface px-3.5 py-2 text-xs font-medium text-text shadow-sm hover:bg-surface-raised"
              >
                <Layers className="h-4 w-4 text-primary" />
                <span>Switch Workspace ({allWorkspaces?.workspaces.length})</span>
                <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
              </button>

              {switcherOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setSwitcherOpen(false)}
                  />
                  <div className="absolute right-0 z-30 mt-2 w-64 rounded-md border border-border bg-surface py-1 shadow-lg">
                    <div className="px-3 py-1.5 text-xs font-semibold uppercase text-text-muted border-b border-border">
                      Assigned Workspaces
                    </div>
                    {allWorkspaces?.workspaces.map((ws) => {
                      const isCurrent = ws.code.toLowerCase() === committee.code.toLowerCase();
                      return (
                        <button
                          key={ws.code}
                          type="button"
                          onClick={() => {
                            setSwitcherOpen(false);
                            router.push(`/workspaces/${ws.code}`);
                          }}
                          className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-surface-raised ${
                            isCurrent ? 'bg-surface-raised font-semibold text-primary' : 'text-text'
                          }`}
                        >
                          <div>
                            <div>{ws.name}</div>
                            <div className="text-[10px] text-text-muted">{ws.userRoleName}</div>
                          </div>
                          {isCurrent && <CheckCircle2 className="h-4 w-4 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Metrics Banner */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <div className="text-xs font-medium text-text-muted">Active Team Members</div>
            <div className="mt-1 font-display text-2xl font-bold text-text">
              {metrics.totalMembers}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <div className="text-xs font-medium text-text-muted">Core Committee Heads</div>
            <div className="mt-1 font-display text-2xl font-bold text-primary">
              {metrics.coreHeads}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <div className="text-xs font-medium text-text-muted">Sub-Core Executives</div>
            <div className="mt-1 font-display text-2xl font-bold text-text">
              {metrics.subcoreExecutives}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <div className="text-xs font-medium text-text-muted">Active Sessions &amp; Events</div>
            <div className="mt-1 font-display text-2xl font-bold text-accent">
              {activeSessions.length + metrics.activeEventsCount}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-6 flex border-b border-border">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'overview'
                ? 'border-primary font-semibold text-primary'
                : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            Overview &amp; Tools
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('roster')}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'roster'
                ? 'border-primary font-semibold text-primary'
                : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            Team Roster ({workspace.members.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('operations')}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'operations'
                ? 'border-primary font-semibold text-primary'
                : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            Role Shell &amp; Capabilities
          </button>
        </div>
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div className="mt-8 space-y-8">
          {/* Mission & Description */}
          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-base font-semibold text-text">Committee Mandate</h2>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              {committee.description}
            </p>
          </div>

          {/* Active Attendance Sessions Alert */}
          {activeSessions.length > 0 && (
            <div className="rounded-lg border border-primary/20 bg-surface-raised p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-accent animate-ping" />
                    <h3 className="font-display text-sm font-bold text-text">
                      Open Attendance Sessions ({activeSessions.length})
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-text-muted">
                    Attendance check-in sessions are currently active for branch events. Authorized
                    volunteers can scan attendee QR codes.
                  </p>
                </div>
                {userCaps.canTakeAttendance && (
                  <Link
                    href="/scanner"
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90"
                  >
                    <QrCode className="h-4 w-4" />
                    <span>Open Attendance Scanner</span>
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Operational Quick Tools Grid */}
          <div>
            <h2 className="text-base font-semibold text-text">Operational Shell Actions</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {userCaps.canTakeAttendance && (
                <Link
                  href="/scanner"
                  className="group flex flex-col justify-between rounded-lg border border-border bg-surface p-5 shadow-sm hover:border-primary/50"
                >
                  <div>
                    <QrCode className="h-5 w-5 text-primary" />
                    <h3 className="mt-3 text-sm font-semibold text-text group-hover:text-primary">
                      Attendance Scanner
                    </h3>
                    <p className="mt-1 text-xs text-text-muted">
                      Scan member QR passkeys for real-time check-in.
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-1 text-xs font-medium text-primary">
                    <span>Launch</span> <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </Link>
              )}

              {userCaps.canBookVenues && (
                <Link
                  href="/admin/venues"
                  className="group flex flex-col justify-between rounded-lg border border-border bg-surface p-5 shadow-sm hover:border-primary/50"
                >
                  <div>
                    <Building2 className="h-5 w-5 text-primary" />
                    <h3 className="mt-3 text-sm font-semibold text-text group-hover:text-primary">
                      Venue Management
                    </h3>
                    <p className="mt-1 text-xs text-text-muted">
                      Check room schedules and reserve conference facilities.
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-1 text-xs font-medium text-primary">
                    <span>Manage</span> <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </Link>
              )}

              {userCaps.canManageAttendance && (
                <Link
                  href="/admin/attendance"
                  className="group flex flex-col justify-between rounded-lg border border-border bg-surface p-5 shadow-sm hover:border-primary/50"
                >
                  <div>
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    <h3 className="mt-3 text-sm font-semibold text-text group-hover:text-primary">
                      Attendance Sessions
                    </h3>
                    <p className="mt-1 text-xs text-text-muted">
                      Create, open, or finalize event attendance sessions.
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-1 text-xs font-medium text-primary">
                    <span>Administer</span> <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </Link>
              )}

              <Link
                href="/passport"
                className="group flex flex-col justify-between rounded-lg border border-border bg-surface p-5 shadow-sm hover:border-primary/50"
              >
                <div>
                  <FileCheck className="h-5 w-5 text-primary" />
                  <h3 className="mt-3 text-sm font-semibold text-text group-hover:text-primary">
                    Activity Passport
                  </h3>
                  <p className="mt-1 text-xs text-text-muted">
                    View verified leadership milestones and download extracurricular dossier.
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-1 text-xs font-medium text-primary">
                  <span>View Dossier</span> <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            </div>
          </div>

          {/* Recent & Upcoming Events */}
          <div>
            <h2 className="text-base font-semibold text-text">Affiliated Events &amp; Operations</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {recentEvents.length === 0 ? (
                <div className="col-span-2 rounded-lg border border-border bg-surface p-6 text-center text-xs text-text-muted">
                  No events currently scheduled.
                </div>
              ) : (
                recentEvents.slice(0, 4).map((evt) => (
                  <div
                    key={evt.id}
                    className="rounded-lg border border-border bg-surface p-5 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded-md bg-surface-raised px-2 py-0.5 text-[10px] font-semibold text-primary uppercase">
                        {evt.category}
                      </span>
                      <span className="text-[10px] text-text-muted uppercase font-mono">
                        {evt.state}
                      </span>
                    </div>
                    <h3 className="mt-2 text-sm font-bold text-text">{evt.title}</h3>
                    <div className="mt-3 flex items-center gap-4 text-xs text-text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(evt.startsAt).toLocaleDateString()}
                      </span>
                      {evt.venueName && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />
                          {evt.venueName}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Team Roster */}
      {activeTab === 'roster' && (
        <div className="mt-8 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-semibold text-text">
              Active Committee Roster ({workspace.members.length})
            </h2>

            {/* Search filter */}
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search team members..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="w-full rounded-md border border-border bg-surface py-2 pl-9 pr-4 text-xs text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Member table */}
          <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
            <table className="min-w-full divide-y divide-border text-left text-xs">
              <thead className="bg-surface-raised text-text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Member</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Role</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Department &amp; Year</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Tenure</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                      No members match the search query.
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((m) => (
                    <tr key={`${m.userId}-${m.roleCode}`} className="hover:bg-surface-raised/50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-text">{m.name}</div>
                        <div className="text-[11px] text-text-muted">{m.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-surface-raised px-2 py-0.5 font-medium text-primary">
                          {m.roleName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {m.branch ? `${m.branch} • Year ${m.year ?? '-'}` : 'GCET Student'}
                      </td>
                      <td className="px-4 py-3 text-text-muted font-mono text-[11px]">
                        {new Date(m.termStart).toLocaleDateString()} –{' '}
                        {m.termEnd ? new Date(m.termEnd).toLocaleDateString() : 'Present'}
                      </td>
                      <td className="px-4 py-3">
                        {m.isActive ? (
                          <span className="inline-flex items-center gap-1 rounded-pill bg-surface-raised px-2 py-0.5 text-[10px] font-semibold text-primary">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-pill bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-text-muted">
                            Past Term
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Operations & Role Shell */}
      {activeTab === 'operations' && (
        <div className="mt-8 space-y-6">
          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-base font-semibold text-text">Your Role Capabilities in this Shell</h2>
            <p className="mt-1 text-xs text-text-muted">
              Capabilities are server-authorized based on your active role: {currentUserAccess.roleName}
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex items-start gap-3 rounded-md border border-border p-4">
                <CheckCircle2
                  className={`h-5 w-5 ${userCaps.canTakeAttendance ? 'text-primary' : 'text-text-muted'}`}
                />
                <div>
                  <div className="text-xs font-semibold text-text">Event Attendance Scanning</div>
                  <div className="mt-0.5 text-[11px] text-text-muted">
                    {userCaps.canTakeAttendance ? 'Authorized to check in members' : 'Not permitted'}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-md border border-border p-4">
                <CheckCircle2
                  className={`h-5 w-5 ${userCaps.canManageAttendance ? 'text-primary' : 'text-text-muted'}`}
                />
                <div>
                  <div className="text-xs font-semibold text-text">Attendance Session Admin</div>
                  <div className="mt-0.5 text-[11px] text-text-muted">
                    {userCaps.canManageAttendance ? 'Can open and finalize sessions' : 'Not permitted'}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-md border border-border p-4">
                <CheckCircle2
                  className={`h-5 w-5 ${userCaps.canBookVenues ? 'text-primary' : 'text-text-muted'}`}
                />
                <div>
                  <div className="text-xs font-semibold text-text">Facility &amp; Venue Booking</div>
                  <div className="mt-0.5 text-[11px] text-text-muted">
                    {userCaps.canBookVenues ? 'Can reserve campus venues' : 'Not permitted'}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-md border border-border p-4">
                <CheckCircle2
                  className={`h-5 w-5 ${userCaps.canCreateEvents ? 'text-primary' : 'text-text-muted'}`}
                />
                <div>
                  <div className="text-xs font-semibold text-text">Event Lifecycle Management</div>
                  <div className="mt-0.5 text-[11px] text-text-muted">
                    {userCaps.canCreateEvents ? 'Can draft and publish events' : 'Not permitted'}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-md border border-border p-4">
                <CheckCircle2
                  className={`h-5 w-5 ${userCaps.canGenerateCertificates ? 'text-primary' : 'text-text-muted'}`}
                />
                <div>
                  <div className="text-xs font-semibold text-text">Credential Issuance</div>
                  <div className="mt-0.5 text-[11px] text-text-muted">
                    {userCaps.canGenerateCertificates ? 'Can issue batch certificates' : 'Not permitted'}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-md border border-border p-4">
                <CheckCircle2
                  className={`h-5 w-5 ${userCaps.canExportData ? 'text-primary' : 'text-text-muted'}`}
                />
                <div>
                  <div className="text-xs font-semibold text-text">Academic &amp; Placement Export</div>
                  <div className="mt-0.5 text-[11px] text-text-muted">
                    {userCaps.canExportData ? 'Can export branch reporting data' : 'Not permitted'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
