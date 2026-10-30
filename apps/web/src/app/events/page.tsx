'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { PublicEventSummary } from '@csi/shared';
import { apiClient } from '@/lib/api-client';
import { EventCard } from '@/components/events/event-card';
import { EventFilters } from '@/components/events/event-filters';
import { Calendar, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';

export default function EventsPage() {
  const [events, setEvents] = useState<PublicEventSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'upcoming' | 'past' | 'all'>('upcoming');

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (selectedCategory) params.set('category', selectedCategory);
      if (selectedStatus) params.set('status', selectedStatus);

      const qs = params.toString();
      const res = await apiClient.get<{ data: PublicEventSummary[] }>(`/events${qs ? `?${qs}` : ''}`);

      if (res && Array.isArray(res.data)) {
        setEvents(res.data);
      } else {
        setEvents([]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load events. Please try again.';
      setError(message);
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedCategory, selectedStatus]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchEvents();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchEvents]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-8">
      {/* Header section */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary border border-primary/20">
          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
          <span>CSI GCET Technical Schedule</span>
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-text sm:text-4xl">
          Event Discovery &amp; Technical Calendar
        </h1>
        <p className="max-w-2xl text-xs sm:text-sm text-text-muted leading-relaxed">
          Participate in hands-on student workshops, competitive hackathons, industrial lectures, and technical
          competitions hosted by the Computer Society of India GCET Student Branch.
        </p>
      </div>

      {/* Filter component */}
      <EventFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
      />

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-center space-y-3">
          <div className="inline-flex items-center justify-center p-2 rounded-full bg-destructive/20 text-destructive">
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold text-destructive">{error}</p>
          <button
            type="button"
            onClick={() => void fetchEvents()}
            className="inline-flex items-center gap-2 rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-on-primary hover:opacity-90 transition-opacity"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-border bg-surface p-6 space-y-4">
              <div className="flex justify-between items-center">
                <div className="h-10 w-12 rounded bg-surface-raised" />
                <div className="h-5 w-24 rounded bg-surface-raised" />
              </div>
              <div className="h-6 w-3/4 rounded bg-surface-raised" />
              <div className="space-y-2">
                <div className="h-4 w-full rounded bg-surface-raised" />
                <div className="h-4 w-2/3 rounded bg-surface-raised" />
              </div>
              <div className="pt-4 border-t border-border flex justify-between">
                <div className="h-4 w-28 rounded bg-surface-raised" />
                <div className="h-7 w-20 rounded bg-surface-raised" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Event Cards Grid */}
      {!isLoading && !error && events.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>
              Showing <strong className="text-text">{events.length}</strong> {selectedStatus} events
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && events.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="font-display text-base font-bold text-text">No events found</h2>
            <p className="max-w-md mx-auto text-xs text-text-muted">
              No technical events currently match your selected filters. Try choosing a different category or clearing
              your search query.
            </p>
          </div>
          {(searchQuery || selectedCategory) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('');
                setSelectedStatus('upcoming');
              }}
              className="inline-flex items-center rounded-md border border-border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
