'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { getAppServerBaseUrl } from '../../../lib/server-url';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../../components/ui/Accordion';

type RangeKey = '7' | '30' | '90';
type StatsCategoryKey = 'activity' | 'progression' | 'economy' | 'spending';

interface DailyCountPoint {
  day: string; // YYYY-MM-DD
  count: number;
}

interface DailyCountPointRaw {
  day: string;
  count: number | string;
}

interface DailyCountApiResponseRaw {
  series: DailyCountPointRaw[];
  from: string | null;
  to: string | null;
}

interface CurrencyTotalsPerDayPoint {
  day: string;
  usdc: number;
  ghst: number;
}

interface CurrencyTotalsPerDayPointRaw {
  day: string;
  usdc: number | string;
  ghst: number | string;
}

interface CurrencyTotalsApiResponseRaw {
  series: CurrencyTotalsPerDayPointRaw[];
  from: string | null;
  to: string | null;
}

interface TokenAllocationsPerDayPoint {
  day: string;
  usdc: number;
  gho: number;
  ghst: number;
}

interface TokenAllocationsPerDayPointRaw {
  day: string;
  usdc: number | string;
  gho: number | string;
  ghst: number | string;
}

interface TokenAllocationsApiResponseRaw {
  series: TokenAllocationsPerDayPointRaw[];
  from: string | null;
  to: string | null;
}

interface TradeRunTokensPerDayPoint {
  day: string;
  btc: number;
  eth: number;
  ghst: number;
}

interface TradeRunTokensPerDayPointRaw {
  day: string;
  btc: number | string;
  eth: number | string;
  ghst: number | string;
}

interface TradeRunTokensApiResponseRaw {
  series: TradeRunTokensPerDayPointRaw[];
  from: string | null;
  to: string | null;
}

interface TradeRunDirectionsPerDayPoint {
  day: string;
  long: number;
  short: number;
}

interface TradeRunDirectionsPerDayPointRaw {
  day: string;
  long: number | string;
  short: number | string;
}

interface TradeRunDirectionsApiResponseRaw {
  series: TradeRunDirectionsPerDayPointRaw[];
  from: string | null;
  to: string | null;
}

type TradeRunLeverageCount = {
  leverage: number;
  count: number;
};

interface TradeRunLeverageCountRaw {
  leverage: number | string;
  count: number | string;
}

interface TradeRunLeveragePerDayPoint {
  day: string;
  leverageCounts: TradeRunLeverageCount[];
}

interface TradeRunLeveragePerDayPointRaw {
  day: string;
  leverageCounts?: TradeRunLeverageCountRaw[];
}

interface TradeRunLeverageApiResponseRaw {
  series: TradeRunLeveragePerDayPointRaw[];
  from: string | null;
  to: string | null;
}

type ActiveUsersPoint = {
  day: string;
  dau: number;
  mau: number;
};

interface ActiveUsersPointRaw {
  day: string;
  dau: number | string;
  mau: number | string;
}

interface ActiveUsersApiResponseRaw {
  series: ActiveUsersPointRaw[];
  from: string | null;
  to: string | null;
}

type GoldSpendBreakdownItem = {
  itemId: string | null;
  itemName: string;
  total: number;
  quantity: number;
};

type GoldSpendBreakdownDay = {
  day: string;
  items: GoldSpendBreakdownItem[];
  total: number;
  unknown: number;
};

interface GoldSpendBreakdownItemRaw {
  itemId: string | null;
  itemName: string;
  total: number | string;
  quantity: number | string;
}

interface GoldSpendBreakdownDayRaw {
  day: string;
  items: GoldSpendBreakdownItemRaw[];
  total: number | string;
  unknown: number | string;
}

interface GoldSpendBreakdownApiResponseRaw {
  items: GoldSpendBreakdownItemRaw[];
  days?: GoldSpendBreakdownDayRaw[];
  total: number | string;
  unknown: number | string;
  from: string | null;
  to: string | null;
}

interface ForgeCountsPerDayByRarityPoint {
  day: string;
  common: number;
  uncommon: number;
  rare: number;
  legendary: number;
  mythical: number;
  godlike: number;
}

interface ForgeCountsPerDayByRarityPointRaw {
  day: string;
  common: number | string;
  uncommon: number | string;
  rare: number | string;
  legendary: number | string;
  mythical: number | string;
  godlike: number | string;
}

interface ForgeCountsPerDayByRarityApiResponseRaw {
  series: ForgeCountsPerDayByRarityPointRaw[];
  from: string | null;
  to: string | null;
}

const countFormatter = new Intl.NumberFormat('en-US');
const avgFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const percentFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
});
const GOLD_SPEND_SEGMENT_COLORS = [
  '#f59e0b',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
  '#3b82f6',
  '#06b6d4',
  '#14b8a6',
];
const GOLD_SPEND_OTHER_COLOR = '#64748b';
const GOLD_SPEND_UNKNOWN_COLOR = '#94a3b8';
const TRADE_RUN_TOKEN_COLORS = {
  BTC: '#f59e0b',
  ETH: '#60a5fa',
  GHST: '#34d399',
} as const;
const TRADE_RUN_DIRECTION_COLORS = {
  Long: '#22c55e',
  Short: '#f97316',
} as const;
const FORGE_RARITY_COLORS = {
  Common: '#94a3b8',
  Uncommon: '#22c55e',
  Rare: '#38bdf8',
  Legendary: '#f59e0b',
  Mythical: '#ec4899',
  Godlike: '#8b5cf6',
} as const;
const TRADE_RUN_HEATMAP_LEVELS = Array.from({ length: 20 }, (_, index) => index + 1);
const STATS_CATEGORIES = [
  {
    key: 'activity',
    label: 'Activity',
    description: 'Runs, trade usage, and active users.',
  },
  {
    key: 'progression',
    label: 'Progression',
    description: 'XP, floors, and combat throughput.',
  },
  {
    key: 'economy',
    label: 'Economy',
    description: 'Allocations, withdrawals, and net token balances.',
  },
  {
    key: 'spending',
    label: 'Spending',
    description: 'Repairs, forging, and shop sinks.',
  },
] as const satisfies ReadonlyArray<{
  key: StatsCategoryKey;
  label: string;
  description: string;
}>;

type SegmentedDayValue = {
  label: string;
  color: string;
  value: number;
};

type SegmentedDayPoint = {
  day: string;
  values: SegmentedDayValue[];
};

function formatCount(value: number) {
  return countFormatter.format(value);
}

function formatAverage(value: number) {
  return avgFormatter.format(value);
}

function formatPercent(value: number) {
  return `${percentFormatter.format(value)}%`;
}

function formatDayUtc(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildDayRange(fromIso: string, toIso: string) {
  const fromDate = new Date(fromIso);
  const toDate = new Date(toIso);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return [];
  }
  const start = new Date(
    Date.UTC(
      fromDate.getUTCFullYear(),
      fromDate.getUTCMonth(),
      fromDate.getUTCDate()
    )
  );
  const end = new Date(
    Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate())
  );
  const days: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    days.push(formatDayUtc(cursor));
    cursor = new Date(
      Date.UTC(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth(),
        cursor.getUTCDate() + 1
      )
    );
  }
  return days;
}

function fillDailyCountSeries(
  series: DailyCountPoint[],
  fromIso: string,
  toIso: string
) {
  const days = buildDayRange(fromIso, toIso);
  if (!days.length) return series;
  const seriesByDay = new Map(series.map((point) => [point.day, point]));
  return days.map((day) => seriesByDay.get(day) ?? { day, count: 0 });
}

function fillCurrencyTotalsSeries(
  series: CurrencyTotalsPerDayPoint[],
  fromIso: string,
  toIso: string
) {
  const days = buildDayRange(fromIso, toIso);
  if (!days.length) return series;
  const seriesByDay = new Map(series.map((point) => [point.day, point]));
  return days.map(
    (day) => seriesByDay.get(day) ?? { day, usdc: 0, ghst: 0 }
  );
}

function fillTokenAllocationsSeries(
  series: TokenAllocationsPerDayPoint[],
  fromIso: string,
  toIso: string
) {
  const days = buildDayRange(fromIso, toIso);
  if (!days.length) return series;
  const seriesByDay = new Map(series.map((point) => [point.day, point]));
  return days.map(
    (day) => seriesByDay.get(day) ?? { day, usdc: 0, gho: 0, ghst: 0 }
  );
}

function fillTradeRunTokensSeries(
  series: TradeRunTokensPerDayPoint[],
  fromIso: string,
  toIso: string
) {
  const days = buildDayRange(fromIso, toIso);
  if (!days.length) return series;
  const seriesByDay = new Map(series.map((point) => [point.day, point]));
  return days.map(
    (day) => seriesByDay.get(day) ?? { day, btc: 0, eth: 0, ghst: 0 }
  );
}

function fillTradeRunDirectionsSeries(
  series: TradeRunDirectionsPerDayPoint[],
  fromIso: string,
  toIso: string
) {
  const days = buildDayRange(fromIso, toIso);
  if (!days.length) return series;
  const seriesByDay = new Map(series.map((point) => [point.day, point]));
  return days.map(
    (day) => seriesByDay.get(day) ?? { day, long: 0, short: 0 }
  );
}

function fillTradeRunLeverageSeries(
  series: TradeRunLeveragePerDayPoint[],
  fromIso: string,
  toIso: string
) {
  const days = buildDayRange(fromIso, toIso);
  if (!days.length) return series;
  const seriesByDay = new Map(series.map((point) => [point.day, point]));
  return days.map(
    (day) => seriesByDay.get(day) ?? { day, leverageCounts: [] }
  );
}

function fillActiveUsersSeries(
  series: ActiveUsersPoint[],
  fromIso: string,
  toIso: string
) {
  const days = buildDayRange(fromIso, toIso);
  if (!days.length) return series;
  const seriesByDay = new Map(series.map((point) => [point.day, point]));
  return days.map((day) => seriesByDay.get(day) ?? { day, dau: 0, mau: 0 });
}

function fillGoldSpendBreakdownDays(
  series: GoldSpendBreakdownDay[],
  fromIso: string,
  toIso: string
) {
  const days = buildDayRange(fromIso, toIso);
  if (!days.length) return series;
  const seriesByDay = new Map(series.map((point) => [point.day, point]));
  return days.map(
    (day) =>
      seriesByDay.get(day) ?? {
        day,
        items: [],
        total: 0,
        unknown: 0,
      }
  );
}

function getGoldSpendItemKey(item: { itemId: string | null; itemName: string }) {
  if (item.itemId) return `id:${item.itemId.trim().toLowerCase()}`;
  return `name:${item.itemName.trim().toLowerCase()}`;
}

