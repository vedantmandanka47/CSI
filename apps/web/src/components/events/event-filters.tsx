'use client';

import React from 'react';
import { Search, CalendarDays } from 'lucide-react';

interface EventFiltersProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedCategory: string;
  onCategoryChange: (cat: string) => void;
  selectedStatus: 'upcoming' | 'past' | 'all';
  onStatusChange: (status: 'upcoming' | 'past' | 'all') => void;
}

const CATEGORIES = [
  { id: '', label: 'All Disciplines' },
  { id: 'workshop', label: 'Workshops' },
  { id: 'hackathon', label: 'Hackathons' },
  { id: 'seminar', label: 'Seminars' },
  { id: 'tech_talk', label: 'Tech Talks' },
  { id: 'competition', label: 'Competitions' },
];

export function EventFilters({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  selectedStatus,
  onStatusChange,
}: EventFiltersProps) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-6 shadow-xs">
      {/* Top row: Status Tabs & Search Bar & Calendar export */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="inline-flex rounded-lg border border-border bg-surface-raised p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => onStatusChange('upcoming')}
            className={`rounded-md px-3 py-1.5 transition-all ${
              selectedStatus === 'upcoming'
                ? 'bg-surface font-semibold text-text shadow-xs border border-border'
                : 'text-text-muted hover:text-text'
            }`}
          >
            Upcoming Events
          </button>
          <button
            type="button"
            onClick={() => onStatusChange('past')}
            className={`rounded-md px-3 py-1.5 transition-all ${
              selectedStatus === 'past'
                ? 'bg-surface font-semibold text-text shadow-xs border border-border'
                : 'text-text-muted hover:text-text'
            }`}
          >
            Past Events
          </button>
          <button
            type="button"
            onClick={() => onStatusChange('all')}
            className={`rounded-md px-3 py-1.5 transition-all ${
              selectedStatus === 'all'
                ? 'bg-surface font-semibold text-text shadow-xs border border-border'
                : 'text-text-muted hover:text-text'
            }`}
          >
            All Archive
          </button>
        </div>

        {/* Search input & Calendar actions */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search by topic or speaker..."
              className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-1.5 text-xs text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <a
            href="/api/calendar/feed.ics"
            download="csi-gcet-feed.ics"
            title="Subscribe to iCalendar Feed (RFC 5545)"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface hover:border-border-strong transition-colors"
          >
            <CalendarDays className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span className="hidden sm:inline">Subscribe (.ics)</span>
          </a>
        </div>
      </div>

      {/* Bottom row: Category Pills */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border text-xs">
        <span className="text-text-muted text-xs font-medium mr-1">Filter track:</span>
        {CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={cat.id || 'all'}
              type="button"
              onClick={() => onCategoryChange(cat.id)}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                isActive
                  ? 'bg-primary text-on-primary font-semibold'
                  : 'bg-surface-raised text-text-muted border border-border hover:text-text hover:bg-surface'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
