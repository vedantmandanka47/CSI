import {
  AttendanceSyncOperationInput,
  BatchSyncAttendanceResponse,
  AttendanceStatus,
} from '@csi/shared';
import { apiClient } from './api-client';

export interface QueuedAttendanceOperation extends AttendanceSyncOperationInput {
  queue_status: 'pending' | 'synced' | 'conflict' | 'rejected';
  reconcile_message?: string;
  reconcile_record_id?: string;
  created_at_local: string;
  synced_at?: string;
}

const DB_NAME = 'csi_offline_attendance';
const DB_VERSION = 1;
const STORE_NAME = 'pending_operations';

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
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'client_uuid' });
        store.createIndex('queue_status', 'queue_status', { unique: false });
        store.createIndex('session_id', 'session_id', { unique: false });
        store.createIndex('client_marked_at', 'client_marked_at', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Enqueue an attendance operation in IndexedDB.
 */
export async function enqueueOfflineOperation(
  data: Omit<AttendanceSyncOperationInput, 'client_uuid' | 'client_marked_at'>,
): Promise<QueuedAttendanceOperation> {
  const db = await openDb();
  const clientUuid = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  const item: QueuedAttendanceOperation = {
    ...data,
    client_uuid: clientUuid,
    client_marked_at: nowIso,
    created_at_local: nowIso,
    queue_status: 'pending',
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(item);

    req.onsuccess = () => resolve(item);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieve all pending operations awaiting synchronization.
 */
export async function getPendingOperations(): Promise<QueuedAttendanceOperation[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      const all = req.result as QueuedAttendanceOperation[];
      resolve(all.filter((item) => item.queue_status === 'pending'));
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieve all operations in the local queue regardless of status.
 */
export async function getAllQueuedOperations(): Promise<QueuedAttendanceOperation[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      const all = (req.result as QueuedAttendanceOperation[]).sort(
        (a, b) => new Date(b.created_at_local).getTime() - new Date(a.created_at_local).getTime(),
      );
      resolve(all);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Synchronize all pending operations with the backend API.
 */
export async function syncPendingOperations(): Promise<BatchSyncAttendanceResponse | null> {
  const pending = await getPendingOperations();
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

  const response = await apiClient.post<BatchSyncAttendanceResponse>('/attendance/sync', payload);

  // Update local IndexedDB records with reconciliation result
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const nowIso = new Date().toISOString();

  for (const res of response.results) {
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

  return response;
}

/**
 * Remove resolved records from local IndexedDB (synced records only).
 */
export async function clearSyncedOperations(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const req = store.getAll();

  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      const all = req.result as QueuedAttendanceOperation[];
      for (const item of all) {
        if (item.queue_status === 'synced') {
          store.delete(item.client_uuid);
        }
      }
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get queue statistics counts.
 */
export async function getQueueStats(): Promise<{
  pending: number;
  synced: number;
  conflict: number;
  rejected: number;
  total: number;
}> {
  const all = await getAllQueuedOperations();
  let pending = 0;
  let synced = 0;
  let conflict = 0;
  let rejected = 0;

  for (const item of all) {
    if (item.queue_status === 'pending') pending++;
    else if (item.queue_status === 'synced') synced++;
    else if (item.queue_status === 'conflict') conflict++;
    else if (item.queue_status === 'rejected') rejected++;
  }

  return {
    pending,
    synced,
    conflict,
    rejected,
    total: all.length,
  };
}
