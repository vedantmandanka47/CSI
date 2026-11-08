import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  enqueueOfflineOperation,
  getPendingOperations,
  syncPendingOperations,
  clearSyncedOperations,
  getQueueStats,
  QueuedAttendanceOperation,
} from '@/lib/offline-queue';
import { apiClient } from '@/lib/api-client';
import { AttendanceMethod, AttendanceStatus } from '@csi/shared';

interface MockDbRequest<T = unknown> {
  result?: T;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded?: (() => void) | null;
}

interface MockTransaction {
  objectStore: (name: string) => MockObjectStore;
  oncomplete: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  error?: unknown;
}

interface MockObjectStore {
  add: (item: QueuedAttendanceOperation) => MockDbRequest;
  getAll: () => MockDbRequest<QueuedAttendanceOperation[]>;
  get: (key: string) => MockDbRequest<QueuedAttendanceOperation | undefined>;
  put: (item: QueuedAttendanceOperation) => MockDbRequest;
  delete: (key: string) => MockDbRequest;
}

describe('Offline Attendance Queue (IndexedDB) & Sync Reconciliation (TASK-021 / B18 / F06)', () => {
  let mockStore: Map<string, QueuedAttendanceOperation>;

  beforeEach(() => {
    mockStore = new Map<string, QueuedAttendanceOperation>();
    vi.restoreAllMocks();

    const createTransaction = (): MockTransaction => {
      let pendingAsyncCount = 0;
      const tx: MockTransaction = {
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: () => ({
          add: (item: QueuedAttendanceOperation) => {
            mockStore.set(item.client_uuid, item);
            pendingAsyncCount++;
            const req: MockDbRequest = { onsuccess: null, onerror: null };
            setTimeout(() => {
              if (req.onsuccess) req.onsuccess();
              pendingAsyncCount--;
              if (pendingAsyncCount === 0 && tx.oncomplete) tx.oncomplete();
            }, 0);
            return req;
          },
          getAll: () => {
            pendingAsyncCount++;
            const req: MockDbRequest<QueuedAttendanceOperation[]> = {
              result: Array.from(mockStore.values()),
              onsuccess: null,
              onerror: null,
            };
            setTimeout(() => {
              if (req.onsuccess) req.onsuccess();
              pendingAsyncCount--;
              if (pendingAsyncCount === 0 && tx.oncomplete) tx.oncomplete();
            }, 0);
            return req;
          },
          get: (key: string) => {
            pendingAsyncCount++;
            const req: MockDbRequest<QueuedAttendanceOperation | undefined> = {
              result: mockStore.get(key),
              onsuccess: null,
              onerror: null,
            };
            setTimeout(() => {
              if (req.onsuccess) req.onsuccess();
              pendingAsyncCount--;
              if (pendingAsyncCount === 0 && tx.oncomplete) tx.oncomplete();
            }, 0);
            return req;
          },
          put: (item: QueuedAttendanceOperation) => {
            mockStore.set(item.client_uuid, item);
            pendingAsyncCount++;
            const req: MockDbRequest = { onsuccess: null, onerror: null };
            setTimeout(() => {
              if (req.onsuccess) req.onsuccess();
              pendingAsyncCount--;
              if (pendingAsyncCount === 0 && tx.oncomplete) tx.oncomplete();
            }, 0);
            return req;
          },
          delete: (key: string) => {
            mockStore.delete(key);
            pendingAsyncCount++;
            const req: MockDbRequest = { onsuccess: null, onerror: null };
            setTimeout(() => {
              if (req.onsuccess) req.onsuccess();
              pendingAsyncCount--;
              if (pendingAsyncCount === 0 && tx.oncomplete) tx.oncomplete();
            }, 0);
            return req;
          },
        }),
      };

      // If no operations are scheduled, fire oncomplete on next tick
      setTimeout(() => {
        if (pendingAsyncCount === 0 && tx.oncomplete) {
          tx.oncomplete();
        }
      }, 5);

      return tx;
    };

    const fakeDb = {
      objectStoreNames: {
        contains: vi.fn().mockReturnValue(true),
      },
      transaction: vi.fn(() => createTransaction()),
    };

    const fakeIndexedDb = {
      open: vi.fn(() => {
        const req: MockDbRequest<typeof fakeDb> = {
          result: fakeDb,
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
        };
        setTimeout(() => req.onsuccess && req.onsuccess(), 0);
        return req;
      }),
    };

    vi.stubGlobal('window', { indexedDB: fakeIndexedDb });
  });

  it('enqueues an attendance operation with client_uuid and pending status', async () => {
    const item = await enqueueOfflineOperation({
      session_id: '11111111-1111-1111-1111-111111111111',
      method: AttendanceMethod.QR_SCAN,
      payload: 'csi_pass.payload.sig',
    });

    expect(item.client_uuid).toBeDefined();
    expect(item.queue_status).toBe('pending');
    expect(item.client_marked_at).toBeDefined();
    expect(mockStore.has(item.client_uuid)).toBe(true);
  });

  it('retrieves only pending operations for synchronization', async () => {
    await enqueueOfflineOperation({
      session_id: '11111111-1111-1111-1111-111111111111',
      method: AttendanceMethod.QR_SCAN,
      payload: 'csi_pass.payload.1',
    });

    const pending = await getPendingOperations();
    expect(pending.length).toBe(1);
    expect(pending[0]?.queue_status).toBe('pending');
  });

  it('returns null when there are no pending operations to sync', async () => {
    const postSpy = vi.spyOn(apiClient, 'post');
    const result = await syncPendingOperations();

    expect(result).toBeNull();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('unwraps standard API response envelope { data: { results: [...] } } without throwing TypeError (TASK-021 / B18 / F06)', async () => {
    const item = await enqueueOfflineOperation({
      session_id: '11111111-1111-1111-1111-111111111111',
      method: AttendanceMethod.QR_SCAN,
      payload: 'csi_pass.test_token',
    });

    // Simulates standard NestJS API response envelope { data: { ... } }
    const mockApiResponse = {
      data: {
        synced_count: 1,
        conflict_count: 0,
        rejected_count: 0,
        results: [
          {
            client_uuid: item.client_uuid,
            status: AttendanceStatus.VERIFIED,
            message: 'Offline check-in successfully verified and reconciled.',
            record_id: 'record-uuid-1234',
          },
        ],
      },
    };

    vi.spyOn(apiClient, 'post').mockResolvedValueOnce(mockApiResponse as unknown as never);

    const syncResult = await syncPendingOperations();

    expect(syncResult).toBeDefined();
    expect(syncResult?.synced_count).toBe(1);
    expect(syncResult?.results.length).toBe(1);

    // Verify local IndexedDB was updated
    const updated = mockStore.get(item.client_uuid);
    expect(updated).toBeDefined();
    expect(updated?.queue_status).toBe('synced');
    expect(updated?.reconcile_record_id).toBe('record-uuid-1234');
    expect(updated?.reconcile_message).toBe('Offline check-in successfully verified and reconciled.');

    // Pending count must now be 0
    const pending = await getPendingOperations();
    expect(pending.length).toBe(0);
  });

  it('handles partial synchronization outcomes and sets appropriate status per item', async () => {
    const item1 = await enqueueOfflineOperation({
      session_id: '11111111-1111-1111-1111-111111111111',
      method: AttendanceMethod.QR_SCAN,
      payload: 'csi_pass.item1',
    });

    const item2 = await enqueueOfflineOperation({
      session_id: '11111111-1111-1111-1111-111111111111',
      method: AttendanceMethod.MANUAL,
      payload: 'manual-override',
      member_id: '22222222-2222-2222-2222-222222222222',
      notes: 'ID Card shown',
    });

    const item3 = await enqueueOfflineOperation({
      session_id: '11111111-1111-1111-1111-111111111111',
      method: AttendanceMethod.ROTATING_CODE,
      payload: '999999',
      member_id: '33333333-3333-3333-3333-333333333333',
    });

    const mockApiResponse = {
      data: {
        synced_count: 1,
        conflict_count: 1,
        rejected_count: 1,
        results: [
          {
            client_uuid: item1.client_uuid,
            status: AttendanceStatus.VERIFIED,
            message: 'Reconciled successfully.',
            record_id: 'rec-1',
          },
          {
            client_uuid: item2.client_uuid,
            status: AttendanceStatus.FLAGGED_CONFLICT,
            message: 'Duplicate check-in detected.',
            record_id: 'rec-2',
          },
          {
            client_uuid: item3.client_uuid,
            status: AttendanceStatus.REJECTED,
            message: 'ROTATING_CODE invalid.',
          },
        ],
      },
    };

    vi.spyOn(apiClient, 'post').mockResolvedValueOnce(mockApiResponse as unknown as never);

    await syncPendingOperations();

    expect(mockStore.get(item1.client_uuid)?.queue_status).toBe('synced');
    expect(mockStore.get(item2.client_uuid)?.queue_status).toBe('conflict');
    expect(mockStore.get(item3.client_uuid)?.queue_status).toBe('rejected');

    // No items remain pending, preventing infinite re-submission loops
    const pending = await getPendingOperations();
    expect(pending.length).toBe(0);

    const stats = await getQueueStats();
    expect(stats.synced).toBe(1);
    expect(stats.conflict).toBe(1);
    expect(stats.rejected).toBe(1);
    expect(stats.pending).toBe(0);
  });

  it('clears only synced operations and preserves conflict/rejected items for volunteer review', async () => {
    const item1 = await enqueueOfflineOperation({
      session_id: '11111111-1111-1111-1111-111111111111',
      method: AttendanceMethod.QR_SCAN,
      payload: 'item1',
    });

    const item2 = await enqueueOfflineOperation({
      session_id: '11111111-1111-1111-1111-111111111111',
      method: AttendanceMethod.QR_SCAN,
      payload: 'item2',
    });

    // Manually mark one as synced and one as conflict
    const rec1 = mockStore.get(item1.client_uuid)!;
    rec1.queue_status = 'synced';
    mockStore.set(item1.client_uuid, rec1);

    const rec2 = mockStore.get(item2.client_uuid)!;
    rec2.queue_status = 'conflict';
    mockStore.set(item2.client_uuid, rec2);

    await clearSyncedOperations();

    expect(mockStore.has(item1.client_uuid)).toBe(false);
    expect(mockStore.has(item2.client_uuid)).toBe(true);
  });

  it('rejects with descriptive error when server returns invalid non-array results structure', async () => {
    await enqueueOfflineOperation({
      session_id: '11111111-1111-1111-1111-111111111111',
      method: AttendanceMethod.QR_SCAN,
      payload: 'item1',
    });

    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { invalid_key: true },
    } as unknown as never);

    await expect(syncPendingOperations()).rejects.toThrow(
      'Invalid synchronization response structure from server.',
    );
  });
});
