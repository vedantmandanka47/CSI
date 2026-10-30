import React from 'react';
import Link from 'next/link';
import { PublicEventSummary } from '@csi/shared';
import { formatEventDateTime, formatEventDateShort } from '@/lib/utils';
import { Calendar, MapPin, Users } from 'lucide-react';

interface EventCardProps {
  event: PublicEventSummary;
}

export function EventCard({ event }: EventCardProps) {
  const { month, day } = formatEventDateShort(event.starts_at);
  const formattedDateTime = formatEventDateTime(event.starts_at, event.ends_at);

  const getCategoryColor = (category: string) => {
    switch (category.toLowerCase()) {
      case 'workshop':
        return 'bg-primary/10 text-primary border-primary/20';
      case 'hackathon':
        return 'bg-accent/10 text-accent border-accent/20';
      case 'seminar':
      case 'tech_talk':
        return 'bg-secondary/10 text-secondary border-secondary/20';
      default:
        return 'bg-surface-raised text-text-muted border-border';
    }
  };

  return (
    <article className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-surface p-6 shadow-sm transition-all hover:border-border-strong hover:shadow-md">
      <div className="space-y-4">
        {/* Top Header: Date badge + Category & Status */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface-raised px-3 py-2 text-center shadow-xs">
              <span className="text-[10px] font-bold tracking-wider text-primary uppercase">{month}</span>
              <span className="font-display text-xl font-extrabold text-text leading-tight">{day}</span>
            </div>
            <div>
              <span
                className={`inline-block rounded-md border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${getCategoryColor(
                  event.category,
                )}`}
              >
                {event.category.replace('_', ' ')}
              </span>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
                <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{formattedDateTime}</span>
              </div>
            </div>
          </div>

          {/* Status Badge */}
          {event.is_full ? (
            <span className="rounded-full bg-accent/10 border border-accent/20 px-2.5 py-0.5 text-[11px] font-semibold text-accent">
              Waitlist Only
            </span>
          ) : event.is_registration_open ? (
            <span className="rounded-full bg-success/10 border border-success/20 px-2.5 py-0.5 text-[11px] font-semibold text-success">
              Registration Open
            </span>
          ) : (
            <span className="rounded-full bg-surface-raised border border-border px-2.5 py-0.5 text-[11px] font-semibold text-text-muted">
              Upcoming
            </span>
          )}
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <h3 className="font-display text-lg font-bold text-text group-hover:text-primary transition-colors">
            <Link href={`/events/${event.slug}`} className="focus:outline-none focus:underline">
              {event.title}
            </Link>
          </h3>
          <p className="line-clamp-2 text-xs text-text-muted leading-relaxed sm:text-sm">
            {event.description}
          </p>
        </div>
      </div>

      {/* Footer Info: Venue & Capacity & Action */}
      <div className="mt-6 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4 text-text-muted">
          {event.venue && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
              <span>{event.venue.name}</span>
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
            <span>
              {event.is_full ? 'Capacity Reached' : `${event.remaining_capacity} seats left`}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={`/api/events/${event.id}/ics`}
            download={`${event.slug}.ics`}
            title="Download iCalendar event (.ics)"
            className="inline-flex items-center justify-center rounded-md border border-border bg-surface-raised px-2.5 py-1 text-xs font-medium text-text-muted hover:text-text hover:bg-surface transition-colors"
          >
            .ics
          </a>
          <Link
            href={`/events/${event.slug}`}
            className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1 text-xs font-semibold text-on-primary hover:bg-primary-hover transition-colors"
          >
            Details &amp; Register
          </Link>
        </div>
      </div>
    </article>
  );
}
