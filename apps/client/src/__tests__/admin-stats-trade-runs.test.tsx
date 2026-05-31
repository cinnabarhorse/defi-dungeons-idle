/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminStatsClient } from '../app/admin/stats/admin-stats-client';

jest.mock('../lib/server-url', () => ({
  getAppServerBaseUrl: jest.fn(() => 'https://gotchi.test'),
}));

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
    case '/api/stats/gold-spent-breakdown':
      return {
        items: [],
        days: [],
        total: 0,
        unknown: 0,
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-03-30T23:59:59.999Z',
      };
    case '/api/stats/items-repaired-per-day':
      return buildSeriesResponse([{ day: '2026-03-20', count: 5 }]);
    case '/api/stats/gold-spent-on-repairs-per-day':
      return buildSeriesResponse([{ day: '2026-03-20', count: 88 }]);
    default:
      return buildSeriesResponse();
  }
}

describe('AdminStatsClient trade run charts', () => {
  const originalFetch = global.fetch;

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

  it('renders the new trade run usage charts and requests their endpoints', async () => {
    render(<AdminStatsClient />);

    expect(screen.getByText('Trade runs per day')).toBeInTheDocument();
    expect(screen.getByText('Trade Run token mix per day')).toBeInTheDocument();
    expect(screen.getByText('Trade Run direction mix per day')).toBeInTheDocument();
    expect(screen.getByText('Trade Run leverage heatmap')).toBeInTheDocument();
    expect(screen.queryByText('Items repaired per day')).not.toBeInTheDocument();
    expect(screen.queryByText('Gold spent on repairs per day')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(getRequestedPaths()).toEqual(
        expect.arrayContaining([
          '/api/stats/trade-run-tokens-per-day',
          '/api/stats/trade-run-directions-per-day',
          '/api/stats/trade-run-leverage-per-day',
        ])
      );
    });

    expect(getRequestedPaths()).not.toEqual(
      expect.arrayContaining([
        '/api/stats/items-repaired-per-day',
        '/api/stats/gold-spent-on-repairs-per-day',
      ])
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Spending' }));

    expect(screen.getByText('Items repaired per day')).toBeInTheDocument();
    expect(screen.getByText('Gold spent on repairs per day')).toBeInTheDocument();

    await waitFor(() => {
      expect(getRequestedPaths()).toEqual(
        expect.arrayContaining([
          '/api/stats/items-repaired-per-day',
          '/api/stats/gold-spent-on-repairs-per-day',
        ])
      );
    });
  });
});
