'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function VerifyIndexPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleaned = code.trim().replace(/[\s\-_.]/g, '');
    if (!cleaned) {
      setError('Please enter a certificate verification code.');
      return;
    }

    if (cleaned.length !== 16) {
      setError('A valid verification code consists of exactly 16 characters (or 4 blocks of 4).');
      return;
    }

    router.push(`/verify/${encodeURIComponent(code.trim())}`);
  };

  return (
    <div className="min-h-screen bg-bg py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Breadcrumb / Return */}
        <div className="mb-6">
          <Link
            href="/"
            className="text-sm font-medium text-text-muted hover:text-primary transition-colors inline-flex items-center gap-1.5"
          >
            &larr; Back to Home
          </Link>
        </div>

        {/* Header Block */}
        <div className="bg-surface border border-border rounded-lg p-8 shadow-sm mb-8 text-center">
          <div className="w-16 h-16 rounded-full bg-surface-raised border border-border flex items-center justify-center mx-auto mb-4 text-primary">
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-text mb-2">
            Public Certificate Verification
          </h1>
          <p className="text-sm sm:text-base text-text-muted max-w-lg mx-auto">
            Verify the authenticity and integrity of certificates issued by the Computer Society
            of India (CSI) GCET Student Branch.
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-8 max-w-md mx-auto text-left">
            <label
              htmlFor="verification-code-input"
              className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-2"
            >
              Enter 16-Character Verification Code
            </label>
            <div className="relative">
              <input
                id="verification-code-input"
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  if (error) setError(null);
                }}
                placeholder="e.g. 4F7A-9B2K-M8NQ-W3R5"
                className="w-full px-4 py-3 bg-surface border border-border rounded-md font-mono text-center text-lg tracking-widest text-text placeholder:text-text-muted/40 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all uppercase"
                autoComplete="off"
                spellCheck="false"
              />
            </div>

            {error && (
              <p className="mt-2 text-sm text-danger font-medium text-center">{error}</p>
            )}

            <button
              type="submit"
              className="mt-4 w-full py-3 px-4 bg-primary text-primary-foreground font-semibold rounded-md shadow hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              Verify Certificate
            </button>
          </form>
        </div>

        {/* Anti-Forgery Explanatory Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-surface border border-border rounded-md p-4 text-center">
            <div className="w-10 h-10 rounded-full bg-surface-raised flex items-center justify-center mx-auto mb-2 text-primary font-bold">
              80b
            </div>
            <h2 className="text-sm font-semibold text-text mb-1">High-Entropy Ledger</h2>
            <p className="text-xs text-text-muted leading-relaxed">
              Crockford Base32 cryptographic random codes protect against brute-force enumeration.
            </p>
          </div>

          <div className="bg-surface border border-border rounded-md p-4 text-center">
            <div className="w-10 h-10 rounded-full bg-surface-raised flex items-center justify-center mx-auto mb-2 text-primary font-bold">
              SHA
            </div>
            <h2 className="text-sm font-semibold text-text mb-1">Tamper-Evident Binding</h2>
            <p className="text-xs text-text-muted leading-relaxed">
              Every document is verified against institutional SHA-256 cryptographic checksums.
            </p>
          </div>

          <div className="bg-surface border border-border rounded-md p-4 text-center">
            <div className="w-10 h-10 rounded-full bg-surface-raised flex items-center justify-center mx-auto mb-2 text-primary font-bold">
              REV
            </div>
            <h2 className="text-sm font-semibold text-text mb-1">Revocation Transparency</h2>
            <p className="text-xs text-text-muted leading-relaxed">
              Real-time status checks immediately reflect administrative revocations and reasons.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