function getGoldSpendItemLabel(item: { itemId: string | null; itemName: string }) {
  const itemId = item.itemId?.trim();
  if (itemId) return itemId;
  return item.itemName;
}

function computeFromTo(selectedRange: RangeKey) {
  const now = new Date();
  const to = now.toISOString();
  const from = new Date(
    now.getTime() - Number(selectedRange) * 24 * 60 * 60 * 1000
  ).toISOString();
  return { from, to };
}

function useDailyCountSeries(endpoint: string, from: string, to: string) {
  const [series, setSeries] = useState<DailyCountPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const base = getAppServerBaseUrl();
        const url = new URL(`${base}${endpoint}`);
        url.searchParams.set('from', from);
        url.searchParams.set('to', to);
        const res = await fetch(url.toString(), {
          method: 'GET',
          credentials: 'include',
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as DailyCountApiResponseRaw;
        if (aborted) return;
        const normalized = (data.series ?? []).map((point) => ({
          day: point.day,
          count: Number(point.count) || 0,
        }));
        setSeries(fillDailyCountSeries(normalized, from, to));
      } catch (e) {
        if (!aborted) {
          setError(e instanceof Error ? e.message : String(e));
          setSeries([]);
        }
      } finally {
        if (!aborted) setIsLoading(false);
      }
    }
    void load();
    return () => {
      aborted = true;
    };
  }, [endpoint, from, to]);

  return { series, isLoading, error };
}

function useCurrencyTotalsSeries(endpoint: string, from: string, to: string) {
  const [series, setSeries] = useState<CurrencyTotalsPerDayPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const base = getAppServerBaseUrl();
        const url = new URL(`${base}${endpoint}`);
        url.searchParams.set('from', from);
        url.searchParams.set('to', to);
        const res = await fetch(url.toString(), {
          method: 'GET',
          credentials: 'include',
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as CurrencyTotalsApiResponseRaw;
        if (aborted) return;
        const normalized = (data.series ?? []).map((point) => ({
          day: point.day,
          usdc: Number(point.usdc) || 0,
          ghst: Number(point.ghst) || 0,
        }));
        setSeries(fillCurrencyTotalsSeries(normalized, from, to));
      } catch (e) {
        if (!aborted) {
          setError(e instanceof Error ? e.message : String(e));
          setSeries([]);
        }
      } finally {
        if (!aborted) setIsLoading(false);
      }
    }
    void load();
    return () => {
      aborted = true;
    };
  }, [endpoint, from, to]);

  return { series, isLoading, error };
}

function useTokenAllocationsSeries(endpoint: string, from: string, to: string) {
  const [series, setSeries] = useState<TokenAllocationsPerDayPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const base = getAppServerBaseUrl();
        const url = new URL(`${base}${endpoint}`);
        url.searchParams.set('from', from);
        url.searchParams.set('to', to);
        const res = await fetch(url.toString(), {
          method: 'GET',
          credentials: 'include',
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as TokenAllocationsApiResponseRaw;
        if (aborted) return;
        const normalized = (data.series ?? []).map((point) => ({
          day: point.day,
          usdc: Number(point.usdc) || 0,
          gho: Number(point.gho) || 0,
          ghst: Number(point.ghst) || 0,
        }));
        setSeries(fillTokenAllocationsSeries(normalized, from, to));
      } catch (e) {
        if (!aborted) {
          setError(e instanceof Error ? e.message : String(e));
          setSeries([]);
        }
      } finally {
        if (!aborted) setIsLoading(false);
      }
    }
    void load();
    return () => {
      aborted = true;
    };
  }, [endpoint, from, to]);

  return { series, isLoading, error };
}

function useTradeRunTokensSeries(from: string, to: string) {
  const [series, setSeries] = useState<TradeRunTokensPerDayPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const base = getAppServerBaseUrl();
        const url = new URL(`${base}/api/stats/trade-run-tokens-per-day`);
        url.searchParams.set('from', from);
        url.searchParams.set('to', to);
        const res = await fetch(url.toString(), {
          method: 'GET',
          credentials: 'include',
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as TradeRunTokensApiResponseRaw;
        if (aborted) return;
        const normalized = (data.series ?? []).map((point) => ({
          day: point.day,
          btc: Number(point.btc) || 0,
          eth: Number(point.eth) || 0,
          ghst: Number(point.ghst) || 0,
        }));
        setSeries(fillTradeRunTokensSeries(normalized, from, to));
      } catch (e) {
        if (!aborted) {
          setError(e instanceof Error ? e.message : String(e));
          setSeries([]);
        }
      } finally {
        if (!aborted) setIsLoading(false);
      }
    }
    void load();
    return () => {
      aborted = true;
    };
  }, [from, to]);

  return { series, isLoading, error };
}

function useTradeRunDirectionsSeries(from: string, to: string) {
  const [series, setSeries] = useState<TradeRunDirectionsPerDayPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const base = getAppServerBaseUrl();
        const url = new URL(`${base}/api/stats/trade-run-directions-per-day`);
        url.searchParams.set('from', from);
        url.searchParams.set('to', to);
        const res = await fetch(url.toString(), {
          method: 'GET',
          credentials: 'include',
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as TradeRunDirectionsApiResponseRaw;
        if (aborted) return;
        const normalized = (data.series ?? []).map((point) => ({
          day: point.day,
          long: Number(point.long) || 0,
          short: Number(point.short) || 0,
        }));
        setSeries(fillTradeRunDirectionsSeries(normalized, from, to));
      } catch (e) {
        if (!aborted) {
          setError(e instanceof Error ? e.message : String(e));
          setSeries([]);
        }
      } finally {
        if (!aborted) setIsLoading(false);
      }
    }
    void load();
    return () => {
      aborted = true;
    };
  }, [from, to]);

  return { series, isLoading, error };
}

function useTradeRunLeverageSeries(from: string, to: string) {
  const [series, setSeries] = useState<TradeRunLeveragePerDayPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const base = getAppServerBaseUrl();
        const url = new URL(`${base}/api/stats/trade-run-leverage-per-day`);
        url.searchParams.set('from', from);
        url.searchParams.set('to', to);
        const res = await fetch(url.toString(), {
          method: 'GET',
          credentials: 'include',
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as TradeRunLeverageApiResponseRaw;
        if (aborted) return;
        const normalized = (data.series ?? []).map((point) => ({
          day: point.day,
          leverageCounts: (point.leverageCounts ?? [])
            .map((item) => ({
              leverage: Number(item.leverage) || 0,
              count: Number(item.count) || 0,
            }))
            .filter((item) => item.leverage > 0 && item.count > 0)
            .sort((a, b) => a.leverage - b.leverage),
        }));
        setSeries(fillTradeRunLeverageSeries(normalized, from, to));
      } catch (e) {
        if (!aborted) {
          setError(e instanceof Error ? e.message : String(e));
          setSeries([]);
        }
      } finally {
        if (!aborted) setIsLoading(false);
      }
    }
    void load();
    return () => {
      aborted = true;
    };
  }, [from, to]);

  return { series, isLoading, error };
}

function useGoldSpendBreakdown(from: string, to: string) {
  const [items, setItems] = useState<GoldSpendBreakdownItem[]>([]);
  const [days, setDays] = useState<GoldSpendBreakdownDay[]>([]);
  const [total, setTotal] = useState(0);
  const [unknown, setUnknown] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const base = getAppServerBaseUrl();
        const url = new URL(`${base}/api/stats/gold-spent-breakdown`);
        url.searchParams.set('from', from);
        url.searchParams.set('to', to);
        const res = await fetch(url.toString(), {
          method: 'GET',
          credentials: 'include',
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as GoldSpendBreakdownApiResponseRaw;
        if (aborted) return;
        const normalized = (data.items ?? []).map((item) => ({
          itemId: item.itemId ?? null,
          itemName: item.itemName,
          total: Number(item.total) || 0,
          quantity: Number(item.quantity) || 0,
        }));
        const normalizedDays = (data.days ?? []).map((day) => ({
          day: day.day,
          items: (day.items ?? []).map((item) => ({
            itemId: item.itemId ?? null,
            itemName: item.itemName,
            total: Number(item.total) || 0,
            quantity: Number(item.quantity) || 0,
          })),
          total: Number(day.total) || 0,
          unknown: Number(day.unknown) || 0,
        }));
        setItems(normalized);
        setDays(fillGoldSpendBreakdownDays(normalizedDays, from, to));
        setTotal(Number(data.total) || 0);
        setUnknown(Number(data.unknown) || 0);
      } catch (e) {
        if (!aborted) {
          setError(e instanceof Error ? e.message : String(e));
          setItems([]);
          setDays([]);
          setTotal(0);
          setUnknown(0);
        }
      } finally {
        if (!aborted) setIsLoading(false);
      }
    }
    void load();
    return () => {
      aborted = true;
    };
  }, [from, to]);

  return { items, days, total, unknown, isLoading, error };
}

function useForgeCountsByRaritySeries(from: string, to: string) {
  const [series, setSeries] = useState<ForgeCountsPerDayByRarityPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const base = getAppServerBaseUrl();
        const url = new URL(`${base}/api/stats/forge-counts-per-day-by-rarity`);
        url.searchParams.set('from', from);
        url.searchParams.set('to', to);
        const res = await fetch(url.toString(), {
          method: 'GET',
          credentials: 'include',
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as ForgeCountsPerDayByRarityApiResponseRaw;
        if (aborted) return;
        const normalized = (data.series ?? []).map((point) => ({
          day: point.day,
          common: Number(point.common) || 0,
          uncommon: Number(point.uncommon) || 0,
          rare: Number(point.rare) || 0,
          legendary: Number(point.legendary) || 0,
          mythical: Number(point.mythical) || 0,
          godlike: Number(point.godlike) || 0,
        }));
        const dayRange = buildDayRange(from, to);
        const byDay = new Map(normalized.map((point) => [point.day, point]));
        setSeries(
          dayRange.map((day) => {
            const existing = byDay.get(day);
            return (
              existing ?? {
                day,
                common: 0,
                uncommon: 0,
                rare: 0,
                legendary: 0,
                mythical: 0,
                godlike: 0,
              }
            );
          })
        );
      } catch (e) {
        if (!aborted) {
          setError(e instanceof Error ? e.message : String(e));
          setSeries([]);
        }
      } finally {
        if (!aborted) setIsLoading(false);
      }
    }
    void load();
    return () => {
      aborted = true;
    };
  }, [from, to]);

  return { series, isLoading, error };
}

