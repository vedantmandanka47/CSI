'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import {
  RoleCode,
  PermissionCode,
  TermStatus,
  AcademicTermResponse,
  AcademicTermListResponse,
  RolloverPreviewResponse,
  RolloverExecutionResponse,
  TermSnapshotResponse,
  RolloverHistoryResponse,
} from '@csi/shared';
import {
  Calendar,
  History,
  ArrowRight,
  ArrowLeft,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Users,
  Lock,
  RefreshCw,
  FileText,
  Plus,
  X,
  Award,
  Clock,
  AlertCircle,
  Check,
} from 'lucide-react';

interface IncomingAppointmentState {
  userId: string;
  roleCode: string;
  committeeCode: string;
}

export default function AdminTermsPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [terms, setTerms] = useState<AcademicTermResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Term Creation State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    code: '',
    startDate: '',
    endDate: '',
  });
  const [createLoading, setCreateLoading] = useState(false);

  // Rollover Wizard State
  const [rolloverWizardOpen, setRolloverWizardOpen] = useState(false);
  const [rolloverStep, setRolloverStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedTargetTermId, setSelectedTargetTermId] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [rolloverPreview, setRolloverPreview] = useState<RolloverPreviewResponse | null>(null);
  const [confirmationCodeInput, setConfirmationCodeInput] = useState('');
  const [archiveOpenTasks, setArchiveOpenTasks] = useState(true);
  const [transitionGraduating, setTransitionGraduating] = useState(true);
  const [rolloverNotes, setRolloverNotes] = useState('');
  const [executeLoading, setExecuteLoading] = useState(false);
  const [executionResult, setExecutionResult] = useState<RolloverExecutionResponse | null>(null);

  // Incoming Board Appointments State for Rollover
  const [incomingAppointments, setIncomingAppointments] = useState<IncomingAppointmentState[]>([]);
  const [newApptUserId, setNewApptUserId] = useState('');
  const [newApptRoleCode, setNewApptRoleCode] = useState<string>(RoleCode.CORE);
  const [newApptCommitteeCode, setNewApptCommitteeCode] = useState('');

  // Snapshot Viewer State
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [viewingSnapshot, setViewingSnapshot] = useState<TermSnapshotResponse | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  // Rollover History State
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [rolloverHistory, setRolloverHistory] = useState<RolloverHistoryResponse['data']>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const isExecutive =
    user &&
    (user.roles.includes(RoleCode.PRESIDENT) ||
      user.roles.includes(RoleCode.VP) ||
      user.roles.includes(RoleCode.ADMIN) ||
      user.permissions.includes(PermissionCode.ROSTER_MANAGE));

  const fetchTerms = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await apiClient.get<AcademicTermListResponse>('/admin/terms');
      setTerms(res.data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load academic terms.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && isExecutive) {
      void fetchTerms();
    }
  }, [isAuthenticated, isExecutive, fetchTerms]);

  // Handle Term Creation
  const handleCreateTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name || !createForm.code || !createForm.startDate || !createForm.endDate) {
      setErrorMessage('Please fill in all term fields.');
      return;
    }

    setCreateLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await apiClient.post<AcademicTermResponse>('/admin/terms', {
        name: createForm.name.trim(),
        code: createForm.code.trim(),
        startDate: new Date(createForm.startDate).toISOString(),
        endDate: new Date(createForm.endDate).toISOString(),
      });
      setSuccessMessage(`Academic Term ${createForm.code} created successfully.`);
      setCreateModalOpen(false);
      setCreateForm({ name: '', code: '', startDate: '', endDate: '' });
      void fetchTerms();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to create academic term.');
      }
    } finally {
      setCreateLoading(false);
    }
  };

  // Handle Delete Draft Term
  const handleDeleteTerm = async (termId: string, termCode: string) => {
    if (!window.confirm(`Are you sure you want to delete draft term ${termCode}?`)) {
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await apiClient.delete(`/admin/terms/${termId}`);
      setSuccessMessage(`Term ${termCode} deleted successfully.`);
      void fetchTerms();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to delete term.');
      }
    }
  };

  // Launch Rollover Wizard
  const handleOpenRolloverWizard = () => {
    const draftTerms = terms.filter((t) => t.status === TermStatus.DRAFT || (!t.isCurrent && t.status !== TermStatus.ARCHIVED));
    if (draftTerms.length > 0 && draftTerms[0]) {
      setSelectedTargetTermId(draftTerms[0].id);
    } else {
      setSelectedTargetTermId('');
    }
    setRolloverStep(1);
    setRolloverPreview(null);
    setIncomingAppointments([]);
    setConfirmationCodeInput('');
    setRolloverNotes('');
    setExecutionResult(null);
    setRolloverWizardOpen(true);
  };

  // Add Incoming Appointment to Wizard List
  const handleAddIncomingAppointment = () => {
    if (!newApptUserId.trim()) return;
    const exists = incomingAppointments.some(
      (a) => a.userId === newApptUserId.trim() && a.roleCode === newApptRoleCode && a.committeeCode === newApptCommitteeCode.trim()
    );
    if (exists) {
      setErrorMessage('This incoming appointment is already in the list.');
      return;
    }
    setIncomingAppointments((prev) => [
      ...prev,
      {
        userId: newApptUserId.trim(),
        roleCode: newApptRoleCode,
        committeeCode: newApptCommitteeCode.trim(),
      },
    ]);
    setNewApptUserId('');
  };

  const handleRemoveIncomingAppointment = (index: number) => {
    setIncomingAppointments((prev) => prev.filter((_, i) => i !== index));
  };

  // Fetch Preview
  const handleFetchPreview = async () => {
    if (!selectedTargetTermId) {
      setErrorMessage('Please select a target academic term.');
      return;
    }
    setPreviewLoading(true);
    setErrorMessage(null);
    try {
      const activeTerm = terms.find((t) => t.isCurrent);
      const res = await apiClient.post<RolloverPreviewResponse>('/admin/rollover/preview', {
        fromTermId: activeTerm ? activeTerm.id : undefined,
        toTermId: selectedTargetTermId,
        incomingAppointments: incomingAppointments.map((a) => ({
          userId: a.userId,
          roleCode: a.roleCode as RoleCode,
          committeeCode: a.committeeCode || undefined,
        })),
      });
      setRolloverPreview(res);
      setRolloverStep(2);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to generate rollover preview.');
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  // Execute Rollover
  const handleExecuteRollover = async () => {
    if (!rolloverPreview) return;
    if (confirmationCodeInput !== rolloverPreview.suggestedConfirmationCode) {
      setErrorMessage(`Please type the exact confirmation code: ${rolloverPreview.suggestedConfirmationCode}`);
      return;
    }

    setExecuteLoading(true);
    setErrorMessage(null);
    try {
      const activeTerm = terms.find((t) => t.isCurrent);
      const res = await apiClient.post<RolloverExecutionResponse>('/admin/rollover/execute', {
        fromTermId: activeTerm ? activeTerm.id : undefined,
        toTermId: selectedTargetTermId,
        confirmationCode: confirmationCodeInput,
        archiveOpenTasks,
        transitionGraduatingMembers: transitionGraduating,
        notes: rolloverNotes.trim() || undefined,
        incomingAppointments: incomingAppointments.map((a) => ({
          userId: a.userId,
          roleCode: a.roleCode as RoleCode,
          committeeCode: a.committeeCode || undefined,
        })),
      });

      setExecutionResult(res);
      setRolloverStep(4);
      setSuccessMessage('Annual term rollover executed successfully!');
      void fetchTerms();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to execute rollover transaction.');
      }
    } finally {
      setExecuteLoading(false);
    }
  };

  // View Historical Snapshot
  const handleViewSnapshot = async (termId: string) => {
    setSnapshotLoading(true);
    setViewingSnapshot(null);
    setSnapshotModalOpen(true);
    setErrorMessage(null);
    try {
      const res = await apiClient.get<TermSnapshotResponse>(`/admin/terms/${termId}/snapshot`);
      setViewingSnapshot(res);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load term snapshot.');
      }
      setSnapshotModalOpen(false);
    } finally {
      setSnapshotLoading(false);
    }
  };

  // View Rollover History
  const handleViewHistory = async () => {
    setHistoryLoading(true);
    setHistoryModalOpen(true);
    setErrorMessage(null);
    try {
      const res = await apiClient.get<RolloverHistoryResponse>('/admin/rollover/history');
      setRolloverHistory(res.data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load rollover history.');
      }
    } finally {
      setHistoryLoading(false);
    }
  };

  if (authLoading) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl items-center justify-center px-4 py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-text-muted">Loading term administration system...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !isExecutive) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl flex-col items-center justify-center px-4 py-12 text-center">
        <div className="rounded-full bg-danger/10 p-4 ring-8 ring-danger/5">
          <ShieldAlert className="h-10 w-10 text-danger" />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-text">
          Executive Access Required
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Only CSI GCET Branch Executives with roster management authority may manage academic terms, execute annual rollovers, and inspect immutable historical snapshots.
        </p>
        <Link
          href="/"
          className="mt-6 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
        >
          Return to Home
        </Link>
      </main>
    );
  }

  const currentTerm = terms.find((t) => t.isCurrent);

  return (
    <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Navigation Breadcrumb */}
      <div className="mb-6 flex flex-wrap items-center gap-4 text-xs font-semibold text-text-muted">
        <Link
          href="/admin/members"
          className="inline-flex items-center gap-1.5 transition-colors hover:text-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Membership Operations</span>
        </Link>
        <span className="text-border">/</span>
        <Link
          href="/admin/drives"
          className="inline-flex items-center gap-1.5 transition-colors hover:text-text"
        >
          <span>Drive Windows</span>
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 border-b border-border pb-6 sm:flex-row sm:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-pill bg-surface-raised px-3 py-1 text-xs font-semibold text-primary">
            <Calendar className="h-3.5 w-3.5" />
            <span>Governance & Operations</span>
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
            Annual Term Rollover & Archival
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Manage academic calendar tenures, seat incoming committee boards, archive historical activities, and capture immutable audit snapshots.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleViewHistory}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-xs font-semibold text-text shadow-sm transition-colors hover:bg-surface-raised"
          >
            <History className="h-4 w-4 text-text-muted" />
            <span>Rollover History</span>
          </button>
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            <span>Create Academic Term</span>
          </button>
        </div>
      </div>

      {/* Feedback Messages */}
      {errorMessage && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <p>{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-danger hover:opacity-75"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-success/20 bg-success/5 p-4 text-sm text-success">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            <p>{successMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-success hover:opacity-75"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Current Active Term Banner */}
      <div className="mt-8 rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
                <Check className="h-3 w-3" />
                Active Term
              </span>
              {currentTerm && (
                <span className="rounded-pill bg-surface-raised px-2.5 py-0.5 text-xs font-mono font-semibold text-text-muted">
                  {currentTerm.code}
                </span>
              )}
            </div>

            {currentTerm ? (
              <>
                <h2 className="mt-2 text-xl font-bold text-text">{currentTerm.name}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    <span>
                      {new Date(currentTerm.startDate).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      —{' '}
                      {new Date(currentTerm.endDate).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    <span>{currentTerm.activeAppointmentsCount ?? 0} Active Appointments</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Award className="h-3.5 w-3.5" />
                    <span>{currentTerm.eventsCount} Events Conducted</span>
                  </span>
                </div>
              </>
            ) : (
              <div className="mt-2">
                <h2 className="text-xl font-bold text-text">No Active Term Designated</h2>
                <p className="mt-1 text-xs text-text-muted">
                  Create a draft academic term or activate an existing term to establish the current committee tenure.
                </p>
              </div>
            )}
          </div>

          <div>
            <button
              type="button"
              onClick={handleOpenRolloverWizard}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Initiate Annual Rollover</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Academic Terms Table */}
      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-text">All Academic Terms</h2>
          <span className="text-xs text-text-muted">{terms.length} Total Terms</span>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-sm text-text-muted">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="mt-2">Loading academic terms...</p>
            </div>
          ) : terms.length === 0 ? (
            <div className="p-8 text-center text-sm text-text-muted">
              <Calendar className="mx-auto h-8 w-8 text-text-muted opacity-50" />
              <p className="mt-2 font-medium">No academic terms found.</p>
              <p className="mt-1 text-xs">Create your first academic term above to start committee management.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-left text-xs">
                <thead className="bg-surface-raised font-semibold text-text">
                  <tr>
                    <th scope="col" className="px-6 py-3.5">Term Name</th>
                    <th scope="col" className="px-6 py-3.5">Code</th>
                    <th scope="col" className="px-6 py-3.5">Duration</th>
                    <th scope="col" className="px-6 py-3.5">Status</th>
                    <th scope="col" className="px-6 py-3.5 text-right">Appointments</th>
                    <th scope="col" className="px-6 py-3.5 text-right">Events</th>
                    <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {terms.map((t) => (
                    <tr key={t.id} className="transition-colors hover:bg-surface-raised/50">
                      <td className="whitespace-nowrap px-6 py-4 font-medium text-text">
                        <div className="flex items-center gap-2">
                          <span>{t.name}</span>
                          {t.isCurrent && (
                            <span className="rounded-pill bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                              CURRENT
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-mono font-medium text-text-muted">
                        {t.code}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-text-muted">
                        {new Date(t.startDate).toLocaleDateString()} — {new Date(t.endDate).toLocaleDateString()}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`inline-flex rounded-pill px-2.5 py-0.5 text-[10px] font-semibold ${
                            t.status === TermStatus.ACTIVE
                              ? 'bg-success/10 text-success'
                              : t.status === TermStatus.ARCHIVED
                              ? 'bg-surface-raised text-text-muted'
                              : 'bg-warning/10 text-warning'
                          }`}
                        >
                          {t.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-text-muted">
                        {t.activeAppointmentsCount ?? 0}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-text-muted">
                        {t.eventsCount}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {t.status === TermStatus.ARCHIVED && (
                            <button
                              type="button"
                              onClick={() => handleViewSnapshot(t.id)}
                              className="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs font-semibold text-primary hover:bg-surface-raised"
                            >
                              <FileText className="h-3 w-3" />
                              <span>Snapshot</span>
                            </button>
                          )}
                          {t.status === TermStatus.DRAFT && (
                            <button
                              type="button"
                              onClick={() => handleDeleteTerm(t.id, t.code)}
                              className="inline-flex items-center gap-1 rounded border border-danger/20 px-2.5 py-1 text-xs font-semibold text-danger hover:bg-danger/10"
                            >
                              <X className="h-3 w-3" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* CREATE TERM MODAL */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-text/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-display text-lg font-bold text-text">Create Academic Term</h3>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="text-text-muted hover:text-text"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTerm} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text">Term Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Academic Year 2027–2028"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-xs text-text shadow-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text">Term Code (Unique Identifier)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 2027-2028"
                  value={createForm.code}
                  onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-xs font-mono text-text shadow-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text">Start Date</label>
                  <input
                    type="date"
                    required
                    value={createForm.startDate}
                    onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-xs text-text shadow-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text">End Date</label>
                  <input
                    type="date"
                    required
                    value={createForm.endDate}
                    onChange={(e) => setCreateForm({ ...createForm, endDate: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-xs text-text shadow-sm focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="rounded-md border border-border px-4 py-2 text-xs font-semibold text-text hover:bg-surface-raised"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {createLoading && <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />}
                  <span>Save Term</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ANNUAL ROLLOVER WIZARD MODAL */}
      {rolloverWizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-text/40 p-4">
          <div className="w-full max-w-3xl rounded-lg border border-border bg-surface p-6 shadow-2xl">
            {/* Wizard Header */}
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <span className="text-xs font-semibold text-primary">Annual Rollover Process</span>
                <h3 className="font-display text-xl font-bold text-text">
                  Executive Committee Transition & Archival
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRolloverWizardOpen(false)}
                className="text-text-muted hover:text-text"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Stepper Header */}
            <div className="mt-4 flex items-center justify-between border-b border-border pb-4 text-xs font-semibold">
              <span className={rolloverStep === 1 ? 'text-primary' : 'text-text-muted'}>
                1. Select Target Term
              </span>
              <span className="text-border">→</span>
              <span className={rolloverStep === 2 ? 'text-primary' : 'text-text-muted'}>
                2. Transition Preview & Health Check
              </span>
              <span className="text-border">→</span>
              <span className={rolloverStep === 3 ? 'text-primary' : 'text-text-muted'}>
                3. Safety Confirmation
              </span>
              <span className="text-border">→</span>
              <span className={rolloverStep === 4 ? 'text-success' : 'text-text-muted'}>
                4. Execution Summary
              </span>
            </div>

            {/* STEP 1: SELECT TARGET TERM & INCOMING APPOINTMENTS */}
            {rolloverStep === 1 && (
              <div className="mt-6 space-y-6">
                <div>
                  <label className="block text-xs font-semibold text-text">
                    Choose Target Academic Term (to activate as current)
                  </label>
                  <select
                    value={selectedTargetTermId}
                    onChange={(e) => setSelectedTargetTermId(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-xs text-text shadow-sm focus:border-primary focus:outline-none"
                  >
                    <option value="">-- Select Incoming Academic Term --</option>
                    {terms
                      .filter((t) => !t.isCurrent && t.status !== TermStatus.ARCHIVED)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.code}) [{t.status}]
                        </option>
                      ))}
                  </select>
                </div>

                {/* Add Incoming Board Appointments Form */}
                <div className="rounded-lg border border-border bg-surface-raised p-4">
                  <h4 className="text-xs font-bold text-text">Designate Incoming Board Appointments</h4>
                  <p className="mt-1 text-[11px] text-text-muted">
                    Specify student users who will be appointed to executive and core committee roles for the incoming term.
                  </p>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <input
                      type="text"
                      placeholder="User ID (UUID)"
                      value={newApptUserId}
                      onChange={(e) => setNewApptUserId(e.target.value)}
                      className="rounded border border-border px-2.5 py-1.5 text-xs text-text focus:outline-none sm:col-span-2"
                    />
                    <select
                      value={newApptRoleCode}
                      onChange={(e) => setNewApptRoleCode(e.target.value)}
                      className="rounded border border-border px-2.5 py-1.5 text-xs text-text focus:outline-none"
                    >
                      <option value={RoleCode.PRESIDENT}>President</option>
                      <option value={RoleCode.VP}>Vice President</option>
                      <option value={RoleCode.CORE}>Core Lead</option>
                      <option value={RoleCode.SUBCORE}>Subcore Executive</option>
                      <option value={RoleCode.COMMITTEE}>Committee Volunteer</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Committee Code (e.g. technical)"
                      value={newApptCommitteeCode}
                      onChange={(e) => setNewApptCommitteeCode(e.target.value)}
                      className="rounded border border-border px-2.5 py-1.5 text-xs text-text focus:outline-none"
                    />
                  </div>

                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleAddIncomingAppointment}
                      className="inline-flex items-center gap-1 rounded bg-surface px-3 py-1 text-xs font-semibold text-primary border border-border hover:bg-surface-raised"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add Appointment</span>
                    </button>
                  </div>

                  {incomingAppointments.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <span className="text-[11px] font-semibold text-text-muted">Incoming Appointments Queue:</span>
                      <div className="max-h-28 overflow-y-auto divide-y divide-border rounded border border-border bg-surface text-xs">
                        {incomingAppointments.map((a, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2">
                            <div>
                              <span className="font-mono text-text">{a.userId}</span>
                              <span className="ml-2 font-semibold text-primary">[{a.roleCode}]</span>
                              {a.committeeCode && <span className="ml-1 text-text-muted">({a.committeeCode})</span>}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveIncomingAppointment(idx)}
                              className="text-danger hover:opacity-75"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setRolloverWizardOpen(false)}
                    className="rounded-md border border-border px-4 py-2 text-xs font-semibold text-text hover:bg-surface-raised"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleFetchPreview}
                    disabled={!selectedTargetTermId || previewLoading}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {previewLoading && <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />}
                    <span>Generate Transition Preview</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: TRANSITION PREVIEW */}
            {rolloverStep === 2 && rolloverPreview && (
              <div className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto pr-1">
                {/* Outgoing Roles to Close */}
                <div className="rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-text">
                      Outgoing Role Appointments ({rolloverPreview.outgoingAppointments.length})
                    </h4>
                    <span className="text-[11px] text-text-muted">Tenure ends on execution</span>
                  </div>
                  <div className="mt-2 max-h-32 overflow-y-auto divide-y divide-border rounded border border-border bg-surface text-xs">
                    {rolloverPreview.outgoingAppointments.length === 0 ? (
                      <p className="p-3 text-center text-text-muted">No active committee role appointments found.</p>
                    ) : (
                      rolloverPreview.outgoingAppointments.map((appt) => (
                        <div key={appt.id} className="flex items-center justify-between p-2">
                          <div>
                            <span className="font-semibold text-text">{appt.userName}</span>
                            <span className="ml-1 text-text-muted">({appt.userEmail})</span>
                          </div>
                          <div>
                            <span className="rounded bg-surface-raised px-2 py-0.5 text-[10px] font-semibold text-primary">
                              {appt.roleName}
                            </span>
                            {appt.committeeName && (
                              <span className="ml-1 text-text-muted text-[10px]">{appt.committeeName}</span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Graduating 4th-Year Students */}
                <div className="rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-text">
                      Graduating Members ({rolloverPreview.graduatingMembers.length})
                    </h4>
                    <span className="text-[11px] text-text-muted">Year 4+ students transitioning to alumni</span>
                  </div>
                  <div className="mt-2 max-h-28 overflow-y-auto divide-y divide-border rounded border border-border bg-surface text-xs">
                    {rolloverPreview.graduatingMembers.length === 0 ? (
                      <p className="p-3 text-center text-text-muted">No graduating 4th-year members detected on roster.</p>
                    ) : (
                      rolloverPreview.graduatingMembers.map((m) => (
                        <div key={m.id} className="flex items-center justify-between p-2">
                          <span className="font-medium text-text">{m.name}</span>
                          <span className="text-text-muted text-[11px]">{m.branch} (Year {m.year})</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Unresolved Operational Workflows Warnings */}
                <div className="rounded-lg border border-border p-4">
                  <h4 className="text-xs font-bold text-text">Operational Workflows Health Check</h4>
                  <div className="mt-2 space-y-2 text-xs">
                    <div className="flex items-center justify-between rounded bg-surface-raised p-2">
                      <span>Open Committee Tasks:</span>
                      <span className="font-bold text-text">{rolloverPreview.unresolvedWorkflows.openTasks.length}</span>
                    </div>
                    <div className="flex items-center justify-between rounded bg-surface-raised p-2">
                      <span>In-Progress Pre-Event Checklist Runs:</span>
                      <span className="font-bold text-text">{rolloverPreview.unresolvedWorkflows.openChecklistRuns.length}</span>
                    </div>
                    <div className="flex items-center justify-between rounded bg-surface-raised p-2">
                      <span>Media Assets Pending Approval:</span>
                      <span className="font-bold text-text">{rolloverPreview.unresolvedWorkflows.pendingAssets.length}</span>
                    </div>
                  </div>
                  {rolloverPreview.warnings.length > 0 && (
                    <div className="mt-3 rounded border border-warning/20 bg-warning/5 p-2 text-xs text-warning">
                      {rolloverPreview.warnings.map((w, idx) => (
                        <p key={idx} className="flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                          <span>{w}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-between pt-4">
                  <button
                    type="button"
                    onClick={() => setRolloverStep(1)}
                    className="rounded-md border border-border px-4 py-2 text-xs font-semibold text-text hover:bg-surface-raised"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setRolloverStep(3)}
                    disabled={!rolloverPreview.canExecute}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    <span>Proceed to Safety Confirmation</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: SAFETY CONFIRMATION */}
            {rolloverStep === 3 && rolloverPreview && (
              <div className="mt-6 space-y-4">
                <div className="rounded-lg border border-danger/20 bg-danger/5 p-4 text-xs text-danger">
                  <div className="flex items-start gap-2">
                    <Lock className="h-4 w-4 flex-shrink-0" />
                    <div>
                      <p className="font-bold">High-Impact Governance Action</p>
                      <p className="mt-1">
                        Executing this transaction will archive the active academic term ({rolloverPreview.fromTerm?.code || 'None'}), terminate current student committee tenures, seat incoming board appointments, and capture a permanent audit snapshot.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <label className="flex items-center gap-2 text-text">
                    <input
                      type="checkbox"
                      checked={archiveOpenTasks}
                      onChange={(e) => setArchiveOpenTasks(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-0"
                    />
                    <span>Archive all unresolved open tasks across committees</span>
                  </label>

                  <label className="flex items-center gap-2 text-text">
                    <input
                      type="checkbox"
                      checked={transitionGraduating}
                      onChange={(e) => setTransitionGraduating(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-0"
                    />
                    <span>Transition verified 4th-year students to Alumni status</span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text">Executive Transition Notes (Optional)</label>
                  <textarea
                    rows={2}
                    placeholder="Document justification, handover meeting reference, or board approval notes..."
                    value={rolloverNotes}
                    onChange={(e) => setRolloverNotes(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-border p-2 text-xs text-text shadow-sm focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="rounded-lg border border-border bg-surface-raised p-4">
                  <label className="block text-xs font-bold text-text">
                    Type Confirmation Code to Authorize:
                  </label>
                  <p className="mt-0.5 text-[11px] font-mono text-primary">
                    {rolloverPreview.suggestedConfirmationCode}
                  </p>
                  <input
                    type="text"
                    required
                    placeholder={rolloverPreview.suggestedConfirmationCode}
                    value={confirmationCodeInput}
                    onChange={(e) => setConfirmationCodeInput(e.target.value)}
                    className="mt-2 block w-full rounded-md border border-border px-3 py-2 text-xs font-mono text-text shadow-sm focus:border-danger focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between pt-4">
                  <button
                    type="button"
                    onClick={() => setRolloverStep(2)}
                    className="rounded-md border border-border px-4 py-2 text-xs font-semibold text-text hover:bg-surface-raised"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteRollover}
                    disabled={
                      confirmationCodeInput !== rolloverPreview.suggestedConfirmationCode || executeLoading
                    }
                    className="inline-flex items-center gap-1.5 rounded-md bg-danger px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {executeLoading && <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />}
                    <span>Confirm & Execute Rollover</span>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: EXECUTION SUMMARY */}
            {rolloverStep === 4 && executionResult && (
              <div className="mt-6 space-y-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h4 className="font-display text-lg font-bold text-text">
                  Rollover Executed Successfully!
                </h4>
                <p className="text-xs text-text-muted">
                  The CSI GCET Student Branch is now operating under Academic Term {executionResult.summary.toTermCode}.
                </p>

                <div className="mx-auto grid max-w-lg grid-cols-2 gap-3 text-left text-xs sm:grid-cols-4">
                  <div className="rounded border border-border bg-surface-raised p-3">
                    <span className="text-[10px] text-text-muted">Roles Closed</span>
                    <p className="text-lg font-bold text-text">{executionResult.summary.outgoingRolesClosedCount}</p>
                  </div>
                  <div className="rounded border border-border bg-surface-raised p-3">
                    <span className="text-[10px] text-text-muted">Alumni Transitioned</span>
                    <p className="text-lg font-bold text-text">{executionResult.summary.graduatingMembersCount}</p>
                  </div>
                  <div className="rounded border border-border bg-surface-raised p-3">
                    <span className="text-[10px] text-text-muted">Incoming Seated</span>
                    <p className="text-lg font-bold text-text">{executionResult.summary.incomingRolesCreatedCount}</p>
                  </div>
                  <div className="rounded border border-border bg-surface-raised p-3">
                    <span className="text-[10px] text-text-muted">Tasks Archived</span>
                    <p className="text-lg font-bold text-text">{executionResult.summary.tasksArchivedCount}</p>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-3 pt-4">
                  {executionResult.summary.snapshotId && (
                    <button
                      type="button"
                      onClick={() => {
                        setRolloverWizardOpen(false);
                        void handleViewSnapshot(executionResult.summary.fromTermId || '');
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-4 py-2 text-xs font-semibold text-primary hover:bg-surface-raised"
                    >
                      <FileText className="h-4 w-4" />
                      <span>View Captured Snapshot</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setRolloverWizardOpen(false)}
                    className="rounded-md bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* HISTORICAL TERM SNAPSHOT MODAL */}
      {snapshotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-text/40 p-4">
          <div className="w-full max-w-4xl rounded-lg border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <span className="rounded bg-surface-raised px-2 py-0.5 text-[10px] font-semibold text-text-muted">
                  IMMUTABLE HISTORICAL ARCHIVE
                </span>
                <h3 className="mt-1 font-display text-xl font-bold text-text">
                  {viewingSnapshot ? `Term Snapshot: ${viewingSnapshot.termName} (${viewingSnapshot.termCode})` : 'Loading Snapshot...'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSnapshotModalOpen(false)}
                className="text-text-muted hover:text-text"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {snapshotLoading ? (
              <div className="p-12 text-center text-sm text-text-muted">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="mt-3">Retrieving immutable term snapshot...</p>
              </div>
            ) : viewingSnapshot ? (
              <div className="mt-6 max-h-[70vh] space-y-6 overflow-y-auto pr-1">
                {/* Frozen Metrics Grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded border border-border bg-surface-raised p-3">
                    <span className="text-[11px] text-text-muted">Events Held</span>
                    <p className="text-xl font-bold text-text">{viewingSnapshot.metrics.totalEvents}</p>
                  </div>
                  <div className="rounded border border-border bg-surface-raised p-3">
                    <span className="text-[11px] text-text-muted">Total Verified Attendance</span>
                    <p className="text-xl font-bold text-text">{viewingSnapshot.metrics.totalAttendance}</p>
                  </div>
                  <div className="rounded border border-border bg-surface-raised p-3">
                    <span className="text-[11px] text-text-muted">Certificates Issued</span>
                    <p className="text-xl font-bold text-text">{viewingSnapshot.metrics.totalCertificatesIssued}</p>
                  </div>
                  <div className="rounded border border-border bg-surface-raised p-3">
                    <span className="text-[11px] text-text-muted">Passports Generated</span>
                    <p className="text-xl font-bold text-text">{viewingSnapshot.metrics.totalPassportsGenerated}</p>
                  </div>
                  <div className="rounded border border-border bg-surface-raised p-3">
                    <span className="text-[11px] text-text-muted">Tasks Completed</span>
                    <p className="text-xl font-bold text-text">{viewingSnapshot.metrics.totalTasksCompleted}</p>
                  </div>
                  <div className="rounded border border-border bg-surface-raised p-3">
                    <span className="text-[11px] text-text-muted">Tasks Archived</span>
                    <p className="text-xl font-bold text-text">{viewingSnapshot.metrics.totalTasksArchived}</p>
                  </div>
                  <div className="rounded border border-border bg-surface-raised p-3">
                    <span className="text-[11px] text-text-muted">Checklists Signed Off</span>
                    <p className="text-xl font-bold text-text">{viewingSnapshot.metrics.totalChecklistsSignedOff}</p>
                  </div>
                  <div className="rounded border border-border bg-surface-raised p-3">
                    <span className="text-[11px] text-text-muted">Assets Approved</span>
                    <p className="text-xl font-bold text-text">{viewingSnapshot.metrics.totalAssetsApproved}</p>
                  </div>
                </div>

                {/* Frozen Roster Table */}
                <div>
                  <h4 className="font-display text-sm font-bold text-text">
                    Historical Roster Snapshot ({viewingSnapshot.rosterSnapshot.length} Appointments Recorded)
                  </h4>
                  <div className="mt-3 overflow-hidden rounded-lg border border-border">
                    <div className="max-h-60 overflow-y-auto">
                      <table className="min-w-full divide-y divide-border text-left text-xs">
                        <thead className="sticky top-0 bg-surface-raised font-semibold text-text">
                          <tr>
                            <th scope="col" className="px-4 py-2">Member</th>
                            <th scope="col" className="px-4 py-2">Role</th>
                            <th scope="col" className="px-4 py-2">Committee</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border bg-surface">
                          {viewingSnapshot.rosterSnapshot.map((r, idx) => (
                            <tr key={idx} className="hover:bg-surface-raised/40">
                              <td className="whitespace-nowrap px-4 py-2">
                                <span className="font-medium text-text">{r.memberName}</span>
                                <span className="ml-1 text-[11px] text-text-muted">({r.memberEmail})</span>
                              </td>
                              <td className="whitespace-nowrap px-4 py-2">
                                <span className="rounded bg-surface-raised px-2 py-0.5 text-[10px] font-semibold text-primary">
                                  {r.roleName}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-4 py-2 text-text-muted">
                                {r.committeeName || 'Branch-Wide'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border pt-4 text-xs text-text-muted">
                  <span>Captured on {new Date(viewingSnapshot.capturedAt).toLocaleString()}</span>
                  <button
                    type="button"
                    onClick={() => setSnapshotModalOpen(false)}
                    className="rounded-md border border-border px-4 py-1.5 font-semibold text-text hover:bg-surface-raised"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ROLLOVER HISTORY MODAL */}
      {historyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-text/40 p-4">
          <div className="w-full max-w-4xl rounded-lg border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <span className="text-xs font-semibold text-primary">Audit Trail</span>
                <h3 className="font-display text-xl font-bold text-text">Annual Rollover Execution History</h3>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="text-text-muted hover:text-text"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {historyLoading ? (
              <div className="p-8 text-center text-sm text-text-muted">
                <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="mt-2">Loading rollover history...</p>
              </div>
            ) : rolloverHistory.length === 0 ? (
              <div className="p-8 text-center text-sm text-text-muted">
                <History className="mx-auto h-8 w-8 text-text-muted opacity-50" />
                <p className="mt-2 font-medium">No annual rollover executions recorded yet.</p>
              </div>
            ) : (
              <div className="mt-4 max-h-96 overflow-y-auto">
                <table className="min-w-full divide-y divide-border text-left text-xs">
                  <thead className="sticky top-0 bg-surface-raised font-semibold text-text">
                    <tr>
                      <th scope="col" className="px-4 py-2.5">Date</th>
                      <th scope="col" className="px-4 py-2.5">Transition</th>
                      <th scope="col" className="px-4 py-2.5">Status</th>
                      <th scope="col" className="px-4 py-2.5 text-right">Closed</th>
                      <th scope="col" className="px-4 py-2.5 text-right">Seated</th>
                      <th scope="col" className="px-4 py-2.5 text-right">Archived Tasks</th>
                      <th scope="col" className="px-4 py-2.5">Executed By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rolloverHistory.map((h) => (
                      <tr key={h.id} className="hover:bg-surface-raised/40">
                        <td className="whitespace-nowrap px-4 py-3 text-text-muted">
                          {new Date(h.executedAt).toLocaleDateString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-text">
                          {h.fromTermCode || 'Initial'} → {h.toTermCode}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="rounded-pill bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                            {h.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-text-muted">
                          {(h.summary as Record<string, number>)?.outgoingRolesClosedCount ?? 0}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-text-muted">
                          {(h.summary as Record<string, number>)?.incomingRolesCreatedCount ?? 0}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-text-muted">
                          {(h.summary as Record<string, number>)?.tasksArchivedCount ?? 0}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-text-muted">
                          {h.executedByName || h.executedById}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 flex justify-end border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="rounded-md border border-border px-4 py-1.5 text-xs font-semibold text-text hover:bg-surface-raised"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
