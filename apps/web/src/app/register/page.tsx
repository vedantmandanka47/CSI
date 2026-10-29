'use client';

import React, { useState } from 'react';
import Link from 'next/link';
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
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-6 rounded-lg border border-border bg-surface p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="font-display text-xl font-bold text-text">Registration Submitted!</h1>
          <p className="text-xs leading-relaxed text-text-muted">
            Your CSI GCET account has been created in pending state. Please verify your email
            address to activate your membership.
          </p>

          {verificationToken && (
            <div className="mt-4 rounded-md border border-border bg-surface-raised p-3 text-left">
              <span className="text-[10px] uppercase font-bold tracking-wider text-text-muted">
                Dev / Test Verification Token:
              </span>
              <p className="mt-1 font-mono text-xs break-all text-primary">{verificationToken}</p>
              <div className="mt-2 text-center">
                <Link
                  href={`/verify-email?token=${verificationToken}`}
                  className="inline-block text-xs font-semibold text-primary underline"
                >
                  Click here to verify email now →
                </Link>
              </div>
            </div>
          )}

          <div className="pt-2">
            <Link
              href="/login"
              className="inline-block rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              Go to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-lg space-y-6 rounded-lg border border-border bg-surface p-8 shadow-sm">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight text-text">
            Join CSI GCET Student Branch
          </h1>
          <p className="mt-2 text-xs text-text-muted">
            Create your account to participate in workshops, technical symposiums, and branch activities
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-md border border-danger/30 bg-danger/10 p-3 text-xs text-danger"
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="fullName" className="block text-xs font-semibold uppercase tracking-wider text-text">
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. John Doe"
              className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {fieldErrors?.['full_name'] && (
              <p className="mt-1 text-xs text-danger">{fieldErrors['full_name'][0]}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-text">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@gcet.ac.in"
                className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {fieldErrors?.['email'] && (
                <p className="mt-1 text-xs text-danger">{fieldErrors['email'][0]}</p>
              )}
            </div>

            <div>
              <label htmlFor="enrollmentNo" className="block text-xs font-semibold uppercase tracking-wider text-text">
                Enrollment No. <span className="text-[10px] text-text-muted font-normal">(Optional)</span>
              </label>
              <input
                id="enrollmentNo"
                type="text"
                value={enrollmentNo}
                onChange={(e) => setEnrollmentNo(e.target.value)}
                placeholder="e.g. 210010116001"
                className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label htmlFor="phone" className="block text-xs font-semibold uppercase tracking-wider text-text">
              Contact Phone <span className="text-[10px] text-text-muted font-normal">(Optional)</span>
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 9876543210"
              className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-text">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-xs font-semibold uppercase tracking-wider text-text">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Password Strength Checklist */}
          <div className="rounded-md border border-border bg-surface-raised p-3 text-xs">
            <span className="font-semibold text-text">Password Requirements:</span>
            <ul className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2 text-[11px]">
              <li className={`flex items-center gap-1.5 ${hasMinLength ? 'text-success' : 'text-text-muted'}`}>
                <span>{hasMinLength ? '✓' : '•'}</span> 10+ characters
              </li>
              <li className={`flex items-center gap-1.5 ${hasUppercase ? 'text-success' : 'text-text-muted'}`}>
                <span>{hasUppercase ? '✓' : '•'}</span> At least 1 uppercase letter
              </li>
              <li className={`flex items-center gap-1.5 ${hasLowercase ? 'text-success' : 'text-text-muted'}`}>
                <span>{hasLowercase ? '✓' : '•'}</span> At least 1 lowercase letter
              </li>
              <li className={`flex items-center gap-1.5 ${hasNumber ? 'text-success' : 'text-text-muted'}`}>
                <span>{hasNumber ? '✓' : '•'}</span> At least 1 number
              </li>
              <li className={`flex items-center gap-1.5 ${hasSpecial ? 'text-success' : 'text-text-muted'}`}>
                <span>{hasSpecial ? '✓' : '•'}</span> At least 1 special character
              </li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={submitting || !isPasswordValid}
            className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Creating Account...' : 'Complete Registration'}
          </button>
        </form>

        <div className="text-center text-xs text-text-muted">
          Already registered?{' '}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Sign In here
          </Link>
        </div>
      </div>
    </div>
  );
}
