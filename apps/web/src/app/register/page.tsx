'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { apiClient, ApiError } from '@/lib/api-client';

export default function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [enrollmentNo, setEnrollmentNo] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);

  // Password requirements calculation
  const hasMinLength = password.length >= 10;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const isPasswordValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setFieldErrors(null);

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match');
      return;
    }

    if (!isPasswordValid) {
      setErrorMsg('Password does not satisfy all security requirements');
      return;
    }

    setSubmitting(true);

    try {
      const res = await apiClient.post<{
        message: string;
        verificationRequired: boolean;
        verificationToken?: string;
      }>('/auth/signup', {
        full_name: fullName,
        email,
        enrollment_no: enrollmentNo.trim() || undefined,
        phone: phone.trim() || undefined,
        password,
      });

      setIsSuccess(true);
      if (res.verificationToken) {
        setVerificationToken(res.verificationToken);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
        if (err.fields) {
          setFieldErrors(err.fields);
        }
      } else {
        setErrorMsg('Registration failed. Please check your network and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-surface p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-bold text-text">Registration Submitted</h1>
          <p className="text-xs leading-relaxed text-text-muted">
            Your CSI GCET student account has been created. Please verify your institutional email
            address to complete membership activation.
          </p>

          {verificationToken && (
            <div className="mt-4 rounded-lg border border-border bg-surface-raised p-4 text-left space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-muted block">
                Verification Token (Development &amp; Testing)
              </span>
              <p className="font-mono text-xs break-all text-primary bg-surface p-2 rounded border border-border/60">
                {verificationToken}
              </p>
              <div className="pt-2 text-center">
                <Link
                  href={`/verify-email?token=${verificationToken}`}
                  className="inline-block text-xs font-semibold text-primary underline hover:opacity-80"
                >
                  Verify Email Address Now
                </Link>
              </div>
            </div>
          )}

          <div className="pt-2">
            <Link
              href="/login"
              className="inline-block rounded-md bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              Proceed to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-xl space-y-6 rounded-xl border border-border bg-surface p-8 shadow-sm">
        {/* Header */}
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
            Join CSI GCET Student Branch
          </h1>
          <p className="text-xs text-text-muted max-w-sm leading-relaxed">
            Register your student membership to participate in workshops, technical symposiums, and collaborative committees.
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
          {/* Personal Information Group */}
          <div className="space-y-3">
            <div>
              <label htmlFor="fullName" className="block text-xs font-semibold text-text">
                Full Name (as per college ID)
              </label>
              <input
                id="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Vedant Patel"
                className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-xs text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {fieldErrors?.['full_name'] && (
                <p className="mt-1 text-xs text-danger">{fieldErrors['full_name'][0]}</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="email" className="block text-xs font-semibold text-text">
                  Institutional Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@gcet.ac.in"
                  className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-xs text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {fieldErrors?.['email'] && (
                  <p className="mt-1 text-xs text-danger">{fieldErrors['email'][0]}</p>
                )}
              </div>

              <div>
                <label htmlFor="enrollmentNo" className="block text-xs font-semibold text-text">
                  Enrollment Number <span className="text-text-muted font-normal">(Optional)</span>
                </label>
                <input
                  id="enrollmentNo"
                  type="text"
                  value={enrollmentNo}
                  onChange={(e) => setEnrollmentNo(e.target.value)}
                  placeholder="e.g. 210010116001"
                  className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-xs text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div>
              <label htmlFor="phone" className="block text-xs font-semibold text-text">
                Contact Phone <span className="text-text-muted font-normal">(Optional)</span>
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 9876543210"
                className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-xs text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Credentials Group */}
          <div className="pt-2 border-t border-border space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="password" className="block text-xs font-semibold text-text">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 10 characters"
                  className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-xs text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-xs font-semibold text-text">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-xs text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Password Strength Checklist */}
            <div className="rounded-lg border border-border bg-surface-raised p-3 text-xs">
              <span className="font-semibold text-text block mb-1">Password Security Requirements:</span>
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 text-xs">
                <li className={`flex items-center gap-1.5 ${hasMinLength ? 'text-success font-medium' : 'text-text-muted'}`}>
                  <span>{hasMinLength ? '✓' : '•'}</span> 10+ characters
                </li>
                <li className={`flex items-center gap-1.5 ${hasUppercase ? 'text-success font-medium' : 'text-text-muted'}`}>
                  <span>{hasUppercase ? '✓' : '•'}</span> Uppercase letter
                </li>
                <li className={`flex items-center gap-1.5 ${hasLowercase ? 'text-success font-medium' : 'text-text-muted'}`}>
                  <span>{hasLowercase ? '✓' : '•'}</span> Lowercase letter
                </li>
                <li className={`flex items-center gap-1.5 ${hasNumber ? 'text-success font-medium' : 'text-text-muted'}`}>
                  <span>{hasNumber ? '✓' : '•'}</span> Number (0-9)
                </li>
                <li className={`flex items-center gap-1.5 ${hasSpecial ? 'text-success font-medium' : 'text-text-muted'}`}>
                  <span>{hasSpecial ? '✓' : '•'}</span> Special symbol
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting || !isPasswordValid}
              className="w-full rounded-md bg-primary py-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Registering Student Account...' : 'Complete Registration'}
            </button>
          </div>
        </form>

        <div className="border-t border-border pt-4 text-center text-xs text-text-muted">
          Already registered?{' '}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Sign In to Member Portal
          </Link>
        </div>
      </div>
    </div>
  );
}
