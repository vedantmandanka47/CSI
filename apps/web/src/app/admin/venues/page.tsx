'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import {
  VenueDetail,
  ConflictCheckResponse,
  AvCapability,
  ALL_AV_CAPABILITIES,
  RoleCode,
  PermissionCode,
} from '@csi/shared';
import {
  Building2,
  MapPin,
  Users,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Plus,
  ArrowRight,
  ShieldAlert,
  Clock,
  Sparkles,
  ExternalLink,
  Edit,
  RefreshCw,
  Search,
} from 'lucide-react';

interface VenueFormState {
  name: string;
  description: string;
  building: string;
  room_number: string;
  capacity: number;
  map_url: string;
  contact: string;
  notes: string;
  av_capabilities: string[];
  is_available: boolean;
  is_active: boolean;
}

const defaultVenueForm: VenueFormState = {
  name: '',
  description: '',
  building: 'Main Block',
  room_number: '',
  capacity: 100,
  map_url: '',
  contact: '',
  notes: '',
  av_capabilities: [AvCapability.PROJECTOR, AvCapability.AUDIO_SYSTEM],
  is_available: true,
  is_active: true,
};

export default function AdminVenuesPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<'catalog' | 'detector'>('catalog');
  const [venues, setVenues] = useState<VenueDetail[]>([]);
  const [loadingVenues, setLoadingVenues] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVenueId, setEditingVenueId] = useState<string | null>(null);
  const [venueForm, setVenueForm] = useState<VenueFormState>(defaultVenueForm);
  const [submittingVenue, setSubmittingVenue] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Live Conflict Detector State
  const [selectedVenueId, setSelectedVenueId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [checkingConflict, setCheckingConflict] = useState(false);
  const [conflictResult, setConflictResult] = useState<ConflictCheckResponse | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);

  // Quick Event Booking State
  const [eventTitle, setEventTitle] = useState('');
  const [eventSlug, setEventSlug] = useState('');
  const [eventCategory, setEventCategory] = useState('workshop');
  const [eventCapacity, setEventCapacity] = useState(50);
  const [eventDesc, setEventDesc] = useState('');
  const [bookingEvent, setBookingEvent] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);

  const isAuthorized =
    user &&
    (user.roles.includes(RoleCode.PRESIDENT) ||
      user.roles.includes(RoleCode.VP) ||
      user.roles.includes(RoleCode.CORE) ||
      user.roles.includes(RoleCode.SUBCORE) ||
      user.roles.includes(RoleCode.ADMIN) ||
      user.permissions.includes(PermissionCode.VENUE_BOOK));

  const fetchVenues = useCallback(async () => {
    setLoadingVenues(true);
    try {
      const res = await apiClient.get<{ data: VenueDetail[] }>('/venues');
      setVenues(res.data);
      if (res.data.length > 0 && res.data[0] && !selectedVenueId) {
        setSelectedVenueId(res.data[0].id);
      }
    } catch {
      // ignore
    } finally {
      setLoadingVenues(false);
    }
  }, [selectedVenueId]);

  useEffect(() => {
    if (isAuthenticated && isAuthorized) {
      void fetchVenues();
    }
  }, [isAuthenticated, isAuthorized, fetchVenues]);

  // Set default times for detector (e.g. tomorrow 10:00 to 12:00)
  useEffect(() => {
    if (!startTime && !endTime) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      const tomorrowEnd = new Date(tomorrow);
      tomorrowEnd.setHours(12, 0, 0, 0);

      const toLocalIso = (d: Date) => {
        const offset = d.getTimezoneOffset();
        const adjusted = new Date(d.getTime() - offset * 60 * 1000);
        return adjusted.toISOString().slice(0, 16);
      };

      setStartTime(toLocalIso(tomorrow));
      setEndTime(toLocalIso(tomorrowEnd));
    }
  }, [startTime, endTime]);

  // Check Conflict Function
  const handleCheckConflict = async () => {
    if (!selectedVenueId || !startTime || !endTime) return;
    setCheckingConflict(true);
    setConflictResult(null);
    setConflictError(null);
    setBookingSuccess(null);

    try {
      const startIso = new Date(startTime).toISOString();
      const endIso = new Date(endTime).toISOString();

      if (new Date(endIso) <= new Date(startIso)) {
        setConflictError('End time must be strictly after start time.');
        setCheckingConflict(false);
        return;
      }

      const res = await apiClient.post<{ data: ConflictCheckResponse }>(
        '/events/check-conflicts',
        {
          venue_id: selectedVenueId,
          starts_at: startIso,
          ends_at: endIso,
        },
      );
      setConflictResult(res.data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setConflictError(err.message);
      } else {
        setConflictError('Failed to verify venue availability.');
      }
    } finally {
      setCheckingConflict(false);
    }
  };

  // Submit Venue Modal (Create or Edit)
  const handleSaveVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingVenue(true);
    setModalError(null);

    try {
      if (editingVenueId) {
        await apiClient.put(`/venues/${editingVenueId}`, venueForm);
      } else {
        await apiClient.post('/venues', venueForm);
      }
      setIsModalOpen(false);
      setEditingVenueId(null);
      setVenueForm(defaultVenueForm);
      await fetchVenues();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setModalError(err.message);
      } else {
        setModalError('Failed to save venue record.');
      }
    } finally {
      setSubmittingVenue(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (v: VenueDetail) => {
    setEditingVenueId(v.id);
    setVenueForm({
      name: v.name,
      description: v.description || '',
      building: v.building,
      room_number: v.room_number || '',
      capacity: v.capacity,
      map_url: v.map_url || '',
      contact: v.contact || '',
      notes: v.notes || '',
      av_capabilities: v.av_capabilities,
      is_available: v.is_available,
      is_active: v.is_active,
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  // Toggle AV capability pill in form
  const toggleAvCapability = (cap: string) => {
    setVenueForm((prev) => {
      const exists = prev.av_capabilities.includes(cap);
      return {
        ...prev,
        av_capabilities: exists
          ? prev.av_capabilities.filter((c) => c !== cap)
          : [...prev.av_capabilities, cap],
      };
    });
  };

  // Quick Event Booking
  const handleBookEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conflictResult?.available) return;

    setBookingEvent(true);
    setConflictError(null);
    setBookingSuccess(null);

    try {
      const startIso = new Date(startTime).toISOString();
      const endIso = new Date(endTime).toISOString();

      const res = await apiClient.post<{ data: { id: string; slug: string; title: string } }>(
        '/events',
        {
          slug: eventSlug.trim(),
          title: eventTitle.trim(),
          description: eventDesc.trim() || 'Official chapter event scheduled in campus facility.',
          category: eventCategory,
          venue_id: selectedVenueId,
          starts_at: startIso,
          ends_at: endIso,
          capacity: eventCapacity,
        },
      );

      setBookingSuccess(
        `Event "${res.data.title}" successfully booked and confirmed at venue! PostgreSQL exclusion constraint validated.`,
      );
      setEventTitle('');
      setEventSlug('');
      setEventDesc('');
      void handleCheckConflict();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setConflictError(`Booking Conflict: ${err.message}`);
      } else {
        setConflictError('Failed to book event. Please try again.');
      }
    } finally {
      setBookingEvent(false);
    }
  };

  // Filtered venues
  const filteredVenues = venues.filter((v) => {
    const matchesBuilding =
      buildingFilter === 'all' || v.building.toLowerCase() === buildingFilter.toLowerCase();
    const matchesSearch =
      v.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      v.building.toLowerCase().includes(searchFilter.toLowerCase()) ||
      (v.room_number && v.room_number.toLowerCase().includes(searchFilter.toLowerCase()));
    return matchesBuilding && matchesSearch;
  });

  const selectedVenueObj = venues.find((v) => v.id === selectedVenueId);

  if (authLoading) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center px-4 py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-text-muted">Loading campus venue registry...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !isAuthorized) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg items-center justify-center px-4 py-12">
        <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h2 className="font-display text-xl font-bold text-text">Access Restricted</h2>
          <p className="mt-2 text-sm text-text-muted">
            Managing university facilities and booking reservations requires executive permissions.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Link
              href="/login"
              className="w-full rounded-md bg-primary py-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              Sign In with Authorized Account
            </Link>
            <Link
              href="/"
              className="w-full rounded-md border border-border bg-surface py-2.5 text-xs font-semibold text-text hover:bg-surface-raised"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-xs text-text-muted">
        <Link href="/" className="hover:text-text">
          Home
        </Link>
        <span>/</span>
        <Link href="/admin/members" className="hover:text-text">
          Admin
        </Link>
        <span>/</span>
        <span className="font-medium text-text">Venue Registry</span>
      </nav>

      {/* Page Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary">
            <Building2 className="h-3.5 w-3.5" />
            <span>M10 Campus Facility Registry</span>
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold text-text sm:text-3xl">
            Campus Venue Registry & Double-Booking Prevention
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            PostgreSQL btree_gist mathematical conflict exclusion with automated schedule verification.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void fetchVenues()}
            className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-semibold text-text shadow-sm hover:bg-surface-raised"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingVenueId(null);
              setVenueForm(defaultVenueForm);
              setModalError(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            <span>Add Venue</span>
          </button>
        </div>
      </div>

      {/* Mode Navigation Tabs */}
      <div className="mt-6 flex border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab('catalog')}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-semibold transition-colors ${
            activeTab === 'catalog'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-text'
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>Campus Venues ({venues.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('detector')}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-semibold transition-colors ${
            activeTab === 'detector'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-text'
          }`}
        >
          <Clock className="h-4 w-4" />
          <span>Live Conflict Detector & Booking</span>
        </button>
      </div>

      {/* TAB 1: VENUES CATALOG */}
      {activeTab === 'catalog' && (
        <div className="mt-6 space-y-6">
          {/* Filter Bar */}
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search by name, building, or room number..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full rounded-md border border-border bg-surface py-2 pl-9 pr-3 text-xs text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-text-muted">Building:</label>
              <select
                value={buildingFilter}
                onChange={(e) => setBuildingFilter(e.target.value)}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text focus:border-primary focus:outline-none"
              >
                <option value="all">All Buildings</option>
                <option value="Main Block">Main Block</option>
                <option value="IT Block">IT Block</option>
                <option value="Mechanical Block">Mechanical Block</option>
                <option value="Electrical Block">Electrical Block</option>
              </select>
            </div>
          </div>

          {/* Venues Grid */}
          {loadingVenues ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredVenues.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center">
              <Building2 className="mx-auto h-12 w-12 text-text-muted" />
              <h3 className="mt-3 font-display text-base font-bold text-text">No Venues Found</h3>
              <p className="mt-1 text-xs text-text-muted">
                {venues.length === 0
                  ? 'No campus facilities have been registered yet. Click "Add Venue" to create your first venue.'
                  : 'No venues match the selected filters.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredVenues.map((v) => (
                <div
                  key={v.id}
                  className={`flex flex-col justify-between rounded-xl border bg-surface p-5 shadow-sm transition-all hover:shadow-md ${
                    !v.is_active
                      ? 'border-border/50 opacity-60'
                      : !v.is_available
                      ? 'border-warning/30 bg-warning/5'
                      : 'border-border'
                  }`}
                >
                  <div>
                    {/* Header: Title & Badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-display text-base font-bold text-text">{v.name}</h3>
                        <p className="text-xs text-text-muted">
                          {v.building} {v.room_number ? `• Room ${v.room_number}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            v.is_available
                              ? 'bg-success/10 text-success'
                              : 'bg-warning/20 text-warning'
                          }`}
                        >
                          {v.is_available ? 'Available' : 'Maintenance'}
                        </span>
                        {!v.is_active && (
                          <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-bold text-text-muted">
                            Archived
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    {v.description && (
                      <p className="mt-2 text-xs text-text-muted line-clamp-2">{v.description}</p>
                    )}

                    {/* Metrics */}
                    <div className="mt-4 flex items-center gap-4 border-y border-border/50 py-2.5 text-xs text-text">
                      <div className="flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-primary" />
                        <span className="font-semibold">{v.capacity}</span>
                        <span className="text-text-muted">seats</span>
                      </div>
                      {v.map_url && (
                        <a
                          href={v.map_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <MapPin className="h-3.5 w-3.5" />
                          <span>Campus Map</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>

                    {/* AV Capabilities Badges */}
                    <div className="mt-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                        Facilities & AV:
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {v.av_capabilities.length > 0 ? (
                          v.av_capabilities.map((cap) => (
                            <span
                              key={cap}
                              className="rounded-md border border-border bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-text capitalize"
                            >
                              {cap.replace('_', ' ')}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] italic text-text-muted">Standard seating</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="mt-5 flex items-center justify-between border-t border-border/60 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedVenueId(v.id);
                        setActiveTab('detector');
                      }}
                      className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                    >
                      <span>Check Schedule</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(v)}
                      className="flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text hover:bg-surface-raised shadow-sm"
                    >
                      <Edit className="h-3.5 w-3.5 text-text-muted" />
                      <span>Edit</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: LIVE CONFLICT DETECTOR & BOOKING */}
      {activeTab === 'detector' && (
        <div className="mt-6 grid gap-8 lg:grid-cols-12">
          {/* Left Column: Conflict Verification Engine (5 cols) */}
          <div className="space-y-6 lg:col-span-5">
            <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
              <h2 className="font-display text-base font-bold text-text flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <span>Venue Availability Checker</span>
              </h2>
              <p className="mt-1 text-xs text-text-muted">
                Evaluates time-window feasibility against active events before attempting database transactions.
              </p>

              <div className="mt-5 space-y-4">
                {/* Venue Select */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Select Venue:
                  </label>
                  <select
                    value={selectedVenueId}
                    onChange={(e) => {
                      setSelectedVenueId(e.target.value);
                      setConflictResult(null);
                    }}
                    className="mt-1.5 w-full rounded-md border border-border bg-surface p-2.5 text-xs font-semibold text-text focus:border-primary focus:outline-none"
                  >
                    {venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.building} • {v.capacity} seats) {!v.is_available ? '⚠️ Under Maintenance' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Start Time */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Proposed Start Time (ISO):
                  </label>
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => {
                      setStartTime(e.target.value);
                      setConflictResult(null);
                    }}
                    className="mt-1.5 w-full rounded-md border border-border bg-surface p-2 text-xs font-medium text-text focus:border-primary focus:outline-none"
                  />
                </div>

                {/* End Time */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Proposed End Time (ISO):
                  </label>
                  <input
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => {
                      setEndTime(e.target.value);
                      setConflictResult(null);
                    }}
                    className="mt-1.5 w-full rounded-md border border-border bg-surface p-2 text-xs font-medium text-text focus:border-primary focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void handleCheckConflict()}
                  disabled={checkingConflict || !selectedVenueId || !startTime || !endTime}
                  className="w-full rounded-md bg-primary py-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {checkingConflict ? 'Querying Availability...' : 'Check Availability'}
                </button>
              </div>

              {/* Conflict Error Message */}
              {conflictError && (
                <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
                  <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{conflictError}</span>
                </div>
              )}

              {/* Result Indicator Card */}
              {conflictResult && (
                <div
                  className={`mt-4 rounded-lg border p-4 shadow-sm ${
                    conflictResult.available
                      ? 'border-success/30 bg-success/10 text-success'
                      : 'border-danger/30 bg-danger/10 text-danger'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {conflictResult.available ? (
                      <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                    )}
                    <h4 className="font-display text-sm font-bold">
                      {conflictResult.available ? 'Venue Available' : 'Double-Booking Conflict Detected'}
                    </h4>
                  </div>
                  <p className="mt-1.5 text-xs text-text">{conflictResult.message}</p>

                  {conflictResult.conflicting_event && (
                    <div className="mt-3 rounded border border-danger/20 bg-surface p-2.5 text-xs text-text">
                      <div className="font-semibold text-danger">Existing Event:</div>
                      <div className="mt-0.5 font-medium">{conflictResult.conflicting_event.title}</div>
                      <div className="mt-0.5 text-[11px] text-text-muted">
                        {new Date(conflictResult.conflicting_event.starts_at).toLocaleString()} –{' '}
                        {new Date(conflictResult.conflicting_event.ends_at).toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Selected Venue Summary Card */}
            {selectedVenueObj && (
              <div className="rounded-xl border border-border bg-surface p-5 shadow-sm text-xs space-y-2">
                <h4 className="font-display text-xs font-bold uppercase tracking-wider text-text-muted">
                  Venue Profile: {selectedVenueObj.name}
                </h4>
                <div className="flex justify-between py-1 border-b border-border/40">
                  <span className="text-text-muted">Building & Room:</span>
                  <span className="font-medium text-text">
                    {selectedVenueObj.building} {selectedVenueObj.room_number ? `(${selectedVenueObj.room_number})` : ''}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/40">
                  <span className="text-text-muted">Max Capacity:</span>
                  <span className="font-semibold text-text">{selectedVenueObj.capacity} seats</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/40">
                  <span className="text-text-muted">Current Status:</span>
                  <span className={`font-semibold ${selectedVenueObj.is_available ? 'text-success' : 'text-warning'}`}>
                    {selectedVenueObj.is_available ? 'Operational' : 'Maintenance'}
                  </span>
                </div>
                {selectedVenueObj.notes && (
                  <div className="pt-1">
                    <span className="text-text-muted">Internal Notes:</span>
                    <p className="text-text italic mt-0.5">{selectedVenueObj.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Confirmed Booking Terminal (7 cols) */}
          <div className="space-y-6 lg:col-span-7">
            <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
              <h2 className="font-display text-base font-bold text-text flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-accent" />
                <span>Schedule Event in Verified Venue</span>
              </h2>
              <p className="mt-1 text-xs text-text-muted">
                Saves directly into PostgreSQL events table. Protected by native exclusion constraint (SQLSTATE 23P01).
              </p>

              {bookingSuccess && (
                <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-success/30 bg-success/10 p-4 text-xs text-success">
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold">Reservation Confirmed</h4>
                    <p className="mt-0.5 text-text">{bookingSuccess}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleBookEvent} className="mt-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-text">Event Title:</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Linux Kernel Deep Dive"
                      value={eventTitle}
                      onChange={(e) => {
                        setEventTitle(e.target.value);
                        if (!eventSlug) {
                          setEventSlug(
                            e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, '-')
                              .replace(/^-|-$/g, ''),
                          );
                        }
                      }}
                      className="mt-1 w-full rounded-md border border-border bg-surface p-2 text-xs text-text focus:border-primary focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text">Unique URL Slug:</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. linux-kernel-deep-dive"
                      value={eventSlug}
                      onChange={(e) => setEventSlug(e.target.value)}
                      className="mt-1 w-full rounded-md border border-border bg-surface p-2 font-mono text-xs text-text focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-text">Category:</label>
                    <select
                      value={eventCategory}
                      onChange={(e) => setEventCategory(e.target.value)}
                      className="mt-1 w-full rounded-md border border-border bg-surface p-2 text-xs font-medium text-text focus:border-primary focus:outline-none"
                    >
                      <option value="workshop">Workshop</option>
                      <option value="seminar">Seminar</option>
                      <option value="hackathon">Hackathon</option>
                      <option value="competition">Competition</option>
                      <option value="tech_talk">Tech Talk</option>
                      <option value="cultural">Cultural</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text">
                      Expected Capacity (Max {selectedVenueObj?.capacity ?? 100}):
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={selectedVenueObj?.capacity ?? 500}
                      value={eventCapacity}
                      onChange={(e) => setEventCapacity(parseInt(e.target.value, 10) || 1)}
                      className="mt-1 w-full rounded-md border border-border bg-surface p-2 text-xs text-text focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text">Event Overview:</label>
                  <textarea
                    rows={3}
                    placeholder="Provide an overview of the event..."
                    value={eventDesc}
                    onChange={(e) => setEventDesc(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-surface p-2 text-xs text-text focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="rounded-lg border border-border/80 bg-surface-raised p-3 text-xs text-text-muted flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-text">Assigned Venue:</span>{' '}
                    {selectedVenueObj?.name ?? 'None'}
                  </div>
                  <div>
                    <span className="font-semibold text-text">Window:</span>{' '}
                    {startTime ? new Date(startTime).toLocaleDateString() : '—'}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={bookingEvent || !conflictResult?.available || !eventTitle.trim() || !eventSlug.trim()}
                  className="w-full rounded-md bg-primary py-3 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {bookingEvent ? (
                    'Registering Event...'
                  ) : !conflictResult ? (
                    'Verify Availability Above Before Booking'
                  ) : !conflictResult.available ? (
                    'Cannot Book: Schedule Conflict Detected'
                  ) : (
                    <>
                      <span>Confirm & Book Venue</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT VENUE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-lg font-bold text-text">
              {editingVenueId ? 'Edit Venue Details' : 'Register New Campus Venue'}
            </h3>
            <p className="mt-1 text-xs text-text-muted">
              Add facility specifications, seating capacity, and integrated AV capability tags.
            </p>

            {modalError && (
              <div className="mt-4 rounded-md border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveVenue} className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-text">Venue Name:</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Auditorium A"
                    value={venueForm.name}
                    onChange={(e) => setVenueForm({ ...venueForm, name: e.target.value })}
                    className="mt-1 w-full rounded-md border border-border bg-surface p-2 text-xs text-text focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text">Building / Block:</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Main Block"
                    value={venueForm.building}
                    onChange={(e) => setVenueForm({ ...venueForm, building: e.target.value })}
                    className="mt-1 w-full rounded-md border border-border bg-surface p-2 text-xs text-text focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-text">Room Number (Optional):</label>
                  <input
                    type="text"
                    placeholder="e.g. AUD-01 or Lab 202"
                    value={venueForm.room_number}
                    onChange={(e) => setVenueForm({ ...venueForm, room_number: e.target.value })}
                    className="mt-1 w-full rounded-md border border-border bg-surface p-2 text-xs text-text focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text">Maximum Seating Capacity:</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={venueForm.capacity}
                    onChange={(e) =>
                      setVenueForm({ ...venueForm, capacity: parseInt(e.target.value, 10) || 1 })
                    }
                    className="mt-1 w-full rounded-md border border-border bg-surface p-2 text-xs text-text focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text">Description:</label>
                <textarea
                  rows={2}
                  placeholder="Overview of venue layout, stage, or acoustics..."
                  value={venueForm.description}
                  onChange={(e) => setVenueForm({ ...venueForm, description: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-surface p-2 text-xs text-text focus:border-primary focus:outline-none"
                />
              </div>

              {/* AV Capabilities Toggle Pills */}
              <div>
                <label className="block text-xs font-semibold text-text">
                  AV & Technical Equipment:
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {ALL_AV_CAPABILITIES.map((cap) => {
                    const isSelected = venueForm.av_capabilities.includes(cap);
                    return (
                      <button
                        key={cap}
                        type="button"
                        onClick={() => toggleAvCapability(cap)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-semibold capitalize transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-surface text-text-muted hover:text-text'
                        }`}
                      >
                        {cap.replace('_', ' ')}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-text">Map Link (URL):</label>
                  <input
                    type="url"
                    placeholder="https://maps.google.com/..."
                    value={venueForm.map_url}
                    onChange={(e) => setVenueForm({ ...venueForm, map_url: e.target.value })}
                    className="mt-1 w-full rounded-md border border-border bg-surface p-2 text-xs text-text focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text">Contact / Caretaker:</label>
                  <input
                    type="text"
                    placeholder="e.g. Prof. Shah (Ext 304)"
                    value={venueForm.contact}
                    onChange={(e) => setVenueForm({ ...venueForm, contact: e.target.value })}
                    className="mt-1 w-full rounded-md border border-border bg-surface p-2 text-xs text-text focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text">Administrative Notes:</label>
                <input
                  type="text"
                  placeholder="e.g. Key available in Electrical Dept staffroom"
                  value={venueForm.notes}
                  onChange={(e) => setVenueForm({ ...venueForm, notes: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-surface p-2 text-xs text-text focus:border-primary focus:outline-none"
                />
              </div>

              {/* Status Toggles */}
              <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-text">
                  <input
                    type="checkbox"
                    checked={venueForm.is_available}
                    onChange={(e) => setVenueForm({ ...venueForm, is_available: e.target.checked })}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span>Operational (Available)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-text">
                  <input
                    type="checkbox"
                    checked={venueForm.is_active}
                    onChange={(e) => setVenueForm({ ...venueForm, is_active: e.target.checked })}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span>Active in Registry</span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-md border border-border bg-surface px-4 py-2 text-xs font-semibold text-text hover:bg-surface-raised"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingVenue || !venueForm.name.trim() || !venueForm.building.trim()}
                  className="rounded-md bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {submittingVenue ? 'Saving...' : editingVenueId ? 'Update Venue' : 'Create Venue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
