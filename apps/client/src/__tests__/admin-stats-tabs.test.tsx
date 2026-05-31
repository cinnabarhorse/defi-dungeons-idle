/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminStatsClient } from '../app/admin/stats/admin-stats-client';

jest.mock('../lib/server-url', () => ({
  getAppServerBaseUrl: jest.fn(() => 'https://gotchi.test'),
}));

const ACTIVITY_ENDPOINTS = [
  '/api/stats/matches-per-day',
  '/api/stats/daily-runs-used',
  '/api/stats/competition-runs-used',
  '/api/stats/trade-run-tokens-per-day',
  '/api/stats/trade-run-directions-per-day',
  '/api/stats/trade-run-leverage-per-day',
  '/api/stats/active-users',
];

const ECONOMY_ENDPOINTS = [
  '/api/stats/token-allocations-per-day',
  '/api/stats/withdrawals-per-day',
  '/api/stats/gold-earned-per-day',
  '/api/stats/gold-total-per-day',
  '/api/stats/lick-tongues-earned-per-day',
  '/api/stats/lick-tongues-spent-per-day',
  '/api/stats/lick-tongues-total-per-day',
];

function buildSeriesResponse(series: unknown[] = []) {
  return {
    series,
    from: '2026-03-01T00:00:00.000Z',
    to: '2026-03-30T23:59:59.999Z',
  };
}

function buildResponseForPath(pathname: string) {
  switch (pathname) {
    case '/api/stats/trade-run-tokens-per-day':
      return buildSeriesResponse([
        { day: '2026-03-20', btc: 4, eth: 2, ghst: 1 },
      ]);
    case '/api/stats/trade-run-directions-per-day':
      return buildSeriesResponse([
        { day: '2026-03-20', long: 5, short: 2 },
      ]);
    case '/api/stats/trade-run-leverage-per-day':
      return buildSeriesResponse([
        {
          day: '2026-03-20',
          leverageCounts: [
            { leverage: 1, count: 1 },
            { leverage: 5, count: 3 },
            { leverage: 10, count: 2 },
          ],
        },
      ]);
    case '/api/stats/active-users':
      return {
        series: [{ day: '2026-03-20', dau: 13, mau: 42 }],
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-03-30T23:59:59.999Z',
      };
    default:
      return buildSeriesResponse();
  }
}

function getRequestedPaths() {
  return Array.from(
    new Set(
      (global.fetch as jest.Mock).mock.calls.map(([input]) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        return new URL(url).pathname;
      })
    )
  );
}

describe('AdminStatsClient stats tabs', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const pathname = new URL(url).pathname;
      return {
        ok: true,
        status: 200,
        json: async () => buildResponseForPath(pathname),
      } as Response;
    }) as jest.Mock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('loads only the active category and fetches other categories on demand', async () => {
    render(<AdminStatsClient />);

    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText('Matches per day')).toBeInTheDocument();
    expect(screen.queryByText('Gold earned per day')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(getRequestedPaths()).toEqual(expect.arrayContaining(ACTIVITY_ENDPOINTS));
    });

    for (const endpoint of ECONOMY_ENDPOINTS) {
      expect(getRequestedPaths()).not.toContain(endpoint);
    }

    fireEvent.click(screen.getByRole('tab', { name: 'Economy' }));

    expect(screen.getByRole('tab', { name: 'Economy' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText('Gold earned per day')).toBeInTheDocument();

    await waitFor(() => {
      expect(getRequestedPaths()).toEqual(expect.arrayContaining(ECONOMY_ENDPOINTS));
    });
  });
});
