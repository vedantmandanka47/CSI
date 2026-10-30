'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import {
  enqueueOfflineOperation,
  getAllQueuedOperations,
  syncPendingOperations,
  clearSyncedOperations,
  getQueueStats,
  QueuedAttendanceOperation,
} from '@/lib/offline-queue';
import {
  AttendanceSession,
  AttendanceRecord,
  AttendanceMethod,
  RoleCode,
  PermissionCode,
} from '@csi/shared';
import {
  QrCode,
  KeyRound,
  UserCheck,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Layers,
  ArrowLeft,
  Camera,
  Trash2,
} from 'lucide-react';

export default function VolunteerScannerPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'qr' | 'totp' | 'manual'>('qr');

  // Input states
  const [qrTokenInput, setQrTokenInput] = useState('');
  const [totpCodeInput, setTotpCodeInput] = useState('');
  const [memberIdInput, setMemberIdInput] = useState('');
  const [manualNotes, setManualNotes] = useState('');

  // Queue and feedback states
  const [processing, setProcessing] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    title: string;
    message: string;
  } | null>(null);

  const [queueStats, setQueueStats] = useState({
    pending: 0,
    synced: 0,
    conflict: 0,
    rejected: 0,
    total: 0,
  });
  const [queuedItems, setQueuedItems] = useState<QueuedAttendanceOperation[]>([]);
  const [showQueueDrawer, setShowQueueDrawer] = useState(false);

  // Camera mock/viewfinder state
  const [cameraActive, setCameraActive] = useState(false);

  const isAuthorized =
    user &&
    (user.roles.includes(RoleCode.PRESIDENT) ||
      user.roles.includes(RoleCode.VP) ||
      user.roles.includes(RoleCode.CORE) ||
      user.roles.includes(RoleCode.SUBCORE) ||
      user.roles.includes(RoleCode.COMMITTEE) ||
      user.roles.includes(RoleCode.ADMIN) ||
      user.permissions.includes(PermissionCode.ATTENDANCE_TAKE));

  // Network listener
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    setIsOnline(navigator.onLine);
    const handleOnline = () => {
      setIsOnline(true);
      void handleSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Refresh queue stats
  const refreshQueue = useCallback(async () => {
    try {
      const stats = await getQueueStats();
      setQueueStats(stats);
      const items = await getAllQueuedOperations();
      setQueuedItems(items);
    } catch {
      // ignore
    }
  }, []);

  // Fetch open sessions
  const fetchSessions = useCallback(async () => {
    try {
      // Find open events
      const res = await apiClient.get<{ data: Array<{ id: string }> }>('/events?status=upcoming&per_page=10');
      if (res.data.length > 0) {
        const allSessions: AttendanceSession[] = [];
        for (const evt of res.data) {
          try {
            const sRes = await apiClient.get<{ data: AttendanceSession[] }>(
              `/events/${evt.id}/attendance-sessions`,
            );
            allSessions.push(...sRes.data.filter((s) => s.is_open));
          } catch {
            // ignore
          }
        }
        setSessions(allSessions);
        if (allSessions.length > 0 && !selectedSessionId) {
          setSelectedSessionId(allSessions[0]?.id ?? '');
        }
      }
    } catch {
      // fallback
    }
  }, [selectedSessionId]);

  useEffect(() => {
    if (isAuthenticated && isAuthorized) {
      void fetchSessions();
      void refreshQueue();
    }
  }, [isAuthenticated, isAuthorized, fetchSessions, refreshQueue]);

  // Handle Sync
  const handleSync = async () => {
    setProcessing(true);
    try {
      const res = await syncPendingOperations();
      if (res) {
        setFeedback({
          type: res.conflict_count > 0 ? 'warning' : 'success',
          title: 'Offline Queue Synchronized',
          message: `Reconciled ${res.synced_count} marks. Conflicts: ${res.conflict_count}. Rejected: ${res.rejected_count}.`,
        });
      }
      await refreshQueue();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        title: 'Sync Failed',
        message: err instanceof Error ? err.message : 'Failed to reach cloud verification endpoint.',
      });
    } finally {
      setProcessing(false);
    }
  };

  // QR Check-In Submission
  const handleQrSubmit = async () => {
    if (!selectedSessionId || !qrTokenInput.trim()) {
      setFeedback({
        type: 'error',
        title: 'Input Missing',
        message: 'Please select a session and provide a member QR token.',
      });
      return;
    }

    setProcessing(true);
    setFeedback(null);

    const clientUuid = crypto.randomUUID();

    if (!isOnline) {
      // Store in IndexedDB
      try {
        await enqueueOfflineOperation({
          session_id: selectedSessionId,
          method: AttendanceMethod.QR_SCAN,
          payload: qrTokenInput.trim(),
        });
        setFeedback({
          type: 'warning',
          title: 'Queued Offline (IndexedDB)',
          message: `Device is offline. Check-in queued locally (${clientUuid.slice(0, 8)}). Will auto-sync when online.`,
        });
        setQrTokenInput('');
        await refreshQueue();
      } catch (err: unknown) {
        setFeedback({
          type: 'error',
          title: 'Queue Failed',
          message: err instanceof Error ? err.message : 'Could not write to local IndexedDB store.',
        });
      } finally {
        setProcessing(false);
      }
      return;
    }

    // Online verification
    try {
      const res = await apiClient.post<{ data: AttendanceRecord }>('/attendance/check-in/qr', {
        session_id: selectedSessionId,
        qr_token: qrTokenInput.trim(),
        client_uuid: clientUuid,
      });

      setFeedback({
        type: 'success',
        title: 'Check-In Verified',
        message: `Verified Active Student Attendance (${res.data.id.slice(0, 8)}).`,
      });
      setQrTokenInput('');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setFeedback({
          type: 'error',
          title: err.code,
          message: err.message,
        });
      } else {
        // Fallback to queue if network dropped mid-request
        await enqueueOfflineOperation({
          session_id: selectedSessionId,
          method: AttendanceMethod.QR_SCAN,
          payload: qrTokenInput.trim(),
        });
        setFeedback({
          type: 'warning',
          title: 'Network Interrupted — Queued Locally',
          message: 'Saved to IndexedDB offline queue.',
        });
        setQrTokenInput('');
        await refreshQueue();
      }
    } finally {
      setProcessing(false);
    }
  };

  // TOTP Check-In Submission
  const handleTotpSubmit = async () => {
    if (!selectedSessionId || !totpCodeInput.trim() || !memberIdInput.trim()) {
      setFeedback({
        type: 'error',
        title: 'Input Missing',
        message: 'Please provide session, 6-digit TOTP code, and member UUID.',
      });
      return;
    }

    setProcessing(true);
    setFeedback(null);
    const clientUuid = crypto.randomUUID();

    if (!isOnline) {
      await enqueueOfflineOperation({
        session_id: selectedSessionId,
        method: AttendanceMethod.ROTATING_CODE,
        payload: totpCodeInput.trim(),
        member_id: memberIdInput.trim(),
      });
      setFeedback({
        type: 'warning',
        title: 'Queued Offline (IndexedDB)',
        message: 'Saved 6-digit code check-in locally.',
      });
      setTotpCodeInput('');
      setMemberIdInput('');
      await refreshQueue();
      setProcessing(false);
      return;
    }

    try {
      const res = await apiClient.post<{ data: AttendanceRecord }>('/attendance/check-in/totp', {
        session_id: selectedSessionId,
        totp_code: totpCodeInput.trim(),
        member_id: memberIdInput.trim(),
        client_uuid: clientUuid,
      });

      setFeedback({
        type: 'success',
        title: 'TOTP Check-In Verified',
        message: `Verified Attendance record (${res.data.id.slice(0, 8)}).`,
      });
      setTotpCodeInput('');
      setMemberIdInput('');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setFeedback({ type: 'error', title: err.code, message: err.message });
      } else {
        setFeedback({ type: 'error', title: 'Error', message: 'Failed to verify TOTP code.' });
      }
    } finally {
      setProcessing(false);
    }
  };

  // Manual Override Submission
  const handleManualSubmit = async () => {
    if (!selectedSessionId || !memberIdInput.trim() || !manualNotes.trim()) {
      setFeedback({
        type: 'error',
        title: 'Missing Note',
        message: 'Manual check-in requires member ID and an explicit verification reason.',
      });
      return;
    }

    setProcessing(true);
    setFeedback(null);
    const clientUuid = crypto.randomUUID();

    try {
      const res = await apiClient.post<{ data: AttendanceRecord }>('/attendance/check-in/manual', {
        session_id: selectedSessionId,
        member_id: memberIdInput.trim(),
        notes: manualNotes.trim(),
        client_uuid: clientUuid,
      });

      setFeedback({
        type: 'success',
        title: 'Manual Attendance Recorded',
        message: `Override recorded with audit log (${res.data.id.slice(0, 8)}).`,
      });
      setMemberIdInput('');
      setManualNotes('');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setFeedback({ type: 'error', title: err.code, message: err.message });
      } else {
        setFeedback({ type: 'error', title: 'Error', message: 'Manual override failed.' });
      }
    } finally {
      setProcessing(false);
    }
  };

  if (authLoading) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl items-center justify-center px-4 py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-text-muted">Loading scanning station...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !isAuthorized) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl flex-col items-center justify-center px-4 py-12 text-center">
        <div className="rounded-full bg-danger/10 p-4 ring-8 ring-danger/5">
          <AlertTriangle className="h-10 w-10 text-danger" />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-text">
          Volunteer Authorization Required
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Only authorized CSI GCET volunteers and committee members may scan student attendance passes.
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

  return (
    <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Top Breadcrumb */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/admin/attendance"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted transition-colors hover:text-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Attendance Management Hub</span>
        </Link>

        {/* Connectivity Pill */}
        <div className="flex items-center gap-2">
          {isOnline ? (
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-success/10 px-3 py-1 text-xs font-semibold text-success">
              <Wifi className="h-3.5 w-3.5" />
              <span>Online (Cloud Verified)</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-highlight/20 px-3 py-1 text-xs font-semibold text-warning">
              <WifiOff className="h-3.5 w-3.5" />
              <span>Offline (IndexedDB Active)</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowQueueDrawer(!showQueueDrawer)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1 text-xs font-semibold text-text hover:bg-surface-raised"
          >
            <Layers className="h-3.5 w-3.5 text-primary" />
            <span>Queue ({queueStats.pending})</span>
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="border-b border-border pb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
          Volunteer Check-In Station
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Fast verification of student attendees via cryptographic QR pass, 6-digit TOTP, or manual entry.
        </p>
      </div>

      {/* Session Selection */}
      <div className="mt-6 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted">
          Active Attendance Session
        </label>
        {sessions.length === 0 ? (
          <p className="mt-2 text-xs font-medium text-warning">
            No open attendance sessions found. Please open an attendance session in the Management Hub.
          </p>
        ) : (
          <select
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className="mt-2 w-full rounded-md border border-border bg-surface p-2.5 text-sm font-semibold text-text focus:border-primary focus:outline-none"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} (Audience: {s.audience})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Scanner Mode Tabs */}
      <div className="mt-6 flex border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab('qr')}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-semibold transition-colors ${
            activeTab === 'qr'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-text'
          }`}
        >
          <QrCode className="h-4 w-4" />
          <span>Dynamic QR Pass</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('totp')}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-semibold transition-colors ${
            activeTab === 'totp'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-text'
          }`}
        >
          <KeyRound className="h-4 w-4" />
          <span>6-Digit Code</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('manual')}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-semibold transition-colors ${
            activeTab === 'manual'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-text'
          }`}
        >
          <UserCheck className="h-4 w-4" />
          <span>Manual Override</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`mt-6 flex items-start gap-3 rounded-lg border p-4 shadow-sm ${
            feedback.type === 'success'
              ? 'border-success/30 bg-success/10 text-success'
              : feedback.type === 'warning'
              ? 'border-warning/30 bg-highlight/20 text-warning'
              : 'border-danger/30 bg-danger/10 text-danger'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          ) : feedback.type === 'warning' ? (
            <Clock className="h-5 w-5 flex-shrink-0" />
          ) : (
            <XCircle className="h-5 w-5 flex-shrink-0" />
          )}
          <div>
            <h4 className="font-display text-sm font-bold">{feedback.title}</h4>
            <p className="mt-0.5 text-xs">{feedback.message}</p>
          </div>
        </div>
      )}

      {/* Tab Panels */}
      <div className="mt-6 rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        {/* TAB 1: QR PASS SCANNER */}
        {activeTab === 'qr' && (
          <div className="space-y-6">
            <div className="rounded-lg border-2 border-dashed border-border bg-surface-raised p-8 text-center">
              <Camera className="mx-auto h-12 w-12 text-primary" />
              <h3 className="mt-2 font-display text-base font-bold text-text">
                Camera / Optical Scanner
              </h3>
              <p className="mt-1 text-xs text-text-muted">
                Point student screen at camera, or use Bluetooth 2D barcode handheld gun.
              </p>

              <button
                type="button"
                onClick={() => setCameraActive(!cameraActive)}
                className="mt-4 rounded-md border border-border bg-surface px-4 py-2 text-xs font-semibold text-text shadow-sm hover:bg-surface-raised"
              >
                {cameraActive ? 'Stop Camera Stream' : 'Activate Viewfinder'}
              </button>

              {cameraActive && (
                <div className="mt-4 mx-auto max-w-sm overflow-hidden rounded-lg border border-border bg-black aspect-video flex items-center justify-center text-xs text-text-muted">
                  <p className="text-white font-mono text-xs animate-pulse">
                    [Viewfinder Active: Ready for Optical Scan]
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Scanned QR Pass Payload Token
              </label>
              <div className="mt-2 flex gap-3">
                <input
                  type="text"
                  placeholder="Paste or scan token (e.g. csi_pass.eyJ...)"
                  value={qrTokenInput}
                  onChange={(e) => setQrTokenInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleQrSubmit();
                  }}
                  className="flex-1 rounded-md border border-border bg-surface p-2.5 font-mono text-xs text-text focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleQrSubmit()}
                  disabled={processing || !qrTokenInput.trim()}
                  className="rounded-md bg-primary px-6 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {processing ? 'Verifying...' : 'Verify Pass'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TOTP 6-DIGIT CODE */}
        {activeTab === 'totp' && (
          <div className="space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-semibold text-text-muted">
                Member ID (UUID)
              </label>
              <input
                type="text"
                placeholder="Target student User UUID"
                value={memberIdInput}
                onChange={(e) => setMemberIdInput(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-surface p-2.5 text-xs font-mono text-text focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted">
                6-Digit Time-Based Code
              </label>
              <input
                type="text"
                maxLength={6}
                placeholder="e.g. 583921"
                value={totpCodeInput}
                onChange={(e) => setTotpCodeInput(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-surface p-3 font-mono text-xl tracking-widest text-primary focus:border-primary focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => void handleTotpSubmit()}
              disabled={processing || !totpCodeInput.trim() || !memberIdInput.trim()}
              className="mt-2 w-full rounded-md bg-primary py-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {processing ? 'Validating...' : 'Verify Code & Check In'}
            </button>
          </div>
        )}

        {/* TAB 3: MANUAL OVERRIDE */}
        {activeTab === 'manual' && (
          <div className="space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-semibold text-text-muted">
                Student Member UUID
              </label>
              <input
                type="text"
                placeholder="Member User ID"
                value={memberIdInput}
                onChange={(e) => setMemberIdInput(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-surface p-2.5 text-xs font-mono text-text focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted">
                Mandatory Verification Reason
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Student forgot mobile phone; identity confirmed via College ID card."
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-surface p-2.5 text-xs text-text focus:border-primary focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => void handleManualSubmit()}
              disabled={processing || !memberIdInput.trim() || !manualNotes.trim()}
              className="mt-2 w-full rounded-md bg-primary py-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {processing ? 'Recording...' : 'Record Manual Attendance'}
            </button>
          </div>
        )}
      </div>

      {/* Offline Queue Drawer / Section */}
      {showQueueDrawer && (
        <div className="mt-8 rounded-xl border border-border bg-surface p-6 shadow-md">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                <h3 className="font-display text-base font-bold text-text">
                  Browser IndexedDB Offline Queue
                </h3>
              </div>
              <p className="mt-0.5 text-xs text-text-muted">
                Locally buffered check-ins preserved across browser refreshes and network dropouts.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSync()}
                disabled={processing || queueStats.pending === 0}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${processing ? 'animate-spin' : ''}`} />
                <span>Sync Now</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  await clearSyncedOperations();
                  await refreshQueue();
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-raised"
              >
                <Trash2 className="h-3.5 w-3.5 text-text-muted" />
                <span>Clear Synced</span>
              </button>
            </div>
          </div>

          {/* Queue Items Table */}
          <div className="mt-4 overflow-x-auto">
            {queuedItems.length === 0 ? (
              <p className="text-center text-xs text-text-muted py-6">
                Offline queue is empty.
              </p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-surface-raised font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  <tr>
                    <th className="px-3 py-2">Operation UUID</th>
                    <th className="px-3 py-2">Method</th>
                    <th className="px-3 py-2">Recorded At</th>
                    <th className="px-3 py-2">Queue Status</th>
                    <th className="px-3 py-2">Reconciliation Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {queuedItems.map((item) => (
                    <tr key={item.client_uuid}>
                      <td className="px-3 py-2 font-mono text-primary font-medium">
                        {item.client_uuid.slice(0, 8)}...
                      </td>
                      <td className="px-3 py-2 font-mono uppercase text-[11px]">
                        {item.method}
                      </td>
                      <td className="px-3 py-2 text-text-muted">
                        {new Date(item.client_marked_at).toLocaleTimeString('en-IN')}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            item.queue_status === 'synced'
                              ? 'bg-success/10 text-success'
                              : item.queue_status === 'conflict'
                              ? 'bg-highlight/20 text-warning'
                              : item.queue_status === 'rejected'
                              ? 'bg-danger/10 text-danger'
                              : 'bg-surface-raised text-text-muted'
                          }`}
                        >
                          {item.queue_status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-text-muted">
                        {item.reconcile_message || 'Pending network sync'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
