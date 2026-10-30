'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PublicEventDetail, RegistrationStatus } from '@csi/shared';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-context';
import { formatEventDateTime } from '@/lib/utils';
import {
  Calendar,
  MapPin,
  Users,
  CheckCircle2,
  Clock,
  ArrowLeft,
  CalendarDays,
  AlertCircle,
  Loader2,
  Lock,
} from 'lucide-react';

export default function EventDetailPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const { user, isAuthenticated } = useAuth();

  const [event, setEvent] = useState<PublicEventDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Registration form state
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestCollege, setGuestCollege] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestConsent, setGuestConsent] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchEvent = useCallback(async () => {
    if (!slug) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiClient.get<{ data: PublicEventDetail }>(`/events/${slug}`);
      setEvent(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Event not found or unavailable.');
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void fetchEvent();
  }, [fetchEvent]);

  // Handle member registration
  const handleMemberRegister = async () => {
    if (!event) return;
    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await apiClient.post<{ data: { status: RegistrationStatus; message: string } }>(
        `/events/${event.id}/register`,
        {},
      );
      setActionSuccess(res.data.message);
      await fetchEvent();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle registration cancellation
  const handleCancelRegistration = async () => {
    if (!event) return;
    if (!confirm('Are you sure you want to cancel your registration?')) return;

    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await apiClient.post<{ message: string }>(`/events/${event.id}/cancel`, {});
      setActionSuccess(res.message);
      await fetchEvent();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Cancellation failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle guest registration
  const handleGuestRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;
    if (!guestConsent) {
      setActionError('You must provide consent for event registration under DPDP guidelines.');
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const payload = {
        name: guestName.trim(),
        email: guestEmail.trim().toLowerCase(),
        college: guestCollege.trim(),
        phone: guestPhone.trim(),
        consent_data_processing: true,
      };

      const res = await apiClient.post<{ data: { status: RegistrationStatus; message: string } }>(
        `/events/${event.id}/guests`,
        payload,
      );
      setActionSuccess(res.data.message);
      setGuestName('');
      setGuestEmail('');
      setGuestCollege('');
      setGuestPhone('');
      setGuestConsent(false);
      await fetchEvent();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Guest registration failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center space-y-4">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm text-text-muted">Loading event details...</p>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="font-display text-2xl font-bold text-text">Event Not Found</h1>
        <p className="text-xs sm:text-sm text-text-muted">
          {error || 'The requested technical event could not be found or is not open for public viewing.'}
        </p>
        <Link
          href="/events"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-on-primary hover:bg-primary-hover transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Event Discovery
        </Link>
      </div>
    );
  }

  const formattedDateTime = formatEventDateTime(event.starts_at, event.ends_at);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 space-y-10">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-text-muted">
        <Link href="/events" className="hover:text-text transition-colors flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Events
        </Link>
        <span>/</span>
        <span className="truncate text-text font-medium">{event.title}</span>
      </nav>

      {/* Main Header Card */}
      <div className="rounded-xl border border-border bg-surface p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold capitalize text-primary">
              {event.category.replace('_', ' ')}
            </span>
            {event.is_full ? (
              <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
                Waitlist Only
              </span>
            ) : event.is_registration_open ? (
              <span className="rounded-full border border-success/20 bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
                Registration Open
              </span>
            ) : (
              <span className="rounded-full border border-border bg-surface-raised px-2.5 py-0.5 text-xs font-semibold text-text-muted">
                Upcoming
              </span>
            )}
          </div>

          <a
            href={`/api/events/${event.id}/ics`}
            download={`${event.slug}.ics`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface hover:border-border-strong transition-colors"
          >
            <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
            Add to Calendar (.ics)
          </a>
        </div>

        <div className="space-y-3">
          <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-text">
            {event.title}
          </h1>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-border text-xs sm:text-sm">
            <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-raised p-3">
              <Calendar className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <span className="block font-semibold text-text">Date &amp; Time</span>
                <span className="text-xs text-text-muted leading-tight">{formattedDateTime}</span>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-raised p-3">
              <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <span className="block font-semibold text-text">Venue</span>
                <span className="text-xs text-text-muted">
                  {event.venue?.name || 'GCET Engineering Campus'}
                </span>
                {event.venue?.map_url && (
                  <a
                    href={event.venue.map_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-[11px] text-primary hover:underline mt-0.5"
                  >
                    View Campus Map &rarr;
                  </a>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-raised p-3">
              <Users className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <span className="block font-semibold text-text">Attendance Capacity</span>
                <span className="text-xs text-text-muted">
                  {event.registered_count} / {event.capacity} seats filled
                </span>
                <div className="mt-1.5 h-1.5 w-full bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: `${Math.min(100, (event.registered_count / event.capacity) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Description & Registration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Detailed Overview */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-xl border border-border bg-surface p-6 sm:p-8 space-y-4 shadow-xs">
            <h2 className="font-display text-lg font-bold text-text">Event Overview</h2>
            <div className="prose prose-sm max-w-none text-text-muted leading-relaxed whitespace-pre-line text-xs sm:text-sm">
              {event.description}
            </div>
          </div>
        </div>

        {/* Right: Registration Card */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl border border-border bg-surface p-6 shadow-xs space-y-5">
            <div className="space-y-1">
              <h2 className="font-display text-base font-bold text-text">Event Registration</h2>
              <p className="text-xs text-text-muted">
                {event.is_registration_open
                  ? 'Confirm your seat for this CSI GCET technical session.'
                  : 'Registrations are currently closed for this event.'}
              </p>
            </div>

            {/* Notification Alerts */}
            {actionSuccess && (
              <div className="rounded-lg border border-success/20 bg-success/10 p-3 text-xs text-success flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{actionSuccess}</span>
              </div>
            )}
            {actionError && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{actionError}</span>
              </div>
            )}

            {/* Authenticated Flow */}
            {isAuthenticated ? (
              <div className="space-y-4">
                {event.user_registration_status === RegistrationStatus.REGISTERED ? (
                  <div className="rounded-lg border border-success/20 bg-success/10 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-success">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Registration Confirmed
                    </div>
                    <p className="text-xs text-text-muted">
                      You are confirmed to attend as a member of CSI GCET. Present your membership QR code at the
                      entrance session.
                    </p>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => void handleCancelRegistration()}
                      className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-destructive hover:bg-surface-raised transition-colors"
                    >
                      {isSubmitting ? 'Processing...' : 'Cancel Registration'}
                    </button>
                  </div>
                ) : event.user_registration_status === RegistrationStatus.WAITLISTED ? (
                  <div className="rounded-lg border border-accent/20 bg-accent/10 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-accent">
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      Waitlisted
                    </div>
                    <p className="text-xs text-text-muted">
                      You are currently on the waitlist. If a registered attendee cancels, you will be automatically
                      promoted.
                    </p>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => void handleCancelRegistration()}
                      className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-destructive hover:bg-surface-raised transition-colors"
                    >
                      {isSubmitting ? 'Processing...' : 'Cancel Waitlist Position'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-border bg-surface-raised p-3 text-xs space-y-1">
                      <span className="font-semibold text-text">Member Account:</span>
                      <p className="text-text-muted">{user?.name} ({user?.email})</p>
                    </div>

                    <button
                      type="button"
                      disabled={isSubmitting || !event.is_registration_open}
                      onClick={() => void handleMemberRegister()}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50 transition-colors"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          Processing...
                        </>
                      ) : event.is_full ? (
                        'Join Member Waitlist'
                      ) : (
                        'Register as Member'
                      )}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Unauthenticated / Guest Flow */
              <div className="space-y-5">
                <div className="rounded-lg border border-primary/20 bg-primary/10 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    CSI GCET Member?
                  </div>
                  <p className="text-[11px] text-text-muted leading-relaxed">
                    Sign in with your branch credentials to register in 1 click and automatically link your attendance
                    records.
                  </p>
                  <Link
                    href={`/login?redirect=/events/${event.slug}`}
                    className="inline-block text-xs font-semibold text-primary underline hover:text-primary-hover"
                  >
                    Sign In to Member Portal &rarr;
                  </Link>
                </div>

                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-border" />
                  <span className="shrink-0 px-2 text-[10px] uppercase font-semibold text-text-muted">
                    Or Register as Guest
                  </span>
                  <div className="flex-grow border-t border-border" />
                </div>

                <form onSubmit={handleGuestRegister} className="space-y-3">
                  <div>
                    <label htmlFor="guest-name" className="block text-xs font-semibold text-text">
                      Full Name *
                    </label>
                    <input
                      id="guest-name"
                      type="text"
                      required
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Jane Doe"
                      className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label htmlFor="guest-email" className="block text-xs font-semibold text-text">
                      Email Address *
                    </label>
                    <input
                      id="guest-email"
                      type="email"
                      required
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="jane@example.com"
                      className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label htmlFor="guest-college" className="block text-xs font-semibold text-text">
                      College / Institution *
                    </label>
                    <input
                      id="guest-college"
                      type="text"
                      required
                      value={guestCollege}
                      onChange={(e) => setGuestCollege(e.target.value)}
                      placeholder="G. H. Patel College of Engineering"
                      className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label htmlFor="guest-phone" className="block text-xs font-semibold text-text">
                      Contact Phone *
                    </label>
                    <input
                      id="guest-phone"
                      type="tel"
                      required
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div className="flex items-start gap-2 pt-1">
                    <input
                      id="guest-consent"
                      type="checkbox"
                      required
                      checked={guestConsent}
                      onChange={(e) => setGuestConsent(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                    />
                    <label htmlFor="guest-consent" className="text-[11px] text-text-muted leading-tight">
                      I consent to CSI GCET Student Branch processing my contact details for this event in accordance
                      with our{' '}
                      <Link href="/privacy" className="underline text-primary">
                        Privacy Policy
                      </Link>
                      .
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || !event.is_registration_open}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50 transition-colors"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Submitting...
                      </>
                    ) : event.is_full ? (
                      'Join Guest Waitlist'
                    ) : (
                      'Register as Guest'
                    )}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
