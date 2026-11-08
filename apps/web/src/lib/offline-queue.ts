import {
  AttendanceSyncOperationInput,
  BatchSyncAttendanceResponse,
  AttendanceStatus,
  AttendanceMethod,
} from '@csi/shared';
import { apiClient } from './api-client';

export interface QueuedAttendanceOperation extends AttendanceSyncOperationInput {
  queue_status: 'pending' | 'synced' | 'conflict' | 'rejected' | 'quarantined';
  reconcile_message?: string;
  reconcile_record_id?: string;
  created_at_local: string;
  synced_at?: string;
  marked_by_user_id?: string;
}

const DB_NAME = 'csi_offline_attendance';
const DB_VERSION = 2;
const STORE_NAME = 'pending_operations';

let activeQueueUserId: string | null = null;

/**
 * Configure the active user ID for queue scoping (TASK-025 / F43).
 */
export function setCurrentQueueUserId(userId: string | null): void {
  activeQueueUserId = userId;
}

/**
 * Get current configured queue user ID.
 */
export function getCurrentQueueUserId(): string | null {
  return activeQueueUserId;
}

function resolveEffectiveUserId(explicitUserId?: string): string | undefined {
  return explicitUserId ?? activeQueueUserId ?? undefined;
}

/**
 * Open or initialize browser IndexedDB store.
 */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported or running in server environment.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      let store: IDBObjectStore;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        store = db.createObjectStore(STORE_NAME, { keyPath: 'client_uuid' });
      } else {
        store = request.transaction!.objectStore(STORE_NAME);
      }

      if (!store.indexNames.contains('queue_status')) {
        store.createIndex('queue_status', 'queue_status', { unique: false });
      }
      if (!store.indexNames.contains('session_id')) {
        store.createIndex('session_id', 'session_id', { unique: false });
      }
      if (!store.indexNames.contains('client_marked_at')) {
        store.createIndex('client_marked_at', 'client_marked_at', { unique: false });
      }
      if (!store.indexNames.contains('marked_by_user_id')) {
        store.createIndex('marked_by_user_id', 'marked_by_user_id', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Decodes the payload of a dynamic QR pass without verifying the cryptographic signature.
 * Used for client-side pre-flight expiration validation prior to enqueueing (TASK-023 / B18 / F08).
 */
export function decodeQrPassPayload(
  token: string,
): { sub: string; exp: number; iat: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'csi_pass' || !parts[1]) {
      return null;
    }
    const base64Url = parts[1];
    let jsonStr: string;
    if (typeof Buffer !== 'undefined') {
      jsonStr = Buffer.from(base64Url, 'base64url').toString('utf8');
    } else {
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
      jsonStr = decodeURIComponent(
        Array.prototype.map
          .call(atob(padded), (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      );
    }
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && typeof parsed['exp'] === 'number') {
      return parsed as unknown as { sub: string; exp: number; iat: number };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Enqueue an attendance operation in IndexedDB.
 * Awaits transaction completion (tx.oncomplete) before resolving for durability (TASK-025 / F43).
 */
export async function enqueueOfflineOperation(
  data: Omit<AttendanceSyncOperationInput, 'client_uuid' | 'client_marked_at'> & {
    client_uuid?: string;
    client_marked_at?: string;
  },
  userId?: string,
): Promise<QueuedAttendanceOperation> {
  let resolvedMemberId = data.member_id;

  // Pre-flight check: If QR scan, reject if the pass was already expired at capture time
  if (data.method === AttendanceMethod.QR_SCAN && data.payload) {
    const parsed = decodeQrPassPayload(data.payload);
    if (parsed) {
      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec > parsed.exp + 30) {
        throw new Error('QR pass is already expired. Please ask the attendee to refresh their digital card.');
      }
      const extractedSub = parsed.sub || (parsed as unknown as { user_id?: string }).user_id;
      if (!resolvedMemberId && extractedSub) {
        resolvedMemberId = extractedSub;
      }
    }
  }

  const db = await openDb();
  const clientUuid = data.client_uuid || crypto.randomUUID();
  const nowIso = data.client_marked_at || new Date().toISOString();
  const effectiveUserId = resolveEffectiveUserId(userId);

  const item: QueuedAttendanceOperation = {
    ...data,
    member_id: resolvedMemberId,
    client_uuid: clientUuid,
    client_marked_at: nowIso,
    created_at_local: nowIso,
    queue_status: 'pending',
    marked_by_user_id: effectiveUserId,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(item);

    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    tx.oncomplete = () => resolve(item);
  });
}

/**
 * Retrieve all pending operations awaiting synchronization, optionally filtered by user ID (TASK-025 / F43).
 */
export async function getPendingOperations(userId?: string): Promise<QueuedAttendanceOperation[]> {
  const db = await openDb();
  const effectiveUserId = resolveEffectiveUserId(userId);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      const all = req.result as QueuedAttendanceOperation[];
      const filtered = all.filter((item) => {
        if (item.queue_status !== 'pending') return false;
        if (effectiveUserId && item.marked_by_user_id && item.marked_by_user_id !== effectiveUserId) {
          return false;
        }
        return true;
      });
      resolve(filtered);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieve all operations in the local queue regardless of status, optionally filtered by user ID.
 */
export async function getAllQueuedOperations(userId?: string): Promise<QueuedAttendanceOperation[]> {
  const db = await openDb();
  const effectiveUserId = resolveEffectiveUserId(userId);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      let all = req.result as QueuedAttendanceOperation[];
      if (effectiveUserId) {
        all = all.filter(
          (item) => !item.marked_by_user_id || item.marked_by_user_id === effectiveUserId,
        );
      }
      all.sort(
        (a, b) => new Date(b.created_at_local).getTime() - new Date(a.created_at_local).getTime(),
      );
      resolve(all);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Synchronize all pending operations with the backend API, optionally scoped by user ID.
 */
export async function syncPendingOperations(userId?: string): Promise<BatchSyncAttendanceResponse | null> {
  const pending = await getPendingOperations(userId);
  if (pending.length === 0) {
    return null;
  }

  const payload: { operations: AttendanceSyncOperationInput[] } = {
    operations: pending.map((op) => ({
      client_uuid: op.client_uuid,
      session_id: op.session_id,
      method: op.method,
      payload: op.payload,
      member_id: op.member_id,
      client_marked_at: op.client_marked_at,
      notes: op.notes,
    })),
  };

  const response = await apiClient.post<{ data: BatchSyncAttendanceResponse } | BatchSyncAttendanceResponse>(
    '/attendance/sync',
    payload,
  );

  // Normalize API envelope: unwrap `{ data: ... }` if wrapped (TASK-021 / B18 / F06)
  const syncData: BatchSyncAttendanceResponse =
    response && typeof response === 'object' && 'data' in response && response.data
      ? response.data
      : (response as BatchSyncAttendanceResponse);

  if (!syncData || !Array.isArray(syncData.results)) {
    throw new Error('Invalid synchronization response structure from server.');
  }

  // Update local IndexedDB records with reconciliation result
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const nowIso = new Date().toISOString();

  for (const res of syncData.results) {
    const getReq = store.get(res.client_uuid);
    getReq.onsuccess = () => {
      const existing = getReq.result as QueuedAttendanceOperation | undefined;
      if (existing) {
        let queueStatus: 'synced' | 'conflict' | 'rejected' = 'synced';
        if (res.status === AttendanceStatus.FLAGGED_CONFLICT) queueStatus = 'conflict';
        else if (res.status === AttendanceStatus.REJECTED) queueStatus = 'rejected';

        existing.queue_status = queueStatus;
        existing.reconcile_message = res.message;
        existing.reconcile_record_id = res.record_id;
        existing.synced_at = nowIso;
        store.put(existing);
      }
    };
  }

  // Ensure IndexedDB transaction commits before resolving
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  return syncData;
}

/**
 * Remove resolved records from local IndexedDB (synced records only), optionally scoped by user ID.
 * Awaits transaction completion before resolving.
 */
export async function clearSyncedOperations(userId?: string): Promise<void> {
  const db = await openDb();
  const effectiveUserId = resolveEffectiveUserId(userId);
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const req = store.getAll();

  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      const all = req.result as QueuedAttendanceOperation[];
      for (const item of all) {
        if (item.queue_status === 'synced') {
          if (!effectiveUserId || !item.marked_by_user_id || item.marked_by_user_id === effectiveUserId) {
            store.delete(item.client_uuid);
          }
        }
      }
    };
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    tx.oncomplete = () => resolve();
  });
}

/**
 * Quarantine pending operations on user logout to prevent cross-account sync (TASK-025 / F43).
 * Awaits transaction durability before resolving.
 */
export async function quarantinePendingOperations(userId?: string): Promise<number> {
  const db = await openDb();
  const effectiveUserId = resolveEffectiveUserId(userId);
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const req = store.getAll();
  let quarantinedCount = 0;

  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      const all = req.result as QueuedAttendanceOperation[];
      for (const item of all) {
        if (item.queue_status === 'pending') {
          if (!effectiveUserId || !item.marked_by_user_id || item.marked_by_user_id === effectiveUserId) {
            item.queue_status = 'quarantined';
            item.reconcile_message = 'Quarantined on user logout to prevent cross-account sync.';
            store.put(item);
            quarantinedCount++;
          }
        }
      }
    };
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    tx.oncomplete = () => resolve(quarantinedCount);
  });
}

/**
 * Completely remove all records belonging to a specific user (TASK-025 / F43).
 */
export async function clearUserOfflineQueue(userId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const req = store.getAll();

  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      const all = req.result as QueuedAttendanceOperation[];
      for (const item of all) {
        if (item.marked_by_user_id === userId) {
          store.delete(item.client_uuid);
        }
      }
    };
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    tx.oncomplete = () => resolve();
  });
}

/**
 * Get queue statistics counts, optionally scoped by user ID.
 */
export async function getQueueStats(userId?: string): Promise<{
  pending: number;
  synced: number;
  conflict: number;
  rejected: number;
  quarantined: number;
  total: number;
}> {
  const all = await getAllQueuedOperations(userId);
  let pending = 0;
  let synced = 0;
  let conflict = 0;
  let rejected = 0;
  let quarantined = 0;

  for (const item of all) {
    if (item.queue_status === 'pending') pending++;
    else if (item.queue_status === 'synced') synced++;
    else if (item.queue_status === 'conflict') conflict++;
    else if (item.queue_status === 'rejected') rejected++;
    else if (item.queue_status === 'quarantined') quarantined++;
  }

  return {
    pending,
    synced,
    conflict,
    rejected,
    quarantined,
    total: all.length,
  };
}
