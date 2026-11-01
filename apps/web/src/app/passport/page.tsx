'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import { StudentPassportResponse } from '@csi/shared';
import {
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Layers,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  User,
  ExternalLink,
} from 'lucide-react';

export default function StudentPassportPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [passport, setPassport] = useState<StudentPassportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const fetchPassport = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await apiClient.get<StudentPassportResponse>('/me/passport');
      setPassport(response);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to retrieve your activity passport.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      void fetchPassport();
    }
  }, [isAuthenticated, fetchPassport]);

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      // CSRF token retrieval from cookie
      let csrfToken = '';
      if (typeof document !== 'undefined') {
        const match = document.cookie.match(/(^|;)\s*csi_csrf=([^;]+)/);
        if (match && match[2]) {
          csrfToken = decodeURIComponent(match[2]);
        }
      }

      const res = await fetch('/api/me/passport/export', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'x-csrf-token': csrfToken,
        },
      });

      if (!res.ok) {
        throw new Error('Export failed with status ' + res.status);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = (passport?.student.name || 'student').replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = `passport-${safeName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      setErrorMessage('Failed to export your activity dossier PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  if (authLoading) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center px-4 py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-text-muted">Loading your activity passport...</p>
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
          Please sign in to view your verified student activity passport and extracurricular dossier.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-on-primary shadow-sm transition-opacity hover:opacity-90"
          >
            Sign In
          </Link>
        </div>
      </main>
    );
  }

  const activities = passport?.activities || [];
  const filteredActivities =
    selectedCategory === 'all'
      ? activities
      : activities.filter((act) => act.category === selectedCategory || act.type === selectedCategory);

  return (
    <main className="min-h-screen bg-bg py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Error Alert */}
        {errorMessage && (
          <div className="flex items-center gap-3 rounded-lg border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p>{errorMessage}</p>
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary/10 px-3 py-1 font-mono text-xs font-semibold text-primary">
                Official Credential Ledger
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                <ShieldCheck className="h-3.5 w-3.5" />
                Tamper Evident
              </span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
              Student Activity Passport
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Consolidated, verifiable record of your CSI GCET extracurricular contributions, workshops, and leadership.
            </p>
          </div>

          <button
            onClick={handleExportPdf}
            disabled={exporting || loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {exporting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-on-primary border-t-transparent" />
                <span>Generating Dossier...</span>
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                <span>Export Dossier (PDF)</span>
              </>
            )}
          </button>
        </div>

        {/* Student Identity Card */}
        {passport && (
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-text">{passport.student.name}</h2>
                  <p className="text-xs text-text-muted">
                    {passport.student.branch || 'Engineering & Technology'} •{' '}
                    {passport.student.year ? `Year ${passport.student.year}` : 'Student Member'}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-text-muted">
                    Enrollment: {passport.student.enrollmentNo || 'Institutional ID Verified'}
                  </p>
                </div>
              </div>

              {passport.latestPassport && (
                <div className="rounded-lg border border-border bg-surface-raised p-3 text-right text-xs">
                  <span className="font-semibold text-text">Latest Verified Dossier:</span>
                  <p className="font-mono text-primary font-bold">{passport.latestPassport.passportNumber}</p>
                  <p className="text-text-muted">
                    Generated: {new Date(passport.latestPassport.generatedAt).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>

            {/* Metrics Grid */}
            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-6 sm:grid-cols-4">
              <div className="rounded-lg bg-surface-raised p-3 text-center">
                <div className="text-2xl font-bold text-primary">{passport.summary.eventsAttended}</div>
                <div className="text-xs text-text-muted mt-1">Verified Attendances</div>
              </div>
              <div className="rounded-lg bg-surface-raised p-3 text-center">
                <div className="text-2xl font-bold text-primary">{passport.summary.certificatesEarned}</div>
                <div className="text-xs text-text-muted mt-1">Credentials Earned</div>
              </div>
              <div className="rounded-lg bg-surface-raised p-3 text-center">
                <div className="text-2xl font-bold text-primary">{passport.summary.committeeTenures}</div>
                <div className="text-xs text-text-muted mt-1">Committee Tenures</div>
              </div>
              <div className="rounded-lg bg-surface-raised p-3 text-center">
                <div className="text-2xl font-bold text-primary">{passport.summary.totalActivities}</div>
                <div className="text-xs text-text-muted mt-1">Total Activities</div>
              </div>
            </div>
          </div>
        )}

        {/* Category Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4">
          {[
            { id: 'all', label: 'All Activities' },
            { id: 'event_attendance', label: 'Workshops & Events' },
            { id: 'certificate', label: 'Credentials & Certificates' },
            { id: 'leadership', label: 'Leadership & Committee' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'bg-surface-raised text-text-muted hover:bg-border hover:text-text'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Loading Skeleton */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-surface" />
            ))}
          </div>
        )}

        {/* Activity List */}
        {!loading && filteredActivities.length > 0 && (
          <div className="space-y-3">
            {filteredActivities.map((act) => (
              <div
                key={act.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-primary">
                    {act.type === 'certificate' ? (
                      <Award className="h-4 w-4" />
                    ) : act.type === 'committee_role' ? (
                      <Layers className="h-4 w-4" />
                    ) : (
                      <Calendar className="h-4 w-4" />
                    )}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-text">{act.title}</h3>
                      <span className="inline-flex items-center gap-1 rounded bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                        <CheckCircle2 className="h-3 w-3" />
                        Verified
                      </span>
                    </div>

                    <p className="mt-0.5 text-xs text-text-muted">{act.details}</p>

                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {act.date}
                      </span>
                      {act.certificateNumber && (
                        <span className="font-mono">Ref: {act.certificateNumber}</span>
                      )}
                    </div>
                  </div>
                </div>

                {act.type === 'certificate' && act.certificateFileAvailable && (
                  <Link
                    href={`/verify`}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-primary hover:bg-border transition-colors"
                  >
                    <span>Verification Portal</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredActivities.length === 0 && (
          <div className="rounded-xl border border-border bg-surface p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-raised text-text-muted">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-display text-lg font-bold text-text">No Verified Activities Recorded</h3>
            <p className="mt-2 text-sm text-text-muted max-w-md mx-auto">
              Participate in upcoming branch workshops, competitions, and committee initiatives to automatically build
              your verified extracurricular dossier.
            </p>
            <div className="mt-6">
              <Link
                href="/events"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm hover:opacity-90 transition-opacity"
              >
                Browse Upcoming Events
              </Link>
            </div>
          </div>
        )}

        {/* Anti-Forgery Explainer Banner */}
        <div className="rounded-xl border border-border bg-surface-raised p-4 text-xs text-text-muted">
          <div className="flex items-center gap-2 font-semibold text-text">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span>Cryptographic Anti-Forgery & Verification Architecture</span>
          </div>
          <p className="mt-1">
            Every exported activity dossier is cryptographically hashed with SHA-256 and assigned an 80-bit entropy
            verification reference. Academic counselors, placement recruiters, and admissions officers can verify genuine
            issuance at any time via the CSI GCET verification ledger.
          </p>
        </div>
      </div>
    </main>
  );
}
