import { act, renderHook, waitFor } from '@testing-library/react';
import { useDailyRuns } from '../useDailyRuns';
import { clearFetchDedupeCache, fetchDedupe } from '../../lib/fetch-dedupe';
import { TOPUP_DEPOSIT_CREDITED_EVENT } from '../../lib/topup/events';

jest.mock('../../lib/fetch-dedupe', () => ({
  fetchDedupe: jest.fn(),
  clearFetchDedupeCache: jest.fn(),
}));

jest.mock('../../lib/server-url', () => ({
  getAppServerBaseUrl: () => 'https://api.test.com',
}));

const mockFetchDedupe = fetchDedupe as jest.MockedFunction<typeof fetchDedupe>;
const mockClearFetchDedupeCache =
  clearFetchDedupeCache as jest.MockedFunction<typeof clearFetchDedupeCache>;

function createOkResponse(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

describe('useDailyRuns', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchDedupe.mockResolvedValue(
      createOkResponse({
        date: '2026-02-06',
        resetAtUtc: '2026-02-07T00:00:00.000Z',
        usdcStaked: 0,
        ghoStaked: 0,
        ghstStaked: 1,
        totalStaked: 1,
        allowedRuns: 5,
        usedRuns: 0,
        remainingRuns: 5,
        tiers: [],
      })
    );
  });

  it('refreshes when a topup deposit is credited event is emitted', async () => {
    renderHook(() => useDailyRuns('player-123'));

    await waitFor(() => {
      expect(mockFetchDedupe).toHaveBeenCalledTimes(1);
    });

    act(() => {
      window.dispatchEvent(new CustomEvent(TOPUP_DEPOSIT_CREDITED_EVENT));
    });

    await waitFor(() => {
      expect(mockFetchDedupe).toHaveBeenCalledTimes(2);
    });
    expect(mockClearFetchDedupeCache).toHaveBeenCalledTimes(1);
  });
});
