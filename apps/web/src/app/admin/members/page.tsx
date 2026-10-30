'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import { MemberApplicationDetail, RoleCode, PermissionCode } from '@csi/shared';
import {
  Users,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  CalendarRange,
  ArrowRight,
} from 'lucide-react';

export default function AdminMembersPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [applications, setApplications] = useState<MemberApplicationDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Reject modal state
  const [rejectingUser, setRejectingUser] = useState<MemberApplicationDetail | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');

  const isExecutive =
    user &&
    (user.roles.includes(RoleCode.PRESIDENT) ||
      user.roles.includes(RoleCode.VP) ||
      user.roles.includes(RoleCode.ADMIN) ||
      user.permissions.includes(PermissionCode.ROSTER_MANAGE));

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        per_page: '15',
        status: statusFilter,
      });
      if (searchQuery.trim()) {
        queryParams.set('q', searchQuery.trim());
      }

      const response = await apiClient.get<{
        data: MemberApplicationDetail[];
        meta: { page: number; per_page: number; total: number; total_pages: number };
      }>(`/admin/members/applications?${queryParams.toString()}`);

      setApplications(response.data);
      setTotalPages(response.meta.total_pages);
      setTotalRecords(response.meta.total);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load membership applications.');
      }
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, searchQuery]);

  useEffect(() => {
    if (isAuthenticated && isExecutive) {
      void fetchApplications();
    }
  }, [isAuthenticated, isExecutive, fetchApplications]);

  const handleApprove = async (appId: string) => {
    setActionLoading(appId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await apiClient.post(`/admin/members/applications/${appId}/approve`, {});
      setSuccessMessage('Student application approved. Member status activated and role assigned.');
      void fetchApplications();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to approve application.');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectingUser) return;
    setActionLoading(rejectingUser.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await apiClient.post(`/admin/members/applications/${rejectingUser.id}/reject`, {
        reason: rejectReason.trim() || undefined,
      });
      setSuccessMessage(`Application for ${rejectingUser.name} rejected.`);
      setRejectingUser(null);
      setRejectReason('');
      void fetchApplications();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to reject application.');
      }
    } finally {
      setActionLoading(null);
    }
  };

  if (authLoading) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl items-center justify-center px-4 py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-text-muted">Loading executive verification system...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !isExecutive) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl flex-col items-center justify-center px-4 py-12 text-center">
        <div className="rounded-full bg-danger/10 p-4 ring-8 ring-danger/5">
          <ShieldAlert className="h-10 w-10 text-danger" />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-text">
          Executive Roster Access Required
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Only CSI GCET Branch Executives with roster management authority may review and verify student membership applications.
        </p>
        <Link
          href="/"
          className="mt-6 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
        >
          Return to Home
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header & Quick Links */}
      <div className="flex flex-col items-start justify-between gap-4 border-b border-border pb-6 sm:flex-row sm:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-pill bg-surface-raised px-3 py-1 text-xs font-semibold text-primary">
            <Users className="h-3.5 w-3.5" />
            <span>Membership Operations</span>
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
            Membership Onboarding & Roster Verification
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Cross-reference applicant enrollment records against the official GCET academic roster.
          </p>
        </div>

        <Link
          href="/admin/drives"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-xs font-semibold text-text shadow-sm transition-colors hover:bg-surface-raised"
        >
          <CalendarRange className="h-4 w-4 text-primary" />
          <span>Manage Drive Windows</span>
          <ArrowRight className="h-3.5 w-3.5 text-text-muted" />
        </Link>
      </div>

      {/* Messages */}
      {errorMessage && (
        <div className="mt-6 flex items-center gap-3 rounded-lg border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
          <XCircle className="h-5 w-5 flex-shrink-0" />
          <p>{errorMessage}</p>
        </div>
      )}

      {successMessage && (
        <div className="mt-6 flex items-center gap-3 rounded-lg border border-success/20 bg-success/5 p-4 text-sm text-success">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          <p>{successMessage}</p>
        </div>
      )}

      {/* Controls: Search & Status Filters */}
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Status Filter Tabs */}
        <div className="inline-flex rounded-lg border border-border bg-surface p-1 shadow-sm">
          {[
            { id: 'pending', label: 'Pending Review' },
            { id: 'active', label: 'Active Members' },
            { id: 'inactive', label: 'Inactive / Rejected' },
            { id: 'all', label: 'All Records' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setStatusFilter(tab.id);
                setPage(1);
              }}
              className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === tab.id
                  ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                  : 'text-text-muted hover:bg-surface-raised hover:text-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search name, enrollment, email..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-md border border-border bg-surface py-1.5 pl-9 pr-3 text-xs text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {/* Table of Applications */}
      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {loading ? (
          <div className="my-16 flex flex-col items-center justify-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm font-medium text-text-muted">Loading applications...</p>
          </div>
        ) : applications.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="mx-auto h-12 w-12 text-text-muted opacity-40" />
            <h3 className="mt-3 font-display text-base font-semibold text-text">No Applications Found</h3>
            <p className="mt-1 text-sm text-text-muted">
              {statusFilter === 'pending'
                ? 'No pending student applications awaiting review.'
                : 'No student records match the current filter criteria.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-surface-raised font-mono text-[11px] uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="px-6 py-3.5">Student / Contact</th>
                  <th className="px-6 py-3.5">Enrollment No</th>
                  <th className="px-6 py-3.5">Roster Status</th>
                  <th className="px-6 py-3.5">Branch / Year</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {applications.map((app) => (
                  <tr key={app.id} className="transition-colors hover:bg-surface-raised/40">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-text">{app.name}</div>
                      <div className="text-[11px] text-text-muted">{app.email}</div>
                    </td>
                    <td className="px-6 py-4 font-mono font-medium text-primary">
                      {app.enrollment_no || '—'}
                    </td>
                    <td className="px-6 py-4">
                      {app.is_on_roster ? (
                        <span className="inline-flex items-center gap-1.5 rounded-pill bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Roster Verified</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-pill bg-highlight/20 px-2.5 py-1 text-[11px] font-semibold text-warning">
                          <AlertTriangle className="h-3 w-3" />
                          <span>Not On Roster</span>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-text">
                      <div>{app.branch || 'General'}</div>
                      <div className="text-[11px] text-text-muted">Year {app.year || 1}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-block rounded-pill px-2.5 py-0.5 text-[11px] font-semibold uppercase ${
                          app.status === 'active'
                            ? 'bg-success/10 text-success'
                            : app.status === 'pending'
                            ? 'bg-highlight/20 text-warning'
                            : 'bg-surface-raised text-text-muted'
                        }`}
                      >
                        {app.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {app.status === 'pending' ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void handleApprove(app.id)}
                            disabled={actionLoading === app.id}
                            className="inline-flex items-center gap-1 rounded-md bg-success px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Approve</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingUser(app);
                              setRejectReason('');
                            }}
                            disabled={actionLoading === app.id}
                            className="inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger/20 disabled:opacity-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      ) : (
                        <span className="font-mono text-[11px] text-text-muted">Processed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalRecords > 0 && (
          <div className="flex items-center justify-between border-t border-border bg-surface-raised px-6 py-3">
            <span className="text-xs text-text-muted">
              Showing {applications.length} of {totalRecords} records
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-text disabled:opacity-40"
              >
                Previous
              </button>
              <span className="font-mono text-xs text-text-muted">
                {page} / {totalPages || 1}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-text disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reject Modal Dialog */}
      {rejectingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl">
            <div className="flex items-center gap-3 text-danger">
              <AlertTriangle className="h-6 w-6 flex-shrink-0" />
              <h3 className="font-display text-base font-bold text-text">
                Reject Membership Application
              </h3>
            </div>
            <p className="mt-2 text-xs text-text-muted">
              Rejecting applicant <span className="font-semibold text-text">{rejectingUser.name}</span> (
              {rejectingUser.enrollment_no || 'No Enrollment'}). This will mark their profile as inactive and log an audit record.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-medium text-text-muted">
                Rejection Reason (Optional)
              </label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Enrollment number does not match GCET academic roster records..."
                className="mt-1 w-full rounded-md border border-border bg-surface p-2.5 text-xs text-text focus:border-primary focus:outline-none"
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectingUser(null)}
                className="rounded-md border border-border px-4 py-1.5 text-xs font-medium text-text hover:bg-surface-raised"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleReject()}
                disabled={actionLoading === rejectingUser.id}
                className="rounded-md bg-danger px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {actionLoading === rejectingUser.id ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