function useActiveUsersSeries(from: string, to: string) {
  const [series, setSeries] = useState<ActiveUsersPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const base = getAppServerBaseUrl();
        const url = new URL(`${base}/api/stats/active-users`);
        url.searchParams.set('from', from);
        url.searchParams.set('to', to);
        url.searchParams.set('windowDays', '30');
        const res = await fetch(url.toString(), {
          method: 'GET',
          credentials: 'include',
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as ActiveUsersApiResponseRaw;
        if (aborted) return;
        const normalized = (data.series ?? []).map((point) => ({
          day: point.day,
          dau: Number(point.dau) || 0,
          mau: Number(point.mau) || 0,
        }));
        setSeries(fillActiveUsersSeries(normalized, from, to));
      } catch (e) {
        if (!aborted) {
          setError(e instanceof Error ? e.message : String(e));
          setSeries([]);
        }
      } finally {
        if (!aborted) setIsLoading(false);
      }
    }
    void load();
    return () => {
      aborted = true;
    };
  }, [from, to]);

  return { series, isLoading, error };
}

interface CountChartCardProps {
  title: string;
  series: DailyCountPoint[];
  isLoading: boolean;
  error: string | null;
  accentClassName: string;
  valueLabel: string;
  treatAllZeroAsNoData?: boolean;
}

