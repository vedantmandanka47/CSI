'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import { DriveWindow, RoleCode, PermissionCode } from '@csi/shared';
import {
  CalendarRange,
  CheckCircle2,
  XCircle,
  ToggleLeft,
  ToggleRight,
  Clock,
  ShieldAlert,
  ArrowLeft,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

export default function AdminDrivesPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [drives, setDrives] = useState<DriveWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Edit form state
  const [editingType, setEditingType] = useState<string | null>(null);
  const [opensAtInput, setOpensAtInput] = useState('');
  const [closesAtInput, setClosesAtInput] = useState('');

  const isExecutive =
    user &&
    (user.roles.includes(RoleCode.PRESIDENT) ||
      user.roles.includes(RoleCode.VP) ||
      user.roles.includes(RoleCode.ADMIN) ||
      user.permissions.includes(PermissionCode.DRIVE_TOGGLE));

  const fetchDrives = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await apiClient.get<DriveWindow[]>('/admin/drives');
      setDrives(response);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load drive windows.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && isExecutive) {
      void fetchDrives();
    }
  }, [isAuthenticated, isExecutive, fetchDrives]);

  const handleToggle = async (type: string) => {
    setActionLoading(type);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const updated = await apiClient.post<DriveWindow>(`/admin/drives/${type}`, {});
      setSuccessMessage(`Drive window "${type}" successfully ${updated.is_open ? 'opened' : 'closed'}.`);
      void fetchDrives();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to toggle drive window.');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveDates = async (type: string) => {
    if (!opensAtInput || !closesAtInput) {
      setErrorMessage('Please provide both open and close timestamps.');
      return;
    }
    const opensDate = new Date(opensAtInput);
    const closesDate = new Date(closesAtInput);
    if (closesDate <= opensDate) {
      setErrorMessage('Close date must be strictly after open date.');
      return;
    }

    setActionLoading(type);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await apiClient.post<DriveWindow>('/admin/drives', {
        type,
        opens_at: opensDate.toISOString(),
        closes_at: closesDate.toISOString(),
      });
      setSuccessMessage(`Drive dates for "${type}" successfully saved.`);
      setEditingType(null);
      void fetchDrives();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to update drive window dates.');
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
          <p className="text-sm font-medium text-text-muted">Loading executive controls...</p>
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
          Executive Access Required
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Only authorized CSI GCET Branch Executives (President, Vice-President, Administrator) may adjust recruitment drive windows.
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
    <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Navigation Breadcrumb */}
      <div className="mb-6 flex items-center gap-2">
        <Link
          href="/admin/members"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted transition-colors hover:text-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Member Applications</span>
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 border-b border-border pb-6 sm:flex-row sm:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-pill bg-surface-raised px-3 py-1 text-xs font-semibold text-primary">
            <CalendarRange className="h-3.5 w-3.5" />
            <span>Recruitment Operations</span>
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
            Membership Drive Windows
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Configure recruitment windows, toggle open/close status, and manage student intake periods.
          </p>
        </div>
      </div>

      {/* Feedback Messages */}
      {errorMessage && (
        <div className="mt-6 flex items-center gap-3 rounded-lg border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p>{errorMessage}</p>
        </div>
      )}

      {successMessage && (
        <div className="mt-6 flex items-center gap-3 rounded-lg border border-success/20 bg-success/5 p-4 text-sm text-success">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          <p>{successMessage}</p>
        </div>
      )}

      {/* Drive Windows List */}
      <div className="mt-8">
        {loading ? (
          <div className="my-16 flex flex-col items-center justify-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm font-medium text-text-muted">Fetching drive window configurations...</p>
          </div>
        ) : drives.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-8 text-center">
            <CalendarRange className="mx-auto h-12 w-12 text-text-muted opacity-50" />
            <h3 className="mt-3 font-display text-base font-semibold text-text">No Drive Windows Initialized</h3>
            <p className="mt-1 text-sm text-text-muted">
              Initialize a recruitment drive window to begin taking applications.
            </p>
            <button
              type="button"
              onClick={() => {
                setEditingType('membership');
                const now = new Date();
                const oneMonth = new Date(now.getTime() + 30 * 86400000);
                setOpensAtInput(now.toISOString().slice(0, 16));
                setClosesAtInput(oneMonth.toISOString().slice(0, 16));
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Initialize Membership Drive</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {drives.map((drive) => {
              const now = new Date();
              const opens = new Date(drive.opens_at);
              const closes = new Date(drive.closes_at);
              const isInDateRange = now >= opens && now <= closes;
              const isCurrentlyAccepting = drive.is_open && isInDateRange;

              return (
                <div
                  key={drive.id}
                  className="rounded-xl border border-border bg-surface p-6 shadow-sm transition-shadow hover:shadow-md sm:p-8"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold uppercase tracking-wider text-primary">
                          Type: {drive.type}
                        </span>
                        {isCurrentlyAccepting ? (
                          <span className="inline-flex items-center gap-1 rounded-pill bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>ACCEPTING APPLICATIONS</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-pill bg-surface-raised px-2.5 py-0.5 text-xs font-semibold text-text-muted">
                            <XCircle className="h-3 w-3" />
                            <span>CLOSED</span>
                          </span>
                        )}
                      </div>
                      <h2 className="mt-1 font-display text-xl font-bold text-text">
                        Annual CSI GCET Membership Intake
                      </h2>
                    </div>

                    {/* Toggle Button */}
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void handleToggle(drive.type)}
                        disabled={actionLoading === drive.type}
                        className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold shadow-sm transition-colors ${
                          drive.is_open
                            ? 'border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20'
                            : 'bg-primary text-primary-foreground hover:opacity-90'
                        } disabled:opacity-50`}
                      >
                        {drive.is_open ? (
                          <>
                            <ToggleRight className="h-4 w-4" />
                            <span>Close Intake</span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="h-4 w-4" />
                            <span>Open Intake</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingType(drive.type);
                          setOpensAtInput(new Date(drive.opens_at).toISOString().slice(0, 16));
                          setClosesAtInput(new Date(drive.closes_at).toISOString().slice(0, 16));
                        }}
                        className="rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-text transition-colors hover:bg-surface-raised"
                      >
                        Adjust Dates
                      </button>
                    </div>
                  </div>

                  {/* Window Timeline Info */}
                  <div className="mt-6 grid grid-cols-1 gap-4 rounded-lg bg-surface-raised p-4 sm:grid-cols-3">
                    <div>
                      <div className="flex items-center gap-1.5 text-xs text-text-muted">
                        <Clock className="h-3.5 w-3.5" />
                        <span>Opens At</span>
                      </div>
                      <p className="mt-1 font-mono text-xs font-semibold text-text">
                        {new Date(drive.opens_at).toLocaleString('en-IN', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5 text-xs text-text-muted">
                        <Clock className="h-3.5 w-3.5" />
                        <span>Closes At</span>
                      </div>
                      <p className="mt-1 font-mono text-xs font-semibold text-text">
                        {new Date(drive.closes_at).toLocaleString('en-IN', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5 text-xs text-text-muted">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Master Switch</span>
                      </div>
                      <p className="mt-1 font-mono text-xs font-semibold text-text">
                        {drive.is_open ? 'Enabled (ON)' : 'Disabled (OFF)'}
                      </p>
                    </div>
                  </div>

                  {/* Date adjustment sub-form */}
                  {editingType === drive.type && (
                    <div className="mt-6 rounded-lg border border-border bg-surface p-4">
                      <h4 className="font-display text-sm font-bold text-text">
                        Modify Recruitment Window Dates
                      </h4>
                      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-text-muted">
                            Opening Timestamp
                          </label>
                          <input
                            type="datetime-local"
                            value={opensAtInput}
                            onChange={(e) => setOpensAtInput(e.target.value)}
                            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text focus:border-primary focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-text-muted">
                            Closing Timestamp
                          </label>
                          <input
                            type="datetime-local"
                            value={closesAtInput}
                            onChange={(e) => setClosesAtInput(e.target.value)}
                            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text focus:border-primary focus:outline-none"
                          />
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingType(null)}
                          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-raised"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSaveDates(drive.type)}
                          disabled={actionLoading === drive.type}
                          className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                        >
                          {actionLoading === drive.type ? 'Saving...' : 'Save Window Dates'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 border-t border-border pt-3">
                    <p className="text-[11px] text-text-muted">
                      Audit Trail: Changes to drive windows trigger immutable audit entries with actor tracking (action: DRIVE_WINDOW_UPDATED / DRIVE_WINDOW_TOGGLED).
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
