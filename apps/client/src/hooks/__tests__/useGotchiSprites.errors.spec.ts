import { renderHook, waitFor } from '@testing-library/react';
import { clearGotchiSpritesCache, useGotchiSprites } from '../useGotchiSprites';

jest.mock('../../lib/server-url', () => ({
  getAppServerBaseUrl: jest.fn(() => 'http://localhost:3000'),
}));

describe('useGotchiSprites - error mapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearGotchiSpritesCache();
  });

  it('maps snapshot outage responses from /api/aavegotchis', async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('/api/aavegotchis')) {
        return Promise.resolve({
          ok: false,
          status: 503,
          json: async () => ({
            code: 'SNAPSHOT_MISSING',
            date: '2026-02-23',
          }),
        }) as Promise<Response>;
      }
      if (url.includes('/api/gotchis')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ wallet: '0x123', sprites: [] }),
        }) as Promise<Response>;
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }) as jest.Mock;

    const { result } = renderHook(() =>
      useGotchiSprites(true, 'http://localhost:3000')
    );

    await waitFor(() => {
      expect(result.current.errorCode).toBe('SNAPSHOT_MISSING');
    });

    expect(result.current.error).toContain('temporarily unavailable');
    expect(result.current.error).toContain('2026-02-23');
  });

  it('maps ownership-required responses from /api/aavegotchis', async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('/api/aavegotchis')) {
        return Promise.resolve({
          ok: false,
          status: 403,
          json: async () => ({ code: 'WALLET_NOT_ELIGIBLE' }),
        }) as Promise<Response>;
      }
      if (url.includes('/api/gotchis')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ wallet: '0x123', sprites: [] }),
        }) as Promise<Response>;
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }) as jest.Mock;

    const { result } = renderHook(() =>
      useGotchiSprites(true, 'http://localhost:3000')
    );

    await waitFor(() => {
      expect(result.current.errorCode).toBe('WALLET_NOT_ELIGIBLE');
    });

    expect(result.current.error).toContain('ownership requirement');
  });

  it('maps auth-required responses from /api/gotchis', async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('/api/aavegotchis')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            owner: '0x123',
            aavegotchis: [{ id: '123', name: 'Test', equippedWearables: [] }],
          }),
        }) as Promise<Response>;
      }
      if (url.includes('/api/gotchis')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({ error: 'Unauthorized' }),
        }) as Promise<Response>;
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }) as jest.Mock;

    const { result } = renderHook(() =>
      useGotchiSprites(true, 'http://localhost:3000')
    );

    await waitFor(() => {
      expect(result.current.errorCode).toBe('AUTH_REQUIRED');
    });

    expect(result.current.error).toContain('Authentication required');
    expect(result.current.entries).toEqual([]);
  });
});