function CountChartCard(props: CountChartCardProps) {
  const {
    title,
    series,
    isLoading,
    error,
    accentClassName,
    valueLabel,
    treatAllZeroAsNoData = false,
  } = props;
  const maxY = useMemo(
    () => Math.max(1, ...series.map((p) => p.count)),
    [series]
  );
  const total = useMemo(
    () => series.reduce((acc, p) => acc + p.count, 0),
    [series]
  );
  const hasData = useMemo(
    () =>
      series.length > 0 &&
      (!treatAllZeroAsNoData || series.some((point) => point.count > 0)),
    [series, treatAllZeroAsNoData]
  );
  const avg = useMemo(
    () => (series.length ? total / series.length : 0),
    [total, series.length]
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-2 text-sm font-medium text-white/80">{title}</div>
      {!isLoading && !error && hasData ? (
        <div className="mb-3 text-xs text-white/60">
          Total: {formatCount(total)} · Avg: {formatAverage(avg)}/day · Max:{' '}
          {formatCount(maxY)}
        </div>
      ) : null}
      {isLoading ? (
        <div className="p-6 text-center text-white/60">Loading…</div>
      ) : error ? (
        <div className="p-6 text-center text-red-300">
          Failed to load: {error}
        </div>
      ) : !hasData ? (
        <div className="p-6 text-center text-white/60">No data</div>
      ) : (
        <div className="relative h-64 w-full">
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {series.map((p) => {
              const h = (p.count / maxY) * 100;
              return (
                <div
                  key={`${title}-${p.day}`}
                  title={`${p.day}: ${formatCount(p.count)}`}
                  className={`flex-1 transition-colors ${accentClassName}`}
                  style={{ height: `${h}%` }}
                />
              );
            })}
          </div>
          <div className="absolute inset-y-0 left-0 w-full pointer-events-none">
            <div className="absolute bottom-0 left-0 right-0 border-t border-white/10" />
            <div className="absolute bottom-1/2 left-0 right-0 border-t border-white/10" />
            <div className="absolute top-0 left-0 right-0 border-t border-white/10" />
            <div className="absolute top-0 left-2 -translate-y-1/2 text-[10px] text-white/60">
              {formatCount(maxY)}
            </div>
            <div className="absolute top-1/2 left-2 -translate-y-1/2 text-[10px] text-white/60">
              {formatCount(Math.ceil(maxY / 2))}
            </div>
            <div className="absolute bottom-0 left-2 translate-y-1/2 text-[10px] text-white/60">
              0
            </div>
          </div>
        </div>
      )}
      {!isLoading && !error && hasData ? (
        <div className="mt-3 flex items-center justify-between text-xs text-white/60">
          <div>{series[0]?.day}</div>
          <div>{series[series.length - 1]?.day}</div>
        </div>
      ) : null}
      {!isLoading && !error && hasData ? (
        <Accordion type="single" collapsible className="mt-6">
          <AccordionItem value={`${title}-details`}>
            <AccordionTrigger>View daily details</AccordionTrigger>
            <AccordionContent>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full">
                  <thead className="bg-white/5 text-white/60 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2 text-left">Day</th>
                      <th className="px-4 py-2 text-right">{valueLabel}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-sm">
                    {series.map((p) => (
                      <tr key={p.day} className="hover:bg-white/5 transition">
                        <td className="px-4 py-2">{p.day}</td>
                        <td className="px-4 py-2 text-right">
                          {formatCount(p.count)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : null}
    </div>
  );
}

interface CurrencyTotalsCardProps {
  title: string;
  series: CurrencyTotalsPerDayPoint[];
  isLoading: boolean;
  error: string | null;
  usdcLabel?: string;
  ghstLabel?: string;
}

function CurrencyTotalsCard(props: CurrencyTotalsCardProps) {
  const {
    title,
    series,
    isLoading,
    error,
    usdcLabel = 'USDC',
    ghstLabel = 'GHST',
  } = props;
  const totals = useMemo(() => {
    return series.reduce(
      (acc, p) => {
        acc.usdc += p.usdc;
        acc.ghst += p.ghst;
        return acc;
      },
      { usdc: 0, ghst: 0 }
    );
  }, [series]);
  const max = useMemo(() => {
    return Math.max(
      1,
      ...series.map((p) => {
        const t = (p.usdc ?? 0) + (p.ghst ?? 0);
        return t;
      })
    );
  }, [series]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-2 text-sm font-medium text-white/80">{title}</div>
      {!isLoading && !error && series.length > 0 ? (
        <div className="mb-3 text-xs text-white/60">
          Total: {totals.usdc.toFixed(2)} {usdcLabel} ·{' '}
          {totals.ghst.toFixed(2)} {ghstLabel} · Max/day: {max.toFixed(2)}
        </div>
      ) : null}
      {isLoading ? (
        <div className="p-6 text-center text-white/60">Loading…</div>
      ) : error ? (
        <div className="p-6 text-center text-red-300">
          Failed to load: {error}
        </div>
      ) : series.length === 0 ? (
        <div className="p-6 text-center text-white/60">No data</div>
      ) : (
        <div className="relative h-64 w-full">
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {series.map((p) => {
              const totalForDay = (p.usdc ?? 0) + (p.ghst ?? 0);
              const barHeightPct =
                max > 0 ? Math.max((totalForDay / max) * 100, 1) : 0;
              const usdcPct =
                totalForDay > 0 ? (p.usdc / totalForDay) * 100 : 0;
              const ghstPct =
                totalForDay > 0 ? (p.ghst / totalForDay) * 100 : 0;
              const titleText = `${p.day}: ${p.usdc.toFixed(
                2
              )} ${usdcLabel}, ${p.ghst.toFixed(2)} ${ghstLabel}`;
              return (
                <div key={`${title}-${p.day}`} className="flex-1 flex items-end h-full">
                  <div
                    className="w-full flex flex-col justify-end"
                    title={titleText}
                    style={{ height: `${barHeightPct}%` }}
                  >
                    <div
                      className="bg-sky-400/80 hover:bg-sky-300 transition-colors"
                      style={{ height: `${usdcPct}%` }}
                    />
                    <div
                      className="bg-violet-400/80 hover:bg-violet-300 transition-colors"
                      style={{ height: `${ghstPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="absolute inset-y-0 left-0 w-full pointer-events-none">
            <div className="absolute bottom-0 left-0 right-0 border-t border-white/10" />
            <div className="absolute bottom-1/2 left-0 right-0 border-t border-white/10" />
            <div className="absolute top-0 left-0 right-0 border-t border-white/10" />
            <div className="absolute top-0 left-2 -translate-y-1/2 text-[10px] text-white/60">
              {max.toFixed(2)}
            </div>
            <div className="absolute top-1/2 left-2 -translate-y-1/2 text-[10px] text-white/60">
              {(max / 2).toFixed(2)}
            </div>
            <div className="absolute bottom-0 left-2 translate-y-1/2 text-[10px] text-white/60">
              0
            </div>
          </div>
        </div>
      )}
      {!isLoading && !error && series.length > 0 ? (
        <div className="mt-3 flex items-center justify-between text-xs text-white/60">
          <div>{series[0]?.day}</div>
          <div>{series[series.length - 1]?.day}</div>
        </div>
      ) : null}
      {!isLoading && !error && series.length > 0 ? (
        <Accordion type="single" collapsible className="mt-6">
          <AccordionItem value={`${title}-details`}>
            <AccordionTrigger>View daily details</AccordionTrigger>
            <AccordionContent>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full">
                  <thead className="bg-white/5 text-white/60 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2 text-left">Day</th>
                      <th className="px-4 py-2 text-right">{usdcLabel}</th>
                      <th className="px-4 py-2 text-right">{ghstLabel}</th>
                      <th className="px-4 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-sm">
                    {series.map((p) => {
                      const t = (p.usdc ?? 0) + (p.ghst ?? 0);
                      return (
                        <tr key={p.day} className="hover:bg-white/5 transition">
                          <td className="px-4 py-2">{p.day}</td>
                          <td className="px-4 py-2 text-right">
                            {p.usdc.toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {p.ghst.toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {t.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : null}
    </div>
  );
}

interface TokenAllocationsCardProps {
  title: string;
  series: TokenAllocationsPerDayPoint[];
  isLoading: boolean;
  error: string | null;
  usdcLabel?: string;
  ghoLabel?: string;
  ghstLabel?: string;
}

function TokenAllocationsCard(props: TokenAllocationsCardProps) {
  const {
    title,
    series,
    isLoading,
    error,
    usdcLabel = 'USDC',
    ghoLabel = 'GHO',
    ghstLabel = 'GHST',
  } = props;

  const totals = useMemo(() => {
    return series.reduce(
      (acc, p) => {
        acc.usdc += p.usdc;
        acc.gho += p.gho;
        acc.ghst += p.ghst;
        return acc;
      },
      { usdc: 0, gho: 0, ghst: 0 }
    );
  }, [series]);

  const max = useMemo(() => {
    return Math.max(
      1,
      ...series.map((p) => (p.usdc ?? 0) + (p.gho ?? 0) + (p.ghst ?? 0))
    );
  }, [series]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-2 text-sm font-medium text-white/80">{title}</div>
      {!isLoading && !error && series.length > 0 ? (
        <div className="mb-3 text-xs text-white/60">
          Total: {totals.usdc.toFixed(2)} {usdcLabel} · {totals.gho.toFixed(2)}{' '}
          {ghoLabel} · {totals.ghst.toFixed(2)} {ghstLabel} · Max/day:{' '}
          {max.toFixed(2)}
        </div>
      ) : null}
      {isLoading ? (
        <div className="p-6 text-center text-white/60">Loading…</div>
      ) : error ? (
        <div className="p-6 text-center text-red-300">
          Failed to load: {error}
        </div>
      ) : series.length === 0 ? (
        <div className="p-6 text-center text-white/60">No data</div>
      ) : (
        <div className="relative h-64 w-full">
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {series.map((p) => {
              const totalForDay = (p.usdc ?? 0) + (p.gho ?? 0) + (p.ghst ?? 0);
              const barHeightPct =
                max > 0 ? Math.max((totalForDay / max) * 100, 1) : 0;
              const usdcPct =
                totalForDay > 0 ? (p.usdc / totalForDay) * 100 : 0;
              const ghoPct = totalForDay > 0 ? (p.gho / totalForDay) * 100 : 0;
              const ghstPct =
                totalForDay > 0 ? (p.ghst / totalForDay) * 100 : 0;
              const titleText = `${p.day}: ${p.usdc.toFixed(
                2
              )} ${usdcLabel}, ${p.gho.toFixed(2)} ${ghoLabel}, ${p.ghst.toFixed(
                2
              )} ${ghstLabel}`;
              return (
                <div
                  key={`${title}-${p.day}`}
                  className="flex-1 flex items-end h-full"
                >
                  <div
                    className="w-full flex flex-col justify-end"
                    title={titleText}
                    style={{ height: `${barHeightPct}%` }}
                  >
                    <div
                      className="bg-sky-400/80 hover:bg-sky-300 transition-colors"
                      style={{ height: `${usdcPct}%` }}
                    />
                    <div
                      className="bg-emerald-400/80 hover:bg-emerald-300 transition-colors"
                      style={{ height: `${ghstPct}%` }}
                    />
                    <div
                      className="bg-violet-400/80 hover:bg-violet-300 transition-colors"
                      style={{ height: `${ghoPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="absolute inset-y-0 left-0 w-full pointer-events-none">
            <div className="absolute bottom-0 left-0 right-0 border-t border-white/10" />
            <div className="absolute bottom-1/2 left-0 right-0 border-t border-white/10" />
            <div className="absolute top-0 left-0 right-0 border-t border-white/10" />
            <div className="absolute top-0 left-2 -translate-y-1/2 text-[10px] text-white/60">
              {max.toFixed(2)}
            </div>
            <div className="absolute top-1/2 left-2 -translate-y-1/2 text-[10px] text-white/60">
              {(max / 2).toFixed(2)}
            </div>
            <div className="absolute bottom-0 left-2 translate-y-1/2 text-[10px] text-white/60">
              0
            </div>
          </div>
        </div>
      )}
      {!isLoading && !error && series.length > 0 ? (
        <div className="mt-3 flex items-center justify-between text-xs text-white/60">
          <div>{series[0]?.day}</div>
          <div>{series[series.length - 1]?.day}</div>
        </div>
      ) : null}
      {!isLoading && !error && series.length > 0 ? (
        <Accordion type="single" collapsible className="mt-6">
          <AccordionItem value={`${title}-details`}>
            <AccordionTrigger>View daily details</AccordionTrigger>
            <AccordionContent>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full">
                  <thead className="bg-white/5 text-white/60 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2 text-left">Day</th>
                      <th className="px-4 py-2 text-right">{usdcLabel}</th>
                      <th className="px-4 py-2 text-right">{ghoLabel}</th>
                      <th className="px-4 py-2 text-right">{ghstLabel}</th>
                      <th className="px-4 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-sm">
                    {series.map((p) => {
                      const t = (p.usdc ?? 0) + (p.gho ?? 0) + (p.ghst ?? 0);
                      return (
                        <tr key={p.day} className="hover:bg-white/5 transition">
                          <td className="px-4 py-2">{p.day}</td>
                          <td className="px-4 py-2 text-right">
                            {p.usdc.toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {p.gho.toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {p.ghst.toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-right">{t.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : null}
    </div>
  );
}

interface SegmentedBarsCardProps {
  title: string;
  series: SegmentedDayPoint[];
  isLoading: boolean;
  error: string | null;
  unitLabel: string;
}

function SegmentedBarsCard(props: SegmentedBarsCardProps) {
  const { title, series, isLoading, error, unitLabel } = props;
  const chartDays = useMemo(
    () =>
      series.map((day) => ({
        ...day,
        total: day.values.reduce((acc, value) => acc + value.value, 0),
      })),
    [series]
  );
  const hasData = useMemo(
    () => chartDays.some((day) => day.total > 0),
    [chartDays]
  );
  const total = useMemo(
    () => chartDays.reduce((acc, day) => acc + day.total, 0),
    [chartDays]
  );
  const maxDailyTotal = useMemo(
    () => Math.max(1, ...chartDays.map((day) => day.total)),
    [chartDays]
  );
  const legendEntries = useMemo(() => {
    const totalsByLabel = new Map<
      string,
      { label: string; color: string; total: number }
    >();
    for (const day of chartDays) {
      for (const value of day.values) {
        const existing = totalsByLabel.get(value.label) ?? {
          label: value.label,
          color: value.color,
          total: 0,
        };
        existing.total += value.value;
        totalsByLabel.set(value.label, existing);
      }
    }
    return Array.from(totalsByLabel.values())
      .filter((entry) => entry.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [chartDays]);
  const dailyRows = useMemo(() => {
    return [...chartDays]
      .sort((a, b) => b.day.localeCompare(a.day))
      .map((day) => ({
        day: day.day,
        total: day.total,
        valuesByLabel: new Map(day.values.map((value) => [value.label, value.value])),
      }));
  }, [chartDays]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-2 text-sm font-medium text-white/80">{title}</div>
      {!isLoading && !error && hasData ? (
        <div className="mb-3 text-xs text-white/60">
          Total: {formatCount(total)} · Avg: {formatAverage(chartDays.length ? total / chartDays.length : 0)}/day · Max:{' '}
          {formatCount(maxDailyTotal)}
        </div>
      ) : null}
      {isLoading ? (
        <div className="p-6 text-center text-white/60">Loading…</div>
      ) : error ? (
        <div className="p-6 text-center text-red-300">
          Failed to load: {error}
        </div>
      ) : !hasData ? (
        <div className="p-6 text-center text-white/60">No data</div>
      ) : (
        <div>
          <div className="relative h-64 w-full">
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {chartDays.map((day) => {
                const barHeightPct =
                  day.total > 0
                    ? Math.max((day.total / maxDailyTotal) * 100, 1)
                    : 0;
                const tooltip =
                  day.total > 0
                    ? `${day.day}: ${formatCount(day.total)} ${unitLabel.toLowerCase()} (${day.values
                        .filter((value) => value.value > 0)
                        .map((value) => `${value.label} ${formatCount(value.value)}`)
                        .join(', ')})`
                    : `${day.day}: 0 ${unitLabel.toLowerCase()}`;
                return (
                  <div key={`${title}-${day.day}`} className="flex-1 flex items-end h-full">
                    <div
                      className="w-full flex flex-col justify-end overflow-hidden rounded-[2px] bg-white/5"
                      title={tooltip}
                      style={{ height: `${barHeightPct}%` }}
                    >
                      {day.values
                        .filter((value) => value.value > 0)
                        .map((value) => (
                          <div
                            key={`${day.day}-${value.label}`}
                            style={{
                              height: `${day.total > 0 ? (value.value / day.total) * 100 : 0}%`,
                              backgroundColor: value.color,
                            }}
                          />
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="absolute inset-y-0 left-0 w-full pointer-events-none">
              <div className="absolute bottom-0 left-0 right-0 border-t border-white/10" />
              <div className="absolute bottom-1/2 left-0 right-0 border-t border-white/10" />
              <div className="absolute top-0 left-0 right-0 border-t border-white/10" />
              <div className="absolute top-0 left-2 -translate-y-1/2 text-[10px] text-white/60">
                {formatCount(maxDailyTotal)}
              </div>
              <div className="absolute top-1/2 left-2 -translate-y-1/2 text-[10px] text-white/60">
                {formatCount(Math.ceil(maxDailyTotal / 2))}
              </div>
              <div className="absolute bottom-0 left-2 translate-y-1/2 text-[10px] text-white/60">
                0
              </div>
            </div>
          </div>
          {legendEntries.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
              {legendEntries.map((entry) => (
                <div key={entry.label} className="flex items-center gap-2 text-white/70">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span>{entry.label}</span>
                  <span className="text-white/40">{formatCount(entry.total)}</span>
                </div>
              ))}
            </div>
          ) : null}
          {chartDays.length > 0 ? (
            <div className="mt-3 flex items-center justify-between text-xs text-white/60">
              <div>{chartDays[0]?.day}</div>
              <div>{chartDays[chartDays.length - 1]?.day}</div>
            </div>
          ) : null}
        </div>
      )}
      {!isLoading && !error && hasData && dailyRows.length > 0 ? (
        <Accordion type="single" collapsible className="mt-6">
          <AccordionItem value={`${title}-details`}>
            <AccordionTrigger>View daily details</AccordionTrigger>
            <AccordionContent>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full">
                  <thead className="bg-white/5 text-white/60 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2 text-left">Day</th>
                      {legendEntries.map((entry) => (
                        <th key={entry.label} className="px-4 py-2 text-right">
                          {entry.label}
                        </th>
                      ))}
                      <th className="px-4 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-sm">
                    {dailyRows.map((row) => (
                      <tr key={`${title}-table-${row.day}`} className="hover:bg-white/5 transition">
                        <td className="px-4 py-2">{row.day}</td>
                        {legendEntries.map((entry) => (
                          <td key={`${row.day}-${entry.label}`} className="px-4 py-2 text-right">
                            {formatCount(row.valuesByLabel.get(entry.label) ?? 0)}
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right">
                          {formatCount(row.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : null}
    </div>
  );
}

interface TradeRunLeverageHeatmapCardProps {
  title: string;
  series: TradeRunLeveragePerDayPoint[];
  isLoading: boolean;
  error: string | null;
}

function TradeRunLeverageHeatmapCard(props: TradeRunLeverageHeatmapCardProps) {
  const { title, series, isLoading, error } = props;
  const chartDays = useMemo(
    () =>
      series.map((day) => {
        const countsByLeverage = new Map<number, number>();
        let total = 0;
        let weightedTotal = 0;
        let peakLeverage: number | null = null;
        let peakCount = 0;
        for (const item of day.leverageCounts) {
          countsByLeverage.set(item.leverage, item.count);
          total += item.count;
          weightedTotal += item.leverage * item.count;
          if (item.count > peakCount) {
            peakCount = item.count;
            peakLeverage = item.leverage;
          }
        }
        return {
          day: day.day,
          countsByLeverage,
          total,
          weightedTotal,
          averageLeverage: total > 0 ? weightedTotal / total : 0,
          peakLeverage,
          peakCount,
        };
      }),
    [series]
  );
  const hasData = useMemo(
    () => chartDays.some((day) => day.total > 0),
    [chartDays]
  );
  const maxCellCount = useMemo(() => {
    const counts = chartDays.flatMap((day) =>
      TRADE_RUN_HEATMAP_LEVELS.map((level) => day.countsByLeverage.get(level) ?? 0)
    );
    return Math.max(1, ...counts);
  }, [chartDays]);
  const totalRuns = useMemo(
    () => chartDays.reduce((acc, day) => acc + day.total, 0),
    [chartDays]
  );
  const totalWeightedLeverage = useMemo(
    () => chartDays.reduce((acc, day) => acc + day.weightedTotal, 0),
    [chartDays]
  );
  const leverageTotals = useMemo(() => {
    const totals = new Map<number, number>();
    for (const day of chartDays) {
      for (const level of TRADE_RUN_HEATMAP_LEVELS) {
        const count = day.countsByLeverage.get(level) ?? 0;
        if (count <= 0) continue;
        totals.set(level, (totals.get(level) ?? 0) + count);
      }
    }
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  }, [chartDays]);
  const dailyRows = useMemo(
    () =>
      [...chartDays]
        .sort((a, b) => b.day.localeCompare(a.day))
        .map((day) => ({
          day: day.day,
          total: day.total,
          averageLeverage: day.averageLeverage,
          peakLabel:
            day.peakLeverage == null ? '—' : `${day.peakLeverage}x (${formatCount(day.peakCount)})`,
          breakdown:
            day.total > 0
              ? TRADE_RUN_HEATMAP_LEVELS.map((level) => {
                  const count = day.countsByLeverage.get(level) ?? 0;
                  return count > 0 ? `${level}x ${formatCount(count)}` : null;
                })
                  .filter(Boolean)
                  .join(', ')
              : '—',
        })),
    [chartDays]
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-2 text-sm font-medium text-white/80">{title}</div>
      {!isLoading && !error && hasData ? (
        <div className="mb-3 text-xs text-white/60">
          Total Runs: {formatCount(totalRuns)} · Avg Leverage:{' '}
          {formatAverage(totalRuns > 0 ? totalWeightedLeverage / totalRuns : 0)}x ·
          Most used: {leverageTotals[0] ? `${leverageTotals[0][0]}x` : '—'}
        </div>
      ) : null}
      {isLoading ? (
        <div className="p-6 text-center text-white/60">Loading…</div>
      ) : error ? (
        <div className="p-6 text-center text-red-300">
          Failed to load: {error}
        </div>
      ) : !hasData ? (
        <div className="p-6 text-center text-white/60">No data</div>
      ) : (
        <div>
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/10 p-3">
            <div
              className="grid gap-1"
              style={{
                gridTemplateColumns: `40px repeat(${chartDays.length}, minmax(14px, 1fr))`,
                minWidth: `${Math.max(360, 40 + chartDays.length * 16)}px`,
              }}
            >
              <div />
              {chartDays.map((day, index) => (
                <div
                  key={`trade-run-day-${day.day}`}
                  className="h-4 text-center text-[9px] text-white/40"
                >
                  {index % 7 === 0 || index === chartDays.length - 1
                    ? day.day.slice(5)
                    : ''}
                </div>
              ))}
              {TRADE_RUN_HEATMAP_LEVELS.map((level) => (
                <Fragment key={`trade-run-level-${level}`}>
                  <div className="flex items-center justify-end pr-1 text-[10px] text-white/60">
                    {level}x
                  </div>
                  {chartDays.map((day) => {
                    const count = day.countsByLeverage.get(level) ?? 0;
                    const alpha =
                      count > 0
                        ? 0.16 + (count / maxCellCount) * 0.84
                        : 0.06;
                    return (
                      <div
                        key={`${day.day}-${level}x`}
                        className="h-4 rounded-[2px] border border-white/5"
                        style={{
                          backgroundColor:
                            count > 0
                              ? `rgba(245, 158, 11, ${alpha})`
                              : 'rgba(255, 255, 255, 0.06)',
                        }}
                        title={`${day.day} · ${level}x: ${formatCount(count)} runs`}
                      />
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
          {chartDays.length > 0 ? (
            <div className="mt-3 flex items-center justify-between text-xs text-white/60">
              <div>{chartDays[0]?.day}</div>
              <div>{chartDays[chartDays.length - 1]?.day}</div>
            </div>
          ) : null}
        </div>
      )}
      {!isLoading && !error && hasData && dailyRows.length > 0 ? (
        <Accordion type="single" collapsible className="mt-6">
          <AccordionItem value={`${title}-details`}>
            <AccordionTrigger>View daily leverage breakdown</AccordionTrigger>
            <AccordionContent>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full">
                  <thead className="bg-white/5 text-white/60 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2 text-left">Day</th>
                      <th className="px-4 py-2 text-right">Runs</th>
                      <th className="px-4 py-2 text-right">Avg Leverage</th>
                      <th className="px-4 py-2 text-right">Most Used</th>
                      <th className="px-4 py-2 text-left">Breakdown</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-sm">
                    {dailyRows.map((row) => (
                      <tr key={`${title}-table-${row.day}`} className="hover:bg-white/5 transition">
                        <td className="px-4 py-2">{row.day}</td>
                        <td className="px-4 py-2 text-right">
                          {formatCount(row.total)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {row.total > 0 ? `${formatAverage(row.averageLeverage)}x` : '—'}
                        </td>
                        <td className="px-4 py-2 text-right">{row.peakLabel}</td>
                        <td className="px-4 py-2 text-left">{row.breakdown}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : null}
    </div>
  );
}

interface GoldSpendBreakdownCardProps {
  title: string;
  items: GoldSpendBreakdownItem[];
  days: GoldSpendBreakdownDay[];
  total: number;
  unknown: number;
  isLoading: boolean;
  error: string | null;
}

function GoldSpendBreakdownCard(props: GoldSpendBreakdownCardProps) {
  const { title, items, days, total, unknown, isLoading, error } = props;
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => b.total - a.total);
  }, [items]);
  const chartDays = useMemo(() => {
    return [...days].sort((a, b) => a.day.localeCompare(b.day));
  }, [days]);
  const tableDays = useMemo(() => {
    return [...days].sort((a, b) => b.day.localeCompare(a.day));
  }, [days]);
  const hasData = useMemo(
    () => total > 0 || chartDays.some((day) => day.total > 0 || day.unknown > 0),
    [chartDays, total]
  );
  
  const maxDailySpend = useMemo(
    () => Math.max(1, ...chartDays.map((day) => day.total)),
    [chartDays]
  );
  const daysWithSpend = useMemo(() => {
    return chartDays.filter((day) => day.total > 0 || day.unknown > 0).length;
  }, [chartDays]);
  const topStackItems = useMemo(() => {
    const maxStackItems = 6;
    return sortedItems.slice(0, maxStackItems).map((item, index) => ({
      key: getGoldSpendItemKey(item),
      label: getGoldSpendItemLabel(item),
      total: item.total,
      color: GOLD_SPEND_SEGMENT_COLORS[index % GOLD_SPEND_SEGMENT_COLORS.length],
    }));
  }, [sortedItems]);
  const hasOtherItems = sortedItems.length > topStackItems.length;
  const otherItemsTotal = useMemo(
    () =>
      hasOtherItems
        ? sortedItems
            .slice(topStackItems.length)
            .reduce((acc, item) => acc + item.total, 0)
        : 0,
    [hasOtherItems, sortedItems, topStackItems.length]
  );
  const chartRows = useMemo(() => {
    return chartDays.map((day) => {
      const totalsByItem = new Map<string, number>();
      for (const item of day.items) {
        const key = getGoldSpendItemKey(item);
        totalsByItem.set(key, (totalsByItem.get(key) ?? 0) + item.total);
      }
      const segments = topStackItems
        .map((item) => ({
          label: item.label,
          color: item.color,
          value: totalsByItem.get(item.key) ?? 0,
        }))
        .filter((segment) => segment.value > 0);

      const topTotal = segments.reduce((acc, segment) => acc + segment.value, 0);
      const attributedTotal = Math.max(day.total - day.unknown, 0);
      const otherValue = Math.max(attributedTotal - topTotal, 0);
      if (hasOtherItems && otherValue > 0) {
        segments.push({
          label: 'Other Items',
          color: GOLD_SPEND_OTHER_COLOR,
          value: otherValue,
        });
      }
      if (day.unknown > 0) {
        segments.push({
          label: 'Unattributed',
          color: GOLD_SPEND_UNKNOWN_COLOR,
          value: day.unknown,
        });
      }
      return {
        day: day.day,
        total: day.total,
        segments,
      };
    });
  }, [chartDays, hasOtherItems, topStackItems]);
  const legendEntries = useMemo(() => {
    const entries = topStackItems.map((item) => ({
      label: item.label,
      total: item.total,
      color: item.color,
    }));
    if (otherItemsTotal > 0) {
      entries.push({
        label: 'Other Items',
        total: otherItemsTotal,
        color: GOLD_SPEND_OTHER_COLOR,
      });
    }
    if (unknown > 0) {
      entries.push({
        label: 'Unattributed',
        total: unknown,
        color: GOLD_SPEND_UNKNOWN_COLOR,
      });
    }
    return entries;
  }, [otherItemsTotal, topStackItems, unknown]);
  const dailyRows = useMemo(() => {
    const rows: Array<{
      day: string;
      itemName: string;
      total: number;
      quantity: number | null;
    }> = [];
    for (const day of tableDays) {
      const dailyItems = [...day.items].sort((a, b) => b.total - a.total);
      for (const item of dailyItems) {
        rows.push({
          day: day.day,
          itemName: getGoldSpendItemLabel(item),
          total: item.total,
          quantity: item.quantity,
        });
      }
      if (day.unknown > 0) {
        rows.push({
          day: day.day,
          itemName: 'Unattributed',
          total: day.unknown,
          quantity: null,
        });
      }
    }
    return rows;
  }, [tableDays]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-2 text-sm font-medium text-white/80">{title}</div>
      {!isLoading && !error && hasData ? (
        <div className="mb-3 text-xs text-white/60">
          Total: {formatCount(total)} · Unattributed: {formatCount(unknown)} ·{' '}
          Items: {sortedItems.length} · Days: {daysWithSpend}
        </div>
      ) : null}
      {isLoading ? (
        <div className="p-6 text-center text-white/60">Loading…</div>
      ) : error ? (
        <div className="p-6 text-center text-red-300">
          Failed to load: {error}
        </div>
      ) : !hasData ? (
        <div className="p-6 text-center text-white/60">No data</div>
      ) : (
        <div>
          <div className="relative h-64 w-full">
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {chartRows.map((day) => {
                const barHeightPct =
                  day.total > 0
                    ? Math.max((day.total / maxDailySpend) * 100, 1)
                    : 0;
                const tooltip =
                  day.segments.length > 0
                    ? `${day.day}: ${formatCount(day.total)} total (${day.segments
                        .map((segment) => `${segment.label} ${formatCount(segment.value)}`)
                        .join(', ')})`
                    : `${day.day}: ${formatCount(day.total)} total`;
                return (
                  <div key={day.day} className="flex-1 flex items-end h-full">
                    <div
                      className="w-full flex flex-col justify-end overflow-hidden rounded-[2px] bg-white/5"
                      title={tooltip}
                      style={{ height: `${barHeightPct}%` }}
                    >
                      {day.segments.map((segment) => (
                        <div
                          key={`${day.day}-${segment.label}`}
                          style={{
                            height: `${(segment.value / day.total) * 100}%`,
                            backgroundColor: segment.color,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="absolute inset-y-0 left-0 w-full pointer-events-none">
              <div className="absolute bottom-0 left-0 right-0 border-t border-white/10" />
              <div className="absolute bottom-1/2 left-0 right-0 border-t border-white/10" />
              <div className="absolute top-0 left-0 right-0 border-t border-white/10" />
              <div className="absolute top-0 left-2 -translate-y-1/2 text-[10px] text-white/60">
                {formatCount(maxDailySpend)}
              </div>
              <div className="absolute top-1/2 left-2 -translate-y-1/2 text-[10px] text-white/60">
                {formatCount(Math.ceil(maxDailySpend / 2))}
              </div>
              <div className="absolute bottom-0 left-2 translate-y-1/2 text-[10px] text-white/60">
                0
              </div>
            </div>
          </div>
          {legendEntries.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
              {legendEntries.map((entry) => (
                <div key={entry.label} className="flex items-center gap-2 text-white/70">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span>{entry.label}</span>
                  <span className="text-white/40">{formatCount(entry.total)}</span>
                </div>
              ))}
            </div>
          ) : null}
          {chartDays.length > 0 ? (
            <div className="mt-3 flex items-center justify-between text-xs text-white/60">
              <div>{chartDays[0]?.day}</div>
              <div>{chartDays[chartDays.length - 1]?.day}</div>
            </div>
          ) : null}
        </div>
      )}
      {!isLoading && !error && hasData && dailyRows.length > 0 ? (
        <Accordion type="single" collapsible className="mt-6">
          <AccordionItem value={`${title}-details`}>
            <AccordionTrigger>View day-by-day item breakdown</AccordionTrigger>
            <AccordionContent>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full">
                  <thead className="bg-white/5 text-white/60 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2 text-left">Day</th>
                      <th className="px-4 py-2 text-left">Item</th>
                      <th className="px-4 py-2 text-right">Gold Spent</th>
                      <th className="px-4 py-2 text-right">Quantity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-sm">
                    {dailyRows.map((row, index) => (
                      <tr
                        key={`table-${row.day}-${row.itemName}-${index}`}
                        className="hover:bg-white/5 transition"
                      >
                        <td className="px-4 py-2">{row.day}</td>
                        <td className="px-4 py-2">{row.itemName}</td>
                        <td className="px-4 py-2 text-right">
                          {formatCount(row.total)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {row.quantity == null ? '—' : formatCount(row.quantity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : null}
    </div>
  );
}

interface ShopItemPurchasesPerDayCardProps {
  title: string;
  days: GoldSpendBreakdownDay[];
  isLoading: boolean;
  error: string | null;
}

function ShopItemPurchasesPerDayCard(props: ShopItemPurchasesPerDayCardProps) {
  const { title, days, isLoading, error } = props;
  const chartDays = useMemo(() => {
    return [...days].sort((a, b) => a.day.localeCompare(b.day));
  }, [days]);
  const tableDays = useMemo(() => {
    return [...days].sort((a, b) => b.day.localeCompare(a.day));
  }, [days]);

  const sortedItems = useMemo(() => {
    const quantitiesByItem = new Map<
      string,
      { key: string; label: string; quantity: number }
    >();
    for (const day of chartDays) {
      for (const item of day.items) {
        const quantity = Math.max(0, Number(item.quantity) || 0);
        if (quantity <= 0) continue;
        const key = getGoldSpendItemKey(item);
        const label = getGoldSpendItemLabel(item);
        const existing = quantitiesByItem.get(key) ?? { key, label, quantity: 0 };
        existing.quantity += quantity;
        quantitiesByItem.set(key, existing);
      }
    }
    return Array.from(quantitiesByItem.values()).sort(
      (a, b) => b.quantity - a.quantity
    );
  }, [chartDays]);

  const topStackItems = useMemo(() => {
    const maxStackItems = 6;
    return sortedItems.slice(0, maxStackItems).map((item, index) => ({
      key: item.key,
      label: item.label,
      total: item.quantity,
      color: GOLD_SPEND_SEGMENT_COLORS[index % GOLD_SPEND_SEGMENT_COLORS.length],
    }));
  }, [sortedItems]);

  const hasOtherItems = sortedItems.length > topStackItems.length;
  const otherItemsTotal = useMemo(
    () =>
      hasOtherItems
        ? sortedItems
            .slice(topStackItems.length)
            .reduce((acc, item) => acc + item.quantity, 0)
        : 0,
    [hasOtherItems, sortedItems, topStackItems.length]
  );

  const chartRows = useMemo(() => {
    return chartDays.map((day) => {
      const quantitiesByItem = new Map<string, number>();
      for (const item of day.items) {
        const quantity = Math.max(0, Number(item.quantity) || 0);
        if (quantity <= 0) continue;
        const key = getGoldSpendItemKey(item);
        quantitiesByItem.set(key, (quantitiesByItem.get(key) ?? 0) + quantity);
      }

      const total = Array.from(quantitiesByItem.values()).reduce(
        (acc, quantity) => acc + quantity,
        0
      );

      const segments = topStackItems
        .map((item) => ({
          label: item.label,
          color: item.color,
          value: quantitiesByItem.get(item.key) ?? 0,
        }))
        .filter((segment) => segment.value > 0);

      const topTotal = segments.reduce((acc, segment) => acc + segment.value, 0);
      const otherValue = Math.max(total - topTotal, 0);
      if (hasOtherItems && otherValue > 0) {
        segments.push({
          label: 'Other Items',
          color: GOLD_SPEND_OTHER_COLOR,
          value: otherValue,
        });
      }

      return {
        day: day.day,
        total,
        segments,
      };
    });
  }, [chartDays, hasOtherItems, topStackItems]);

  const hasData = useMemo(
    () => chartRows.some((day) => day.total > 0),
    [chartRows]
  );
  const maxDailyPurchases = useMemo(
    () => Math.max(1, ...chartRows.map((day) => day.total)),
    [chartRows]
  );
  const totalPurchased = useMemo(
    () => chartRows.reduce((acc, day) => acc + day.total, 0),
    [chartRows]
  );
  const daysWithPurchases = useMemo(
    () => chartRows.filter((day) => day.total > 0).length,
    [chartRows]
  );

  const legendEntries = useMemo(() => {
    const entries = topStackItems.map((item) => ({
      label: item.label,
      total: item.total,
      color: item.color,
    }));
    if (otherItemsTotal > 0) {
      entries.push({
        label: 'Other Items',
        total: otherItemsTotal,
        color: GOLD_SPEND_OTHER_COLOR,
      });
    }
    return entries;
  }, [otherItemsTotal, topStackItems]);

  const dailyRows = useMemo(() => {
    const rows: Array<{
      day: string;
      itemName: string;
      quantity: number;
    }> = [];
    for (const day of tableDays) {
      const dailyItems = [...day.items]
        .filter((item) => (Number(item.quantity) || 0) > 0)
        .sort((a, b) => b.quantity - a.quantity);
      for (const item of dailyItems) {
        rows.push({
          day: day.day,
          itemName: getGoldSpendItemLabel(item),
          quantity: Number(item.quantity) || 0,
        });
      }
    }
    return rows;
  }, [tableDays]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-2 text-sm font-medium text-white/80">{title}</div>
      {!isLoading && !error && hasData ? (
        <div className="mb-3 text-xs text-white/60">
          Total Items: {formatCount(totalPurchased)} · Items: {sortedItems.length} ·
          Days: {daysWithPurchases}
        </div>
      ) : null}
      {isLoading ? (
        <div className="p-6 text-center text-white/60">Loading…</div>
      ) : error ? (
        <div className="p-6 text-center text-red-300">
          Failed to load: {error}
        </div>
      ) : !hasData ? (
        <div className="p-6 text-center text-white/60">No data</div>
      ) : (
        <div>
          <div className="relative h-64 w-full">
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {chartRows.map((day) => {
                const barHeightPct =
                  day.total > 0
                    ? Math.max((day.total / maxDailyPurchases) * 100, 1)
                    : 0;
                const tooltip =
                  day.segments.length > 0
                    ? `${day.day}: ${formatCount(day.total)} items (${day.segments
                        .map((segment) => `${segment.label} ${formatCount(segment.value)}`)
                        .join(', ')})`
                    : `${day.day}: ${formatCount(day.total)} items`;
                return (
                  <div key={day.day} className="flex-1 flex items-end h-full">
                    <div
                      className="w-full flex flex-col justify-end overflow-hidden rounded-[2px] bg-white/5"
                      title={tooltip}
                      style={{ height: `${barHeightPct}%` }}
                    >
                      {day.segments.map((segment) => (
                        <div
                          key={`${day.day}-${segment.label}`}
                          style={{
                            height: `${day.total > 0 ? (segment.value / day.total) * 100 : 0}%`,
                            backgroundColor: segment.color,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="absolute inset-y-0 left-0 w-full pointer-events-none">
              <div className="absolute bottom-0 left-0 right-0 border-t border-white/10" />
              <div className="absolute bottom-1/2 left-0 right-0 border-t border-white/10" />
              <div className="absolute top-0 left-0 right-0 border-t border-white/10" />
              <div className="absolute top-0 left-2 -translate-y-1/2 text-[10px] text-white/60">
                {formatCount(maxDailyPurchases)}
              </div>
              <div className="absolute top-1/2 left-2 -translate-y-1/2 text-[10px] text-white/60">
                {formatCount(Math.ceil(maxDailyPurchases / 2))}
              </div>
              <div className="absolute bottom-0 left-2 translate-y-1/2 text-[10px] text-white/60">
                0
              </div>
            </div>
          </div>
          {legendEntries.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
              {legendEntries.map((entry) => (
                <div key={entry.label} className="flex items-center gap-2 text-white/70">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span>{entry.label}</span>
                  <span className="text-white/40">{formatCount(entry.total)}</span>
                </div>
              ))}
            </div>
          ) : null}
          {chartDays.length > 0 ? (
            <div className="mt-3 flex items-center justify-between text-xs text-white/60">
              <div>{chartDays[0]?.day}</div>
              <div>{chartDays[chartDays.length - 1]?.day}</div>
            </div>
          ) : null}
        </div>
      )}
      {!isLoading && !error && hasData && dailyRows.length > 0 ? (
        <Accordion type="single" collapsible className="mt-6">
          <AccordionItem value={`${title}-details`}>
            <AccordionTrigger>View day-by-day quantity breakdown</AccordionTrigger>
            <AccordionContent>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full">
                  <thead className="bg-white/5 text-white/60 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2 text-left">Day</th>
                      <th className="px-4 py-2 text-left">Item</th>
                      <th className="px-4 py-2 text-right">Purchased</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-sm">
                    {dailyRows.map((row, index) => (
                      <tr
                        key={`table-qty-${row.day}-${row.itemName}-${index}`}
                        className="hover:bg-white/5 transition"
                      >
                        <td className="px-4 py-2">{row.day}</td>
                        <td className="px-4 py-2">{row.itemName}</td>
                        <td className="px-4 py-2 text-right">
                          {formatCount(row.quantity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : null}
    </div>
  );
}

interface StatsSectionProps {
  fromIso: string;
  toIso: string;
}

function ActiveUsersCard({ fromIso, toIso }: StatsSectionProps) {
  const activeUsers = useActiveUsersSeries(fromIso, toIso);
  const activeMax = useMemo(() => {
    return Math.max(
      1,
      ...activeUsers.series.map((point) => Math.max(point.mau ?? 0, point.dau ?? 0))
    );
  }, [activeUsers.series]);
  const activeAverages = useMemo(() => {
    if (!activeUsers.series.length) return { avgDau: 0, avgMau: 0 };
    const sumDau = activeUsers.series.reduce((acc, point) => acc + (point.dau ?? 0), 0);
    const sumMau = activeUsers.series.reduce((acc, point) => acc + (point.mau ?? 0), 0);
    return {
      avgDau: sumDau / activeUsers.series.length,
      avgMau: sumMau / activeUsers.series.length,
    };
  }, [activeUsers.series]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-2 text-sm font-medium text-white/80">DAU / MAU</div>
      {!activeUsers.isLoading && !activeUsers.error && activeUsers.series.length > 0 ? (
        <div className="mb-3 text-xs text-white/60">
          Avg DAU: {activeAverages.avgDau.toFixed(1)} · Avg MAU:{' '}
          {activeAverages.avgMau.toFixed(1)} · Max: {activeMax.toFixed(0)}
        </div>
      ) : null}
      {activeUsers.isLoading ? (
        <div className="p-6 text-center text-white/60">Loading…</div>
      ) : activeUsers.error ? (
        <div className="p-6 text-center text-red-300">
          Failed to load: {activeUsers.error}
        </div>
      ) : activeUsers.series.length === 0 ? (
        <div className="p-6 text-center text-white/60">No data</div>
      ) : (
        <div className="relative h-64 w-full">
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {activeUsers.series.map((point) => {
              const mauHRaw = (point.mau / activeMax) * 100;
              const dauHRaw = (point.dau / activeMax) * 100;
              const mauH = point.mau > 0 ? Math.max(mauHRaw, 1) : 0;
              const dauH = point.dau > 0 ? Math.max(dauHRaw, 1) : 0;
              const dauMauPercent =
                point.mau > 0 ? (point.dau / point.mau) * 100 : null;
              const dauMauLabel =
                dauMauPercent === null ? '—' : formatPercent(dauMauPercent);
              const title = `${point.day}: DAU ${point.dau}, MAU ${point.mau}, DAU/MAU ${dauMauLabel}`;
              return (
                <div key={point.day} className="relative flex-1 h-full">
                  <div
                    title={title}
                    className="absolute bottom-0 left-0 right-0 bg-amber-400/60 hover:bg-amber-300 transition-colors"
                    style={{ height: `${mauH}%` }}
                  />
                  <div
                    title={title}
                    className="absolute bottom-0 left-1/4 right-1/4 bg-sky-400/80 hover:bg-sky-300 transition-colors"
                    style={{ height: `${dauH}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="absolute inset-y-0 left-0 w-full pointer-events-none">
            <div className="absolute bottom-0 left-0 right-0 border-t border-white/10" />
            <div className="absolute bottom-1/2 left-0 right-0 border-t border-white/10" />
            <div className="absolute top-0 left-0 right-0 border-t border-white/10" />
            <div className="absolute top-0 left-2 -translate-y-1/2 text-[10px] text-white/60">
              {activeMax.toFixed(0)}
            </div>
            <div className="absolute top-1/2 left-2 -translate-y-1/2 text-[10px] text-white/60">
              {Math.ceil(activeMax / 2)}
            </div>
            <div className="absolute bottom-0 left-2 translate-y-1/2 text-[10px] text-white/60">
              0
            </div>
          </div>
        </div>
      )}
      {!activeUsers.isLoading && !activeUsers.error && activeUsers.series.length > 0 ? (
        <div className="mt-3 flex items-center justify-between text-xs text-white/60">
          <div>{activeUsers.series[0]?.day}</div>
          <div>{activeUsers.series[activeUsers.series.length - 1]?.day}</div>
        </div>
      ) : null}
      {!activeUsers.isLoading && !activeUsers.error && activeUsers.series.length > 0 ? (
        <Accordion type="single" collapsible className="mt-6">
          <AccordionItem value="active-details">
            <AccordionTrigger>View daily details</AccordionTrigger>
            <AccordionContent>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full">
                  <thead className="bg-white/5 text-white/60 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2 text-left">Day</th>
                      <th className="px-4 py-2 text-right">DAU</th>
                      <th className="px-4 py-2 text-right">MAU</th>
                      <th className="px-4 py-2 text-right">DAU/MAU %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-sm">
                    {activeUsers.series.map((point) => {
                      const dauMauPercent =
                        point.mau > 0 ? (point.dau / point.mau) * 100 : null;
                      return (
                        <tr key={point.day} className="hover:bg-white/5 transition">
                          <td className="px-4 py-2">{point.day}</td>
                          <td className="px-4 py-2 text-right">{point.dau}</td>
                          <td className="px-4 py-2 text-right">{point.mau}</td>
                          <td className="px-4 py-2 text-right">
                            {dauMauPercent === null ? '—' : formatPercent(dauMauPercent)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : null}
    </div>
  );
}

function ActivityStatsSection({ fromIso, toIso }: StatsSectionProps) {
  const matches = useDailyCountSeries('/api/stats/matches-per-day', fromIso, toIso);
  const dailyRuns = useDailyCountSeries('/api/stats/daily-runs-used', fromIso, toIso);
  const competitionRuns = useDailyCountSeries(
    '/api/stats/competition-runs-used',
    fromIso,
    toIso
  );
  const tradeRunTokens = useTradeRunTokensSeries(fromIso, toIso);
  const tradeRunDirections = useTradeRunDirectionsSeries(fromIso, toIso);
  const tradeRunLeverage = useTradeRunLeverageSeries(fromIso, toIso);
  const tradeRunsPerDay = useMemo(
    () =>
      tradeRunTokens.series.map((point) => ({
        day: point.day,
        count: point.btc + point.eth + point.ghst,
      })),
    [tradeRunTokens.series]
  );
  const tradeRunTokenMixSeries = useMemo(
    () =>
      tradeRunTokens.series.map((point) => ({
        day: point.day,
        values: [
          {
            label: 'BTC',
            color: TRADE_RUN_TOKEN_COLORS.BTC,
            value: point.btc,
          },
          {
            label: 'ETH',
            color: TRADE_RUN_TOKEN_COLORS.ETH,
            value: point.eth,
          },
          {
            label: 'GHST',
            color: TRADE_RUN_TOKEN_COLORS.GHST,
            value: point.ghst,
          },
        ],
      })),
    [tradeRunTokens.series]
  );
  const tradeRunDirectionMixSeries = useMemo(
    () =>
      tradeRunDirections.series.map((point) => ({
        day: point.day,
        values: [
          {
            label: 'Long',
            color: TRADE_RUN_DIRECTION_COLORS.Long,
            value: point.long,
          },
          {
            label: 'Short',
            color: TRADE_RUN_DIRECTION_COLORS.Short,
            value: point.short,
          },
        ],
      })),
    [tradeRunDirections.series]
  );

  return (
    <>
      <CountChartCard
        title="Matches per day"
        series={matches.series}
        isLoading={matches.isLoading}
        error={matches.error}
        accentClassName="bg-emerald-400/80 hover:bg-emerald-300"
        valueLabel="Matches"
      />
      <CountChartCard
        title="Daily runs used"
        series={dailyRuns.series}
        isLoading={dailyRuns.isLoading}
        error={dailyRuns.error}
        accentClassName="bg-cyan-400/80 hover:bg-cyan-300"
        valueLabel="Runs"
      />
      <CountChartCard
        title="Competition runs used"
        series={competitionRuns.series}
        isLoading={competitionRuns.isLoading}
        error={competitionRuns.error}
        accentClassName="bg-purple-400/80 hover:bg-purple-300"
        valueLabel="Runs"
      />
      <CountChartCard
        title="Trade runs per day"
        series={tradeRunsPerDay}
        isLoading={tradeRunTokens.isLoading}
        error={tradeRunTokens.error}
        accentClassName="bg-amber-400/80 hover:bg-amber-300"
        valueLabel="Trade runs"
      />
      <SegmentedBarsCard
        title="Trade Run token mix per day"
        series={tradeRunTokenMixSeries}
        isLoading={tradeRunTokens.isLoading}
        error={tradeRunTokens.error}
        unitLabel="Runs"
      />
      <SegmentedBarsCard
        title="Trade Run direction mix per day"
        series={tradeRunDirectionMixSeries}
        isLoading={tradeRunDirections.isLoading}
        error={tradeRunDirections.error}
        unitLabel="Runs"
      />
      <TradeRunLeverageHeatmapCard
        title="Trade Run leverage heatmap"
        series={tradeRunLeverage.series}
        isLoading={tradeRunLeverage.isLoading}
        error={tradeRunLeverage.error}
      />
      <ActiveUsersCard fromIso={fromIso} toIso={toIso} />
    </>
  );
}

function ProgressionStatsSection({ fromIso, toIso }: StatsSectionProps) {
  const xpGained = useDailyCountSeries('/api/stats/xp-gained-per-day', fromIso, toIso);
  const floorsCleared = useDailyCountSeries(
    '/api/stats/floors-cleared-per-day',
    fromIso,
    toIso
  );
  const enemyKills = useDailyCountSeries('/api/stats/enemy-kills-per-day', fromIso, toIso);

  return (
    <>
      <CountChartCard
        title="XP gained per day"
        series={xpGained.series}
        isLoading={xpGained.isLoading}
        error={xpGained.error}
        accentClassName="bg-amber-400/80 hover:bg-amber-300"
        valueLabel="XP"
      />
      <CountChartCard
        title="Floors cleared per day"
        series={floorsCleared.series}
        isLoading={floorsCleared.isLoading}
        error={floorsCleared.error}
        accentClassName="bg-indigo-400/80 hover:bg-indigo-300"
        valueLabel="Floors"
      />
      <CountChartCard
        title="Enemies killed per day"
        series={enemyKills.series}
        isLoading={enemyKills.isLoading}
        error={enemyKills.error}
        accentClassName="bg-rose-400/80 hover:bg-rose-300"
        valueLabel="Kills"
      />
    </>
  );
}

function EconomyStatsSection({ fromIso, toIso }: StatsSectionProps) {
  const tokenAllocations = useTokenAllocationsSeries(
    '/api/stats/token-allocations-per-day',
    fromIso,
    toIso
  );
  const withdrawals = useCurrencyTotalsSeries(
    '/api/stats/withdrawals-per-day',
    fromIso,
    toIso
  );
  const goldEarned = useDailyCountSeries('/api/stats/gold-earned-per-day', fromIso, toIso);
  const goldTotal = useDailyCountSeries('/api/stats/gold-total-per-day', fromIso, toIso);
  const lickTonguesEarned = useDailyCountSeries(
    '/api/stats/lick-tongues-earned-per-day',
    fromIso,
    toIso
  );
  const lickTonguesSpent = useDailyCountSeries(
    '/api/stats/lick-tongues-spent-per-day',
    fromIso,
    toIso
  );
  const lickTonguesTotal = useDailyCountSeries(
    '/api/stats/lick-tongues-total-per-day',
    fromIso,
    toIso
  );

  return (
    <>
      <TokenAllocationsCard
        title="USDC / GHO / GHST allocated per day"
        series={tokenAllocations.series}
        isLoading={tokenAllocations.isLoading}
        error={tokenAllocations.error}
      />
      <CurrencyTotalsCard
        title="Withdrawals per day"
        series={withdrawals.series}
        isLoading={withdrawals.isLoading}
        error={withdrawals.error}
      />
      <CountChartCard
        title="Gold earned per day"
        series={goldEarned.series}
        isLoading={goldEarned.isLoading}
        error={goldEarned.error}
        accentClassName="bg-yellow-400/80 hover:bg-yellow-300"
        valueLabel="Gold"
      />
      <CountChartCard
        title="Total gold in economy (net)"
        series={goldTotal.series}
        isLoading={goldTotal.isLoading}
        error={goldTotal.error}
        accentClassName="bg-lime-400/80 hover:bg-lime-300"
        valueLabel="Gold"
      />
      <CountChartCard
        title="Lick tongues earned per day"
        series={lickTonguesEarned.series}
        isLoading={lickTonguesEarned.isLoading}
        error={lickTonguesEarned.error}
        accentClassName="bg-pink-400/80 hover:bg-pink-300"
        valueLabel="Tongues"
      />
      <CountChartCard
        title="Lick tongues spent per day"
        series={lickTonguesSpent.series}
        isLoading={lickTonguesSpent.isLoading}
        error={lickTonguesSpent.error}
        accentClassName="bg-fuchsia-400/80 hover:bg-fuchsia-300"
        valueLabel="Tongues"
      />
      <CountChartCard
        title="Total lick tongues in economy (net)"
        series={lickTonguesTotal.series}
        isLoading={lickTonguesTotal.isLoading}
        error={lickTonguesTotal.error}
        accentClassName="bg-violet-400/80 hover:bg-violet-300"
        valueLabel="Tongues"
      />
    </>
  );
}

function SpendingStatsSection({ fromIso, toIso }: StatsSectionProps) {
  const repairItems = useDailyCountSeries(
    '/api/stats/items-repaired-per-day',
    fromIso,
    toIso
  );
  const repairGoldSpent = useDailyCountSeries(
    '/api/stats/gold-spent-on-repairs-per-day',
    fromIso,
    toIso
  );
  const forgeGoldSpent = useDailyCountSeries(
    '/api/stats/forge-gold-spent-per-day',
    fromIso,
    toIso
  );
  const forgeCountsByRarity = useForgeCountsByRaritySeries(fromIso, toIso);
  const goldSpentBreakdown = useGoldSpendBreakdown(fromIso, toIso);
  const forgeRaritySeries = useMemo(
    () =>
      forgeCountsByRarity.series.map((point) => ({
        day: point.day,
        values: [
          {
            label: 'Common',
            color: FORGE_RARITY_COLORS.Common,
            value: point.common,
          },
          {
            label: 'Uncommon',
            color: FORGE_RARITY_COLORS.Uncommon,
            value: point.uncommon,
          },
          {
            label: 'Rare',
            color: FORGE_RARITY_COLORS.Rare,
            value: point.rare,
          },
          {
            label: 'Legendary',
            color: FORGE_RARITY_COLORS.Legendary,
            value: point.legendary,
          },
          {
            label: 'Mythical',
            color: FORGE_RARITY_COLORS.Mythical,
            value: point.mythical,
          },
          {
            label: 'Godlike',
            color: FORGE_RARITY_COLORS.Godlike,
            value: point.godlike,
          },
        ],
      })),
    [forgeCountsByRarity.series]
  );

  return (
    <>
      <CountChartCard
        title="Items repaired per day"
        series={repairItems.series}
        isLoading={repairItems.isLoading}
        error={repairItems.error}
        accentClassName="bg-orange-400/80 hover:bg-orange-300"
        valueLabel="Items"
        treatAllZeroAsNoData
      />
      <CountChartCard
        title="Gold spent on repairs per day"
        series={repairGoldSpent.series}
        isLoading={repairGoldSpent.isLoading}
        error={repairGoldSpent.error}
        accentClassName="bg-amber-500/80 hover:bg-amber-400"
        valueLabel="Gold"
        treatAllZeroAsNoData
      />
      <SegmentedBarsCard
        title="Forges per day by rarity"
        series={forgeRaritySeries}
        isLoading={forgeCountsByRarity.isLoading}
        error={forgeCountsByRarity.error}
        unitLabel="Forges"
      />
      <CountChartCard
        title="Gold consumed via forging per day"
        series={forgeGoldSpent.series}
        isLoading={forgeGoldSpent.isLoading}
        error={forgeGoldSpent.error}
        accentClassName="bg-orange-400/80 hover:bg-orange-300"
        valueLabel="Gold"
      />
      <GoldSpendBreakdownCard
        title="Gold spent per item per day"
        items={goldSpentBreakdown.items}
        days={goldSpentBreakdown.days}
        total={goldSpentBreakdown.total}
        unknown={goldSpentBreakdown.unknown}
        isLoading={goldSpentBreakdown.isLoading}
        error={goldSpentBreakdown.error}
      />
      <ShopItemPurchasesPerDayCard
        title="Shop items purchased per day"
        days={goldSpentBreakdown.days}
        isLoading={goldSpentBreakdown.isLoading}
        error={goldSpentBreakdown.error}
      />
    </>
  );
}

export function AdminStatsClient() {
  const [range, setRange] = useState<RangeKey>('30');
  const [activeCategory, setActiveCategory] =
    useState<StatsCategoryKey>('activity');
  const [visitedCategories, setVisitedCategories] = useState<StatsCategoryKey[]>([
    'activity',
  ]);
  const { from: fromIso, to: toIso } = useMemo(() => computeFromTo(range), [range]);
  const activeCategoryMeta =
    STATS_CATEGORIES.find((category) => category.key === activeCategory) ??
    STATS_CATEGORIES[0];

  function showCategory(category: StatsCategoryKey) {
    setActiveCategory(category);
    setVisitedCategories((current) =>
      current.includes(category) ? current : [...current, category]
    );
  }

  return (
    <div className="space-y-6">
      <div className="sticky top-4 z-20">
        <div
          aria-hidden="true"
          className="absolute inset-x-3 -inset-y-2 -z-10 rounded-[2rem] bg-slate-950/25 backdrop-blur-md"
        />
        <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <div className="overflow-x-auto">
            <div
              role="tablist"
              aria-label="Stats categories"
              className="flex min-w-max gap-2"
            >
              {STATS_CATEGORIES.map((category) => {
                const isActive = category.key === activeCategory;
                return (
                  <button
                    key={category.key}
                    id={`stats-tab-${category.key}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`stats-panel-${category.key}`}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => showCategory(category.key)}
                    className={`rounded-full border px-4 py-2 text-sm transition ${
                      isActive
                        ? 'border-white/30 bg-white/20 text-white'
                        : 'border-white/10 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {category.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-white/70">Range:</div>
            <div className="flex items-center gap-2">
              {(['7', '30', '90'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRange(value)}
                  className={`rounded-md border px-3 py-1.5 text-sm transition ${
                    range === value
                      ? 'border-white/20 bg-white/20 text-white'
                      : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'
                  }`}
                >
                  Last {value}d
                </button>
              ))}
            </div>
            <div className="ml-auto text-sm text-white/60">
              {fromIso && toIso ? (
                <span>
                  {new Date(fromIso).toLocaleDateString()} →{' '}
                  {new Date(toIso).toLocaleDateString()}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-white/45">
          {activeCategoryMeta.label}
        </div>
        <p className="mt-2 text-sm text-white/70">{activeCategoryMeta.description}</p>
      </div>

      {visitedCategories.includes('activity') ? (
        <div
          role="tabpanel"
          id="stats-panel-activity"
          aria-labelledby="stats-tab-activity"
          hidden={activeCategory !== 'activity'}
          className="space-y-6"
        >
          <ActivityStatsSection fromIso={fromIso} toIso={toIso} />
        </div>
      ) : null}
      {visitedCategories.includes('progression') ? (
        <div
          role="tabpanel"
          id="stats-panel-progression"
          aria-labelledby="stats-tab-progression"
          hidden={activeCategory !== 'progression'}
          className="space-y-6"
        >
          <ProgressionStatsSection fromIso={fromIso} toIso={toIso} />
        </div>
      ) : null}
      {visitedCategories.includes('economy') ? (
        <div
          role="tabpanel"
          id="stats-panel-economy"
          aria-labelledby="stats-tab-economy"
          hidden={activeCategory !== 'economy'}
          className="space-y-6"
        >
          <EconomyStatsSection fromIso={fromIso} toIso={toIso} />
        </div>
      ) : null}
      {visitedCategories.includes('spending') ? (
        <div
          role="tabpanel"
          id="stats-panel-spending"
          aria-labelledby="stats-tab-spending"
          hidden={activeCategory !== 'spending'}
          className="space-y-6"
        >
          <SpendingStatsSection fromIso={fromIso} toIso={toIso} />
        </div>
      ) : null}
    </div>
  );
}
