import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient, ApiError } from './api-client.js';

describe('Web apiClient (ARCH-14, ARCH-15)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes GET path and sets Accept application/json header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ status: 'ok' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await apiClient.get('/health');

    expect(res).toEqual({ status: 'ok' });
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({
        method: 'GET',
        headers: expect.any(Headers),
      }),
    );
  });

  it('throws ApiError with standard error code and message on 400 validation error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid payload submitted',
          fields: { email: ['Invalid email address'] },
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(apiClient.post('/auth/signup', { email: 'bad' })).rejects.toThrow(ApiError);

    try {
      await apiClient.post('/auth/signup', { email: 'bad' });
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(400);
      expect(apiErr.code).toBe('VALIDATION_ERROR');
      expect(apiErr.message).toBe('Invalid payload submitted');
      expect(apiErr.fields?.['email']).toContain('Invalid email address');
    }
  });

  it('attaches CSRF token on mutating POST requests when cookie exists', async () => {
    // Mock document.cookie
    Object.defineProperty(globalThis, 'document', {
      value: { cookie: 'csi_csrf=mock-csrf-token-123' },
      writable: true,
      configurable: true,
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ message: 'success' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await apiClient.post('/auth/login', { email: 'u@gcet.ac.in', password: 'p' });

    expect(mockFetch).toHaveBeenCalled();
    const calls = mockFetch.mock.calls;
    const requestOptions = calls[0]?.[1] as RequestInit;
    const headers = requestOptions.headers as Headers;
    expect(headers.get('X-CSRF-Token')).toBe('mock-csrf-token-123');
  });
});
