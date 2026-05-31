import { act, renderHook, waitFor } from '@testing-library/react';
import { useProgression } from '../useProgression';
import { TOPUP_DEPOSIT_CREDITED_EVENT } from '../../lib/topup/events';

jest.mock('../../lib/server-url', () => ({
  getAppServerBaseUrl: () => 'https://api.test.com',
}));

function createOkResponse(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

describe('useProgression', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('retries staked-balance refresh after a credited topup event', async () => {
    jest.useFakeTimers();

    const fallbackResponse = {
      usdc: 0,
      gho: 0,
      ghst: 5,
      total: 0,
      accessibleTiers: ['normal'],
    };
    const stakedResponses = [
      { usdc: 0, gho: 0, ghst: 4, total: 0, accessibleTiers: ['normal'] },
      { usdc: 0, gho: 0, ghst: 5, total: 0, accessibleTiers: ['normal'] },
      fallbackResponse,
    ];

    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/player/staked-balance')) {
        return createOkResponse(stakedResponses.shift() ?? fallbackResponse);
      }
      return createOkResponse({});
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() =>
      useProgression('player-123', { skipInitialFetch: true })
    );

    act(() => {
      window.dispatchEvent(new CustomEvent(TOPUP_DEPOSIT_CREDITED_EVENT));
    });

    await waitFor(() => {
      expect(result.current.stakedGhstBalance).toBe(4);
    });

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(result.current.stakedGhstBalance).toBe(5);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test.com/api/player/staked-balance',
      expect.objectContaining({
        credentials: 'include',
        cache: 'no-store',
      })
    );
  });
});
