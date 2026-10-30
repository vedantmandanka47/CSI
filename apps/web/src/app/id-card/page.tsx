'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import QRCode from 'qrcode';
import { useAuth } from '@/components/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import { IdCardData } from '@csi/shared';
import {
  ShieldCheck,
  RefreshCw,
  Clock,
  AlertCircle,
  CheckCircle2,
  Lock,
  User,
  GraduationCap,
  Calendar,
  Sparkles,
} from 'lucide-react';

export default function IdCardPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [cardData, setCardData] = useState<IdCardData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(60);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchCard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setErrorMessage(null);
    setErrorCode(null);

    try {
      const response = await apiClient.get<IdCardData>('/me/id-card');
      setCardData(response);
      setCountdown(60);

      // Generate dynamic QR Code Data URL
      if (response.qr_token) {
        const url = await QRCode.toDataURL(response.qr_token, {
          width: 260,
          margin: 1,
        });
        setQrDataUrl(url);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorCode(err.code);
        setErrorMessage(err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to retrieve your digital membership pass.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (isAuthenticated) {
      void fetchCard();
    }
  }, [isAuthenticated, fetchCard]);

  // 60-second rotating pass countdown timer
  useEffect(() => {
    if (!cardData) return;

    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          void fetchCard(true);
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [cardData, fetchCard]);

  if (authLoading) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl items-center justify-center px-4 py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-text-muted">Loading membership records...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl flex-col items-center justify-center px-4 py-12 text-center">
        <div className="rounded-full bg-surface-raised p-4 ring-8 ring-surface-raised/50">
          <Lock className="h-10 w-10 text-primary" />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-text">
          Member Authentication Required
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Access to the cryptographic CSI GCET digital membership pass is restricted to verified student branch members.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            Sign In to Account
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
    <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="flex flex-col items-start justify-between gap-4 border-b border-border pb-6 sm:flex-row sm:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-pill bg-surface-raised px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Digital Credential Pass</span>
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
            CSI GCET Membership Pass
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Live, verifiable cryptographic digital identity for Computer Society of India GCET Student Branch.
          </p>
        </div>

        {cardData && (
          <button
            type="button"
            onClick={() => void fetchCard(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-xs font-semibold text-text shadow-sm transition-colors hover:bg-surface-raised disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-primary' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Token'}</span>
          </button>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="my-16 flex flex-col items-center justify-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-text-muted">Issuing verifiable digital pass...</p>
        </div>
      )}

      {/* Error / Eligibility Banners */}
      {!loading && errorMessage && (
        <div className="my-8 rounded-lg border border-border bg-surface p-6 shadow-sm">
          {errorCode === 'ACCOUNT_PENDING_APPROVAL' ? (
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <div className="rounded-full bg-highlight/20 p-3 text-warning">
                <Clock className="h-8 w-8 text-warning" />
              </div>
              <div className="flex-1">
                <h2 className="font-display text-lg font-bold text-text">
                  Application Under Executive Review
                </h2>
                <p className="mt-1 text-sm text-text-muted">
                  Your student branch membership application has been received and is currently being cross-referenced against the GCET academic roster.
                </p>
                <div className="mt-3 flex items-center gap-2 text-xs font-medium text-warning">
                  <span>Application Status: PENDING REVIEW</span>
                  <span>•</span>
                  <span>Branch Counselor: CSI GCET SB</span>
                </div>
              </div>
            </div>
          ) : errorCode === 'ACCOUNT_DEACTIVATED' ? (
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <div className="rounded-full bg-danger/10 p-3 text-danger">
                <AlertCircle className="h-8 w-8 text-danger" />
              </div>
              <div className="flex-1">
                <h2 className="font-display text-lg font-bold text-text">
                  Membership Inactive
                </h2>
                <p className="mt-1 text-sm text-text-muted">
                  {errorMessage}
                </p>
                <div className="mt-3 flex items-center gap-2 text-xs font-medium text-danger">
                  <span>Status: INACTIVE OR GRADUATED</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-danger">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <p className="text-sm font-medium">{errorMessage}</p>
            </div>
          )}
        </div>
      )}

      {/* Digital Pass Card */}
      {!loading && cardData && (
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Card Presentation */}
          <div className="lg:col-span-7">
            <div className="relative overflow-hidden rounded-xl border-2 border-primary/20 bg-surface p-6 shadow-lg sm:p-8">
              {/* Header Badge */}
              <div className="flex items-center justify-between border-b border-border pb-5">
                <div className="flex items-center gap-3">
                  <div className="relative h-12 w-12 overflow-hidden rounded-md border border-border bg-surface p-1 shadow-sm">
                    <Image
                      src="/brand/csi-logo.png"
                      alt="CSI GCET"
                      width={48}
                      height={48}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div>
                    <span className="font-display text-sm font-bold tracking-tight text-primary sm:text-base">
                      COMPUTER SOCIETY OF INDIA
                    </span>
                    <p className="text-xs font-medium text-text-muted">
                      GCET Student Branch (Region 3)
                    </p>
                  </div>
                </div>

                <div className="inline-flex items-center gap-1.5 rounded-pill bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{cardData.status.toUpperCase()}</span>
                </div>
              </div>

              {/* Member Details */}
              <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-border bg-surface-raised text-primary">
                    <User className="h-8 w-8" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-bold tracking-tight text-text">
                      {cardData.name}
                    </h2>
                    <p className="font-mono text-sm font-semibold tracking-wider text-primary">
                      {cardData.enrollment_no || 'GCET-MEMBER'}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">{cardData.email}</p>
                  </div>
                </div>
              </div>

              {/* Meta Grid */}
              <div className="mt-6 grid grid-cols-2 gap-4 rounded-lg bg-surface-raised p-4 sm:grid-cols-3">
                <div>
                  <div className="flex items-center gap-1 text-xs text-text-muted">
                    <GraduationCap className="h-3.5 w-3.5" />
                    <span>Branch</span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-text">{cardData.branch}</p>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-xs text-text-muted">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Academic Year</span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-text">Year {cardData.year}</p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <div className="flex items-center gap-1 text-xs text-text-muted">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Valid Until</span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-text">
                    {new Date(cardData.valid_until).toLocaleDateString('en-IN', {
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </div>

              {/* Roles */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs text-text-muted">Assigned Roles:</span>
                {cardData.roles.map((role) => (
                  <span
                    key={role}
                    className="rounded-md border border-border bg-surface px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase text-text"
                  >
                    {role}
                  </span>
                ))}
              </div>

              {/* Verification Micro-text */}
              <div className="mt-6 border-t border-border pt-4 text-center">
                <p className="text-[11px] text-text-muted">
                  Official credential issued by CSI GCET Student Branch Executive Committee.
                </p>
              </div>
            </div>
          </div>

          {/* Dynamic Cryptographic QR Pass */}
          <div className="flex flex-col items-center justify-between rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8 lg:col-span-5">
            <div className="text-center">
              <div className="inline-flex items-center gap-1.5 rounded-pill bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>HMAC-SHA256 Signed Pass</span>
              </div>
              <h2 className="mt-3 font-display text-lg font-bold text-text">
                Live Verification Pass
              </h2>
              <p className="mt-1 text-xs text-text-muted">
                Scan at event entry, workshop desks, and student elections.
              </p>
            </div>

            {/* QR Code Container */}
            <div className="my-6 flex flex-col items-center">
              <div className="relative rounded-xl border-2 border-border bg-white p-3 shadow-inner">
                {qrDataUrl ? (
                  <Image
                    src={qrDataUrl}
                    alt="CSI GCET Member QR Pass"
                    width={224}
                    height={224}
                    unoptimized
                    className="h-56 w-56 object-contain"
                  />
                ) : (
                  <div className="flex h-56 w-56 items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  </div>
                )}
              </div>

              {/* Countdown Indicator */}
              <div className="mt-4 flex items-center gap-2">
                <div className="h-2 w-2 animate-ping rounded-full bg-success" />
                <span className="font-mono text-xs font-semibold text-text">
                  Pass rotates in: <span className="text-primary">{countdown}s</span>
                </span>
              </div>
              <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-pill bg-surface-raised">
                <div
                  className="h-full bg-primary transition-all duration-1000 ease-linear"
                  style={{ width: `${(countdown / 60) * 100}%` }}
                />
              </div>
            </div>

            {/* Security Notice */}
            <div className="w-full rounded-md bg-surface-raised p-3 text-center text-[11px] text-text-muted">
              Pass rotates every 60 seconds. Static screenshots will fail verification.
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
