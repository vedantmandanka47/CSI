'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import { MemberDashboardData } from '@csi/shared';
import {
  User,
  Calendar,
  CheckCircle2,
  Clock,
  QrCode,
  ArrowRight,
  Sparkles,
  AlertCircle,
  Activity,
  Award,
  Layers,
  MapPin,
  CalendarCheck2,
} from 'lucide-react';

export default function MemberDashboardPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [dashboard, setDashboard] = useState<MemberDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await apiClient.get<MemberDashboardData>('/me/dashboard');
      setDashboard(response);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to retrieve member dashboard data.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      void fetchDashboard();
    }
  }, [isAuthenticated, fetchDashboard]);

  if (authLoading) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center px-4 py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-text-muted">Loading member portal...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl flex-col items-center justify-center px-4 py-12 text-center">
        <div className="rounded-full bg-surface-raised p-4 ring-8 ring-surface-raised/50">
          <User className="h-10 w-10 text-primary" />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-text">
          Member Authentication Required
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Please sign in to access your student branch dashboard, event registrations, and attendance metrics.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="rounded-md border border-border bg-surface px-5 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-raised"
          >
            Apply for Membership
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 border-b border-border pb-6 sm:flex-row sm:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-pill bg-surface-raised px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Member Self-Service Portal</span>
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
            Welcome, {user.full_name}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Track your verified event attendance, registered workshops, and chapter milestones.
          </p>
        </div>

        <Link
          href="/id-card"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
        >
          <QrCode className="h-4 w-4" />
          <span>View Digital ID Pass</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div className="my-16 flex flex-col items-center justify-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-text-muted">Loading your membership analytics...</p>
        </div>
      )}

      {!loading && errorMessage && (
        <div className="my-8 flex items-center gap-3 rounded-lg border border-danger/20 bg-danger/5 p-6 text-danger">
          <AlertCircle className="h-6 w-6 flex-shrink-0" />
          <p className="text-sm font-medium">{errorMessage}</p>
        </div>
      )}

      {!loading && dashboard && (
        <div className="mt-8 space-y-8">
          {/* Member Profile & Metric Cards */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Profile Overview Card */}
            <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-raised text-primary">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-text">{dashboard.profile.name}</h3>
                  <p className="font-mono text-xs font-medium text-primary">
                    {dashboard.profile.enrollment_no || 'GCET-MEMBER'}
                  </p>
                </div>
              </div>
              <div className="mt-4 border-t border-border pt-3 text-xs text-text-muted">
                <div className="flex justify-between py-0.5">
                  <span>Branch:</span>
                  <span className="font-semibold text-text">{dashboard.profile.branch || 'General'}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span>Year:</span>
                  <span className="font-semibold text-text">Year {dashboard.profile.year || 1}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span>Standing:</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-success">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>{dashboard.profile.status.toUpperCase()}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Attendance Percentage Metric */}
            <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-muted">Attendance Rate</span>
                <div className="rounded-md bg-primary/10 p-2 text-primary">
                  <CalendarCheck2 className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-display text-3xl font-bold tracking-tight text-text">
                  {dashboard.statistics.attendance_percentage}%
                </span>
                <span className="text-xs font-medium text-text-muted">verified</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-pill bg-surface-raised">
                <div
                  className="h-full bg-primary transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(100, dashboard.statistics.attendance_percentage)}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-text-muted">
                {dashboard.statistics.attended_events_count} attended of{' '}
                {dashboard.statistics.total_registered_events} registered
              </p>
            </div>

            {/* Total Events Metric */}
            <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-muted">Event Registrations</span>
                <div className="rounded-md bg-surface-raised p-2 text-primary">
                  <Layers className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="font-display text-3xl font-bold tracking-tight text-text">
                  {dashboard.statistics.total_registered_events}
                </span>
              </div>
              <p className="mt-4 text-[11px] text-text-muted">
                Workshops, hackathons, and guest lectures
              </p>
            </div>

            {/* Credentials / Certificates Metric */}
            <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-muted">Verifiable Credentials</span>
                <div className="rounded-md bg-highlight/20 p-2 text-warning">
                  <Award className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="font-display text-3xl font-bold tracking-tight text-text">
                  {dashboard.statistics.certificates_count}
                </span>
              </div>
              <p className="mt-4 text-[11px] text-text-muted">
                Issued post-attendance (Phase 3 automated issuance)
              </p>
            </div>
          </div>

          {/* Main Grid: Upcoming Registrations vs Activity Timeline */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* Upcoming & Past Events (8 Cols) */}
            <div className="space-y-8 lg:col-span-8">
              {/* Upcoming Registered Events */}
              <div className="rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    <h2 className="font-display text-lg font-bold text-text">
                      Upcoming Registered Events
                    </h2>
                  </div>
                  <span className="rounded-pill bg-surface-raised px-2.5 py-0.5 text-xs font-semibold text-text-muted">
                    {dashboard.upcoming_events.length}
                  </span>
                </div>

                <div className="mt-6">
                  {dashboard.upcoming_events.length === 0 ? (
                    <div className="rounded-lg bg-surface-raised p-8 text-center">
                      <Calendar className="mx-auto h-10 w-10 text-text-muted opacity-40" />
                      <h4 className="mt-2 font-display text-sm font-semibold text-text">
                        No Upcoming Event Registrations
                      </h4>
                      <p className="mt-1 text-xs text-text-muted">
                        Explore upcoming CSI GCET workshops, seminars, and technical competitions.
                      </p>
                      <Link
                        href="/events"
                        className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                      >
                        <span>Browse Events</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {dashboard.upcoming_events.map((evt) => (
                        <div
                          key={evt.registration_id}
                          className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-surface-raised/40 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="rounded-pill bg-primary/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-primary">
                                {evt.category}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Confirmed</span>
                              </span>
                            </div>
                            <h3 className="mt-1 font-display text-base font-bold text-text">
                              {evt.title}
                            </h3>
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-muted">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                <span>
                                  {new Date(evt.starts_at).toLocaleDateString('en-IN', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </span>
                              {evt.venue_name && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5" />
                                  <span>{evt.venue_name}</span>
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Link
                              href={`/events/${evt.slug}`}
                              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-raised"
                            >
                              Event Details
                            </Link>
                            <a
                              href={`/api/events/${evt.event_id}/ics`}
                              className="rounded-md bg-surface-raised px-3 py-1.5 text-xs font-medium text-primary hover:bg-border"
                            >
                              Add to Calendar
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Past Event History */}
              <div className="rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div className="flex items-center gap-2">
                    <CalendarCheck2 className="h-5 w-5 text-primary" />
                    <h2 className="font-display text-lg font-bold text-text">
                      Past Participation & Attendance
                    </h2>
                  </div>
                  <span className="rounded-pill bg-surface-raised px-2.5 py-0.5 text-xs font-semibold text-text-muted">
                    {dashboard.past_registrations.length}
                  </span>
                </div>

                <div className="mt-6">
                  {dashboard.past_registrations.length === 0 ? (
                    <p className="text-center text-xs text-text-muted py-6">
                      No past event history recorded yet.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-border bg-surface-raised font-mono text-[11px] uppercase tracking-wider text-text-muted">
                          <tr>
                            <th className="px-4 py-2.5">Event</th>
                            <th className="px-4 py-2.5">Event Date</th>
                            <th className="px-4 py-2.5">Registered On</th>
                            <th className="px-4 py-2.5 text-right">Attendance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {dashboard.past_registrations.map((past) => (
                            <tr key={past.registration_id} className="hover:bg-surface-raised/40">
                              <td className="px-4 py-3 font-semibold text-text">
                                <Link
                                  href={`/events/${past.slug}`}
                                  className="transition-colors hover:text-primary"
                                >
                                  {past.title}
                                </Link>
                              </td>
                              <td className="px-4 py-3 text-text-muted">
                                {new Date(past.starts_at).toLocaleDateString('en-IN', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </td>
                              <td className="px-4 py-3 text-text-muted">
                                {new Date(past.registered_at).toLocaleDateString('en-IN', {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {past.attendance_status === 'attended' ? (
                                  <span className="inline-flex items-center gap-1 rounded-pill bg-success/10 px-2.5 py-0.5 text-[11px] font-semibold text-success">
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span>Attended</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-pill bg-surface-raised px-2.5 py-0.5 text-[11px] font-semibold text-text-muted">
                                    <span>Absent</span>
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar: Activity Timeline & Pass Card (4 Cols) */}
            <div className="space-y-6 lg:col-span-4">
              {/* Digital Pass Quick Card */}
              <div className="rounded-xl border-2 border-primary/20 bg-surface p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-primary/10 p-2 text-primary">
                    <QrCode className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-bold text-text">
                      Cryptographic Pass
                    </h3>
                    <p className="text-[11px] text-text-muted">60s Rotating HMAC Pass</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-text-muted">
                  Present your digital pass at event entrance desks and workshops for verified 1-second check-in.
                </p>
                <Link
                  href="/id-card"
                  className="mt-4 block w-full rounded-md bg-primary py-2 text-center text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                >
                  Open Live Pass
                </Link>
              </div>

              {/* Recent Activity Timeline */}
              <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
                <div className="flex items-center gap-2 border-b border-border pb-3">
                  <Activity className="h-4 w-4 text-primary" />
                  <h3 className="font-display text-sm font-bold text-text">
                    Recent Activity Timeline
                  </h3>
                </div>

                <div className="mt-4 space-y-4">
                  {dashboard.recent_activity.map((item) => (
                    <div key={item.id} className="relative pl-6">
                      <div className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-primary" />
                      <p className="text-xs font-semibold text-text">{item.title}</p>
                      <p className="mt-0.5 text-[11px] text-text-muted">{item.description}</p>
                      <span className="mt-1 block font-mono text-[10px] text-text-muted">
                        {new Date(item.timestamp).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
