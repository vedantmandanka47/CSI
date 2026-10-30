'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import {
  AttendanceSession,
  AttendanceAudience,
  RoleCode,
  PermissionCode,
} from '@csi/shared';
import {
  CalendarCheck2,
  Clock,
  Plus,
  Play,
  Pause,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

interface EventSummary {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
}

export default function AdminAttendancePage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // New session modal / form state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [sessionAudience, setSessionAudience] = useState<string>(AttendanceAudience.ALL);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  // Active TOTP view state
  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null);
  const [totpCountdown, setTotpCountdown] = useState<number>(30);

  const isAuthorized =
    user &&
    (user.roles.includes(RoleCode.PRESIDENT) ||
      user.roles.includes(RoleCode.VP) ||
      user.roles.includes(RoleCode.CORE) ||
      user.roles.includes(RoleCode.SUBCORE) ||
      user.roles.includes(RoleCode.COMMITTEE) ||
      user.roles.includes(RoleCode.ADMIN) ||
      user.permissions.includes(PermissionCode.ATTENDANCE_TAKE) ||
      user.permissions.includes(PermissionCode.ATTENDANCE_MANAGE));

  // 1. Fetch upcoming events
  const fetchEvents = useCallback(async () => {
    try {
      const res = await apiClient.get<{ data: EventSummary[] }>('/events?per_page=50');
      setEvents(res.data);
      if (res.data.length > 0 && !selectedEventId) {
        setSelectedEventId(res.data[0]?.id ?? '');
      }
    } catch {
      // fallback
    }
  }, [selectedEventId]);

  // 2. Fetch sessions for selected event
  const fetchSessions = useCallback(async () => {
    if (!selectedEventId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await apiClient.get<{ data: AttendanceSession[] }>(
        `/events/${selectedEventId}/attendance-sessions`,
      );
      setSessions(res.data);
      if (res.data.length > 0 && !activeSession) {
        // Fetch detailed first session with TOTP code
        const first = res.data[0];
        if (first) {
          const detail = await apiClient.get<{ data: AttendanceSession }>(
            `/attendance/sessions/${first.id}`,
          );
          setActiveSession(detail.data);
        }
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load attendance sessions.');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedEventId, activeSession]);

  useEffect(() => {
    if (isAuthenticated && isAuthorized) {
      void fetchEvents();
    }
  }, [isAuthenticated, isAuthorized, fetchEvents]);

  useEffect(() => {
    if (selectedEventId) {
      void fetchSessions();
    }
  }, [selectedEventId, fetchSessions]);

  // Real-time TOTP countdown
  useEffect(() => {
    if (!activeSession) return;
    const interval = setInterval(() => {
      const nowSec = Math.floor(Date.now() / 1000);
      const remaining = 30 - (nowSec % 30);
      setTotpCountdown(remaining);
      if (remaining === 30) {
        // Refresh session TOTP code
        void apiClient
          .get<{ data: AttendanceSession }>(`/attendance/sessions/${activeSession.id}`)
          .then((res) => setActiveSession(res.data))
          .catch(() => {});
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession]);

  const handleToggleSession = async (sessionId: string) => {
    setActionLoading(sessionId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await apiClient.post<{ data: AttendanceSession }>(
        `/attendance/sessions/${sessionId}/toggle`,
        {},
      );
      setSuccessMessage(`Session "${res.data.name}" is now ${res.data.is_open ? 'open' : 'closed'}.`);
      void fetchSessions();
      if (activeSession?.id === sessionId) {
        setActiveSession(res.data);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to toggle session.');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateSession = async () => {
    if (!sessionName || !startsAt || !endsAt) {
      setErrorMessage('Please fill in session name and timestamps.');
      return;
    }

    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);
    if (endDate <= startDate) {
      setErrorMessage('Closing time must be after opening time.');
      return;
    }

    setActionLoading('create');
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await apiClient.post<{ data: AttendanceSession }>(
        `/events/${selectedEventId}/attendance-sessions`,
        {
          name: sessionName.trim(),
          audience: sessionAudience,
          starts_at: startDate.toISOString(),
          ends_at: endDate.toISOString(),
          is_open: true,
        },
      );
      setSuccessMessage(`Created attendance session "${res.data.name}".`);
      setShowCreateModal(false);
      setSessionName('');
      void fetchSessions();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to create session.');
      }
    } finally {
      setActionLoading(null);
    }
  };

  if (authLoading) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center px-4 py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-text-muted">Loading attendance operations...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !isAuthorized) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl flex-col items-center justify-center px-4 py-12 text-center">
        <div className="rounded-full bg-danger/10 p-4 ring-8 ring-danger/5">
          <AlertCircle className="h-10 w-10 text-danger" />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-text">
          Organizer Authorization Required
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Only authorized volunteers and chapter executives may access the attendance operations hub.
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
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 border-b border-border pb-6 sm:flex-row sm:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-pill bg-surface-raised px-3 py-1 text-xs font-semibold text-primary">
            <CalendarCheck2 className="h-3.5 w-3.5" />
            <span>Attendance Operations Hub</span>
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
            Event Attendance Management
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Configure dynamic attendance sessions, monitor verified counts, and project live 6-digit TOTP codes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/scanner"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            <QrCode className="h-4 w-4" />
            <span>Volunteer Scanner Station</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Messages */}
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

      {/* Event Selector & Actions */}
      <div className="mt-8 flex flex-col gap-4 rounded-xl border border-border bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted">
            Select Event
          </label>
          <select
            value={selectedEventId}
            onChange={(e) => {
              setSelectedEventId(e.target.value);
              setActiveSession(null);
            }}
            className="mt-1 w-full max-w-md rounded-md border border-border bg-surface px-3 py-2 text-sm font-semibold text-text focus:border-primary focus:outline-none"
          >
            {events.map((evt) => (
              <option key={evt.id} value={evt.id}>
                {evt.title} ({new Date(evt.starts_at).toLocaleDateString('en-IN')})
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowCreateModal(true);
            const now = new Date();
            const in2Hours = new Date(now.getTime() + 7200000);
            setStartsAt(now.toISOString().slice(0, 16));
            setEndsAt(in2Hours.toISOString().slice(0, 16));
          }}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-xs font-semibold text-text shadow-sm transition-colors hover:bg-surface-raised"
        >
          <Plus className="h-4 w-4 text-primary" />
          <span>New Attendance Session</span>
        </button>
      </div>

      {/* Main Grid: Active Projector Display vs Sessions List */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Projector Display: Live 6-Digit TOTP & Stats (5 Cols) */}
        <div className="rounded-xl border-2 border-primary/20 bg-surface p-6 shadow-sm sm:p-8 lg:col-span-5">
          <div className="text-center">
            <div className="inline-flex items-center gap-1.5 rounded-pill bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Projector Podium Mode</span>
            </div>
            <h2 className="mt-3 font-display text-xl font-bold text-text">
              {activeSession ? activeSession.name : 'Select a Session'}
            </h2>
            <p className="mt-1 text-xs text-text-muted">
              Display on podium screen for student 6-digit TOTP check-in.
            </p>
          </div>

          {activeSession ? (
            <div className="mt-8 flex flex-col items-center">
              {/* TOTP 6-Digit Box */}
              <div className="rounded-2xl border-2 border-primary bg-surface-raised px-8 py-6 text-center shadow-inner">
                <span className="font-mono text-5xl font-black tracking-widest text-primary sm:text-6xl">
                  {activeSession.current_totp_code || '------'}
                </span>
              </div>

              {/* Countdown Indicator */}
              <div className="mt-4 flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <span className="font-mono text-xs font-semibold text-text">
                  Rotates in: <span className="text-primary">{totpCountdown}s</span>
                </span>
              </div>
              <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-pill bg-surface-raised">
                <div
                  className="h-full bg-primary transition-all duration-1000 ease-linear"
                  style={{ width: `${(totpCountdown / 30) * 100}%` }}
                />
              </div>

              {/* Verified Count Banner */}
              <div className="mt-8 w-full rounded-lg bg-surface-raised p-4 text-center">
                <div className="flex items-center justify-center gap-2 text-success font-semibold text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Verified Attendees: {activeSession.verified_count ?? 0}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="my-16 text-center text-xs text-text-muted">
              No attendance session selected. Create or select a session from the right.
            </div>
          )}
        </div>

        {/* Sessions List (7 Cols) */}
        <div className="space-y-4 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="font-display text-base font-bold text-text">
              Configured Attendance Sessions
            </h3>
            <span className="rounded-pill bg-surface-raised px-2.5 py-0.5 text-xs font-semibold text-text-muted">
              {sessions.length} sessions
            </span>
          </div>

          {loading ? (
            <div className="py-12 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="mt-2 text-xs font-medium text-text-muted">Fetching sessions...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface p-8 text-center">
              <CalendarCheck2 className="mx-auto h-10 w-10 text-text-muted opacity-40" />
              <h4 className="mt-2 font-display text-sm font-semibold text-text">
                No Attendance Sessions Created
              </h4>
              <p className="mt-1 text-xs text-text-muted">
                Create an attendance session to allow check-in via QR, TOTP, or manual entry.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => {
                const isCurrentActive = activeSession?.id === session.id;

                return (
                  <div
                    key={session.id}
                    className={`rounded-xl border p-5 shadow-sm transition-all ${
                      isCurrentActive
                        ? 'border-primary bg-primary/[0.02] shadow-md'
                        : 'border-border bg-surface hover:border-primary/40'
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-pill bg-surface-raised px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-text-muted">
                            Audience: {session.audience}
                          </span>
                          {session.is_open ? (
                            <span className="inline-flex items-center gap-1 rounded-pill bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                              <span className="h-1.5 w-1.5 rounded-full bg-success" />
                              <span>OPEN</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-pill bg-surface-raised px-2 py-0.5 text-[11px] font-semibold text-text-muted">
                              <span>CLOSED</span>
                            </span>
                          )}
                        </div>
                        <h4 className="mt-1 font-display text-base font-bold text-text">
                          {session.name}
                        </h4>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void apiClient
                              .get<{ data: AttendanceSession }>(`/attendance/sessions/${session.id}`)
                              .then((res) => setActiveSession(res.data));
                          }}
                          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                            isCurrentActive
                              ? 'bg-primary text-primary-foreground'
                              : 'border border-border bg-surface text-text hover:bg-surface-raised'
                          }`}
                        >
                          Display Podium
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleToggleSession(session.id)}
                          disabled={actionLoading === session.id}
                          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold shadow-sm ${
                            session.is_open
                              ? 'border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20'
                              : 'bg-success text-white hover:opacity-90'
                          } disabled:opacity-50`}
                        >
                          {session.is_open ? (
                            <>
                              <Pause className="h-3.5 w-3.5" />
                              <span>Close</span>
                            </>
                          ) : (
                            <>
                              <Play className="h-3.5 w-3.5" />
                              <span>Open</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between border-t border-border pt-3 text-xs text-text-muted">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          <span>
                            {new Date(session.starts_at).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            -{' '}
                            {new Date(session.ends_at).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </span>
                      </div>
                      <span className="font-semibold text-text">
                        {session.verified_count ?? 0} Verified Check-ins
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create Session Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-2xl">
            <h3 className="font-display text-lg font-bold text-text">
              Create Attendance Session
            </h3>
            <p className="mt-1 text-xs text-text-muted">
              Configure a check-in period for this event with target audience restrictions.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted">Session Name</label>
                <input
                  type="text"
                  placeholder="e.g. Morning Keynote & Track 1 Check-In"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-surface p-2 text-xs text-text focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted">Eligible Audience</label>
                <select
                  value={sessionAudience}
                  onChange={(e) => setSessionAudience(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-surface p-2 text-xs text-text focus:border-primary focus:outline-none"
                >
                  <option value={AttendanceAudience.ALL}>All Attendees & Core</option>
                  <option value={AttendanceAudience.PARTICIPANTS}>Registered Event Participants Only</option>
                  <option value={AttendanceAudience.VOLUNTEERS}>Volunteers & Committee Only</option>
                  <option value={AttendanceAudience.CORE}>Core Committee Only</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-text-muted">Starts At</label>
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-surface p-2 text-xs text-text focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted">Ends At</label>
                  <input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-surface p-2 text-xs text-text focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-md border border-border px-4 py-2 text-xs font-medium text-text hover:bg-surface-raised"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreateSession()}
                disabled={actionLoading === 'create'}
                className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {actionLoading === 'create' ? 'Creating...' : 'Create Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
