'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { apiClient, ApiError } from '@/lib/api-client';

interface PublicVerificationResponse {
  status: 'valid' | 'revoked' | 'integrity_mismatch' | 'not_found' | 'invalid';
  isAuthentic: boolean;
  credentialType?: 'certificate' | 'passport';
  certificateNumber?: string;
  certificateType?: string;
  passportNumber?: string;
  studentName?: string;
  recipientName?: string;
  eventName?: string;
  issueDate?: string;
  issuedAt?: string;
  generatedAt?: string;
  issuingInstitution?: string;
  summaryCounts?: {
    eventsAttended: number;
    certificatesEarned: number;
    committeeTenures: number;
    totalActivities?: number;
  };
  revokedAt?: string;
  revocationReason?: string;
  message?: string;
}

export default function CertificateVerificationPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const unwrappedParams = use(params);
  const rawCode = unwrappedParams.code;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PublicVerificationResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function performVerification() {
      setLoading(true);
      setErrorMsg(null);

      try {
        let result = await apiClient.get<PublicVerificationResponse>(
          `/verify/${encodeURIComponent(rawCode)}`,
        );

        if (result.status === 'not_found') {
          try {
            const passportResult = await apiClient.get<PublicVerificationResponse>(
              `/passports/verify/${encodeURIComponent(rawCode)}`,
            );
            if (passportResult.status !== 'not_found') {
              result = passportResult;
            }
          } catch {
            // Keep certificate not_found
          }
        }

        if (isMounted) {
          setData(result);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        if (err instanceof ApiError && err.status === 429) {
          setErrorMsg(
            'Rate limit exceeded. Too many verification requests from your connection. Please wait a moment before trying again.',
          );
        } else {
          setErrorMsg(
            'Unable to connect to the verification ledger. Please check your network connection and try again.',
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    if (rawCode) {
      performVerification();
    } else {
      setLoading(false);
      setData({
        status: 'invalid',
        isAuthentic: false,
        message: 'No verification code provided in URL.',
      });
    }

    return () => {
      isMounted = false;
    };
  }, [rawCode]);

  return (
    <div className="min-h-screen bg-bg py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Navigation */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/verify"
            className="text-sm font-medium text-text-muted hover:text-primary transition-colors inline-flex items-center gap-1.5"
          >
            &larr; Verify Another Code
          </Link>
          <span className="font-mono text-xs uppercase px-2.5 py-1 bg-surface border border-border rounded text-text-muted">
            Code: {rawCode}
          </span>
        </div>

        {/* State 1: Loading State */}
        {loading && (
          <div className="bg-surface border border-border rounded-lg p-10 shadow-sm text-center">
            <div className="w-12 h-12 border-3 border-border border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <h1 className="text-xl font-display font-semibold text-text mb-2">
              Cryptographic Ledger Lookup
            </h1>
            <p className="text-sm text-text-muted max-w-md mx-auto">
              Verifying certificate authenticity against the CSI GCET immutable institutional ledger...
            </p>
          </div>
        )}

        {/* State 2: Rate Limit / Network Error */}
        {!loading && errorMsg && (
          <div className="bg-surface border border-border rounded-lg p-8 shadow-sm text-center">
            <div className="w-14 h-14 rounded-full bg-surface-raised border border-border flex items-center justify-center mx-auto mb-4 text-warning">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h1 className="text-xl font-display font-bold text-text mb-2">
              Verification Unavailable
            </h1>
            <p className="text-sm text-text-muted mb-6 max-w-md mx-auto">{errorMsg}</p>
            <Link
              href="/verify"
              className="inline-flex py-2.5 px-4 bg-primary text-primary-foreground text-sm font-semibold rounded-md shadow hover:opacity-95 transition-opacity"
            >
              Return to Verification Portal
            </Link>
          </div>
        )}

        {/* State 3: Valid and Authentic Certificate or Passport */}
        {!loading && !errorMsg && data?.status === 'valid' && (
          <div className="bg-surface border border-border rounded-lg shadow-sm overflow-hidden">
            {/* Authentic Header Banner */}
            <div className="bg-surface-raised border-b border-border px-6 py-6 text-center">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-pill bg-surface border border-border text-success font-semibold text-xs tracking-wider uppercase mb-3 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-success" />
                Officially Verified & Authentic
              </div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-text">
                {data.credentialType === 'passport' || data.passportNumber
                  ? 'Student Activity Passport & Dossier'
                  : `CSI GCET Certificate of ${data.certificateType?.toUpperCase()}`}
              </h1>
              <p className="text-xs text-text-muted mt-1">
                Issued by {data.issuingInstitution || 'Computer Society of India - GCET Student Branch'}
              </p>
            </div>

            {/* Details Grid */}
            <div className="p-6 sm:p-8 space-y-6">
              <div className="border border-border rounded-md p-5 bg-surface-raised/40">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs font-semibold text-text-muted uppercase tracking-wider block">
                      Recipient / Student
                    </span>
                    <span className="text-lg font-bold text-text block mt-0.5">
                      {data.studentName || data.recipientName}
                    </span>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-text-muted uppercase tracking-wider block">
                      {data.credentialType === 'passport' || data.passportNumber ? 'Credential Type' : 'Event / Activity'}
                    </span>
                    <span className="text-base font-semibold text-text block mt-0.5">
                      {data.credentialType === 'passport' || data.passportNumber
                        ? 'Official Extracurricular Dossier'
                        : data.eventName}
                    </span>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-text-muted uppercase tracking-wider block">
                      {data.credentialType === 'passport' || data.passportNumber ? 'Generation Date' : 'Issue Date'}
                    </span>
                    <span className="text-sm font-medium text-text block mt-0.5">
                      {data.generatedAt ? new Date(data.generatedAt).toLocaleDateString() : data.issueDate}
                    </span>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-text-muted uppercase tracking-wider block">
                      {data.credentialType === 'passport' || data.passportNumber ? 'Passport Reference' : 'Certificate Serial'}
                    </span>
                    <span className="text-sm font-mono font-medium text-text block mt-0.5">
                      {data.passportNumber || data.certificateNumber}
                    </span>
                  </div>
                </div>

                {/* Passport Summary Counts if present */}
                {data.summaryCounts && (
                  <div className="mt-4 pt-4 border-t border-border grid grid-cols-3 gap-2 text-center">
                    <div className="bg-surface p-2 rounded border border-border">
                      <div className="text-base font-bold text-primary">{data.summaryCounts.eventsAttended}</div>
                      <div className="text-[11px] text-text-muted">Events Attended</div>
                    </div>
                    <div className="bg-surface p-2 rounded border border-border">
                      <div className="text-base font-bold text-primary">{data.summaryCounts.certificatesEarned}</div>
                      <div className="text-[11px] text-text-muted">Credentials Earned</div>
                    </div>
                    <div className="bg-surface p-2 rounded border border-border">
                      <div className="text-base font-bold text-primary">{data.summaryCounts.committeeTenures}</div>
                      <div className="text-[11px] text-text-muted">Committee Tenures</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Cryptographic Security Details */}
              <div className="border-t border-border pt-4">
                <h2 className="text-xs font-semibold text-text uppercase tracking-wider mb-2">
                  Cryptographic Integrity Verification
                </h2>
                <ul className="text-xs text-text-muted space-y-1.5 list-disc list-inside">
                  <li>
                    Verification code satisfies 80-bit entropy Crockford Base32 anti-collision standards.
                  </li>
                  <li>
                    Document hash verified against institutional SHA-256 issuance ledger.
                  </li>
                  <li>
                    Current status verified live from GCET branch database.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* State 4: Revoked Certificate */}
        {!loading && !errorMsg && data?.status === 'revoked' && (
          <div className="bg-surface border border-border rounded-lg shadow-sm overflow-hidden">
            <div className="bg-surface-raised border-b border-border px-6 py-6 text-center">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-pill bg-surface border border-border text-danger font-semibold text-xs tracking-wider uppercase mb-3 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-danger" />
                Certificate Revoked
              </div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-text">
                Revocation Notice
              </h1>
              <p className="text-xs text-text-muted mt-1">
                This certificate is no longer valid for any academic, professional, or institutional claims.
              </p>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
              <div className="border border-border rounded-md p-5 bg-surface-raised/40">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs font-semibold text-text-muted uppercase tracking-wider block">
                      Issued Recipient
                    </span>
                    <span className="text-base font-semibold text-text block mt-0.5">
                      {data.recipientName}
                    </span>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-text-muted uppercase tracking-wider block">
                      Event / Activity
                    </span>
                    <span className="text-base font-semibold text-text block mt-0.5">
                      {data.eventName}
                    </span>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-text-muted uppercase tracking-wider block">
                      Revocation Timestamp
                    </span>
                    <span className="text-sm font-medium text-text block mt-0.5">
                      {data.revokedAt ? new Date(data.revokedAt).toLocaleString() : 'N/A'}
                    </span>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-text-muted uppercase tracking-wider block">
                      Certificate Serial
                    </span>
                    <span className="text-sm font-mono font-medium text-text block mt-0.5">
                      {data.certificateNumber}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-border">
                  <span className="text-xs font-semibold text-danger uppercase tracking-wider block">
                    Public Revocation Reason
                  </span>
                  <p className="text-sm text-text mt-1 leading-relaxed">
                    {data.revocationReason || 'Revoked by institutional branch administrator.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* State 5: Integrity Mismatch / Tampered */}
        {!loading && !errorMsg && data?.status === 'integrity_mismatch' && (
          <div className="bg-surface border border-border rounded-lg p-8 shadow-sm text-center">
            <div className="w-14 h-14 rounded-full bg-surface-raised border border-border flex items-center justify-center mx-auto mb-4 text-danger">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-display font-bold text-text mb-2">
              Document Integrity Failure
            </h1>
            <p className="text-sm text-text-muted mb-6 max-w-md mx-auto">
              {data.message ||
                'The digital checksum of this certificate does not match the official issuance record. The document has been modified, tampered with, or corrupted.'}
            </p>
            <Link
              href="/verify"
              className="inline-flex py-2.5 px-4 bg-primary text-primary-foreground text-sm font-semibold rounded-md shadow hover:opacity-95 transition-opacity"
            >
              Verify Another Document
            </Link>
          </div>
        )}

        {/* State 6: Not Found / Invalid Format */}
        {!loading && !errorMsg && (data?.status === 'not_found' || data?.status === 'invalid') && (
          <div className="bg-surface border border-border rounded-lg p-8 shadow-sm text-center">
            <div className="w-14 h-14 rounded-full bg-surface-raised border border-border flex items-center justify-center mx-auto mb-4 text-warning">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-display font-bold text-text mb-2">
              {data.status === 'invalid'
                ? 'Invalid Verification Code'
                : 'Certificate Record Not Found'}
            </h1>
            <p className="text-sm text-text-muted mb-6 max-w-md mx-auto">
              {data.message ||
                'No issued certificate matches the provided verification code in the official CSI GCET registry.'}
            </p>
            <Link
              href="/verify"
              className="inline-flex py-2.5 px-4 bg-primary text-primary-foreground text-sm font-semibold rounded-md shadow hover:opacity-95 transition-opacity"
            >
              Try Another Verification Code
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
