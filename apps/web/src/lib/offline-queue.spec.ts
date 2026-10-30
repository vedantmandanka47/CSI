import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enqueueOfflineOperation, getPendingOperations, QueuedAttendanceOperation } from './offline-queue';
import { AttendanceMethod } from '@csi/shared';

interface MockDbRequest<T = unknown> {
  result?: T;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded?: (() => void) | null;
}

describe('Offline Attendance Queue (IndexedDB) (M9)', () => {
  let mockStore: Map<string, QueuedAttendanceOperation>;

  beforeEach(() => {
    mockStore = new Map<string, QueuedAttendanceOperation>();

    const fakeDb = {
      objectStoreNames: {
        contains: vi.fn().mockReturnValue(true),
      },
      transaction: vi.fn(() => ({
        objectStore: vi.fn(() => ({
          add: vi.fn((item: QueuedAttendanceOperation) => {
            mockStore.set(item.client_uuid, item);
            const req: MockDbRequest = { onsuccess: null, onerror: null };
            setTimeout(() => req.onsuccess && req.onsuccess(), 0);
            return req;
          }),
          getAll: vi.fn(() => {
            const req: MockDbRequest<QueuedAttendanceOperation[]> = {
              result: Array.from(mockStore.values()),
              onsuccess: null,
              onerror: null,
            };
            setTimeout(() => req.onsuccess && req.onsuccess(), 0);
            return req;
          }),
        })),
      })),
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
});
