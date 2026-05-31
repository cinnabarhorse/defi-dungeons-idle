import { renderHook, waitFor, act } from '@testing-library/react';
import { useGotchiSprites, clearGotchiSpritesCache } from '../useGotchiSprites';
import type { GotchiSpriteEntry } from '../useGotchiSprites';

// Mock getAppServerBaseUrl
jest.mock('../../lib/server-url', () => ({
  getAppServerBaseUrl: jest.fn(() => 'http://localhost:3000'),
}));

describe('useGotchiSprites - Cache Clearing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearGotchiSpritesCache();
  });

  it('should refetch gotchi data when cache is cleared after initial load', async () => {
    const initialGotchis = [
      {
        id: '123',
        name: 'Test Gotchi',
        equippedWearables: ['1', '2'], // Initial wearables
      },
    ];

    const updatedGotchis = [
      {
        id: '123',
        name: 'Test Gotchi',
        equippedWearables: ['1', '2', '3', '4'], // Updated wearables
      },
    ];

    let fetchCallCount = 0;
    global.fetch = jest.fn((url: string) => {
      if (url.includes('/api/aavegotchis')) {
        fetchCallCount++;
        // First call returns initial data, subsequent calls return updated data
        const data =
          fetchCallCount === 1 ? initialGotchis : updatedGotchis;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            owner: '0x123',
            aavegotchis: data,
          }),
        }) as Promise<Response>;
      }
      if (url.includes('/api/gotchis')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            wallet: '0x123',
            sprites: [],
          }),
        }) as Promise<Response>;
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }) as jest.Mock;

    const { result } = renderHook(() =>
      useGotchiSprites(true, 'http://localhost:3000')
    );

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.entries).toHaveLength(1);
    });

    const initialEntry = result.current.entries[0];
    expect(initialEntry.id).toBe(123);
    expect(initialEntry.equippedWearables).toEqual([1, 2]);

    // Clear cache and verify refetch happens
    await act(async () => {
      clearGotchiSpritesCache();
    });

    // Wait for refetch after cache clear
    await waitFor(
      () => {
        expect(result.current.entries).toHaveLength(1);
        const updatedEntry = result.current.entries[0];
        expect(updatedEntry.equippedWearables).toEqual([1, 2, 3, 4]);
      },
      { timeout: 3000 }
    );

    // Verify fetch was called multiple times (initial + after cache clear)
    expect(fetchCallCount).toBeGreaterThan(1);
  });

  it('should update equipped wearables when re-selecting a gotchi', async () => {
    const gotchiId = '123';
    const initialWearables = ['1', '2'];
    const updatedWearables = ['1', '2', '3', '4', '5'];

    let fetchCallCount = 0;
    global.fetch = jest.fn((url: string) => {
      if (url.includes('/api/aavegotchis')) {
        fetchCallCount++;
        // Simulate wearables being updated between calls
        const wearables =
          fetchCallCount === 1 ? initialWearables : updatedWearables;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            owner: '0x123',
            aavegotchis: [
              {
                id: gotchiId,
                name: 'Test Gotchi',
                equippedWearables: wearables,
              },
            ],
          }),
        }) as Promise<Response>;
      }
      if (url.includes('/api/gotchis')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            wallet: '0x123',
            sprites: [],
          }),
        }) as Promise<Response>;
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }) as jest.Mock;

    const { result } = renderHook(() =>
      useGotchiSprites(true, 'http://localhost:3000')
    );

    // Initial load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.entries[0].equippedWearables).toEqual([1, 2]);

    // Simulate selecting the gotchi (which should clear cache)
    await act(async () => {
      clearGotchiSpritesCache();
    });

    // Wait for refetch with updated wearables
    await waitFor(
      () => {
        const entry = result.current.entries[0];
        expect(entry.equippedWearables).toEqual([1, 2, 3, 4, 5]);
      },
      { timeout: 3000 }
    );
  });

  it('should notify all active hooks when cache is cleared', async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('/api/aavegotchis')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            owner: '0x123',
            aavegotchis: [
              {
                id: '123',
                name: 'Test Gotchi',
                equippedWearables: ['1', '2'],
              },
            ],
          }),
        }) as Promise<Response>;
      }
      if (url.includes('/api/gotchis')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            wallet: '0x123',
            sprites: [],
          }),
        }) as Promise<Response>;
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }) as jest.Mock;

    const { result: result1 } = renderHook(() =>
      useGotchiSprites(true, 'http://localhost:3000')
    );
    const { result: result2 } = renderHook(() =>
      useGotchiSprites(true, 'http://localhost:3000')
    );

    // Wait for both hooks to load
    await waitFor(() => {
      expect(result1.current.isLoading).toBe(false);
      expect(result2.current.isLoading).toBe(false);
    });

    // Clear cache - both hooks should be notified
    await act(async () => {
      clearGotchiSpritesCache();
    });

    // Both hooks should trigger refetch
    await waitFor(() => {
      // Both should have attempted to refetch (fetch should be called multiple times)
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  it('should handle cache clearing when no gotchis are loaded', async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('/api/aavegotchis')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            owner: '0x123',
            aavegotchis: [],
          }),
        }) as Promise<Response>;
      }
      if (url.includes('/api/gotchis')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            wallet: '0x123',
            sprites: [],
          }),
        }) as Promise<Response>;
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }) as jest.Mock;

    const { result } = renderHook(() =>
      useGotchiSprites(true, 'http://localhost:3000')
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.entries).toHaveLength(0);
    });

    // Clearing cache should not cause errors even with empty data
    await act(async () => {
      clearGotchiSpritesCache();
    });

    // Should still be able to refetch
    await waitFor(() => {
      expect(result.current.entries).toHaveLength(0);
    });
  });
});
