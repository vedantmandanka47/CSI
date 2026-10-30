'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-context';
import { ApiError } from '@/lib/api-client';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      await login({ email, password });
      router.push('/');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to sign in. Please verify your credentials and network connection.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-surface p-8 shadow-sm">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="relative h-12 w-12 overflow-hidden rounded-md border border-border bg-surface p-1 shadow-sm mb-1">
            <Image
              src="/brand/csi-logo.png"
              alt="CSI GCET Logo"
              width={48}
              height={48}
              className="h-full w-full object-contain"
              priority
            />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-text">
            Member Portal Sign In
          </h1>
          <p className="text-xs text-text-muted max-w-xs leading-relaxed">
            Enter your registered GCET student credentials to access your membership dashboard and digital ID pass.
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger leading-relaxed"
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="block text-xs font-semibold text-text">
              Institutional Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. student@gcet.ac.in"
              className="block w-full rounded-md border border-border bg-surface px-3 py-2 text-xs text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-xs font-semibold text-text">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your account password"
              className="block w-full rounded-md border border-border bg-surface px-3 py-2 text-xs text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-primary py-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Authenticating with CSI GCET...' : 'Sign In to Member Portal'}
            </button>
          </div>
        </form>

        <div className="border-t border-border pt-4 text-center text-xs text-text-muted">
          New to the branch?{' '}
          <Link href="/register" className="font-semibold text-primary hover:underline">
            Register for Student Membership
          </Link>
        </div>
      </div>
    </div>
  );
}
