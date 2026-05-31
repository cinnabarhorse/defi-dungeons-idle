import type { Application, Request, Response } from 'express';
import { statsRepo } from '../lib/db';
import { parseTimestamp } from './admin/utils';

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

type GoldSpendBreakdown = {
  items: GoldSpendBreakdownItem[];
  total: number;
  unknown: number;
  days: GoldSpendBreakdownDay[];
};

type SpendItemMeta = {
  itemId?: string | null;
  itemName?: string | null;
  quantity?: number;
  price?: number;
  total?: number;
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  return '';
}

function extractSpendItems(metadata: Record<string, unknown>) {
  const rawItems =
    (Array.isArray(metadata.items) && metadata.items) ||
    (Array.isArray(metadata.purchases) && metadata.purchases) ||
    [];

  const items: SpendItemMeta[] = rawItems
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const record = item as Record<string, unknown>;
      return {
        itemId: toString(record.itemId) || null,
        itemName:
          toString(record.itemName) ||
          toString(record.name) ||
          toString(record.label) ||
          null,
        quantity: toNumber(record.quantity),
        price: toNumber(record.price),
        total: toNumber(record.total),
      };
    })
    .filter((item) => item.itemId || item.itemName);

  if (items.length > 0) {
    return { items };
  }

  const potionName = toString(metadata.potionName);
  const potionDelta = toNumber(metadata.potionDelta);
  const pricePerPotion = toNumber(metadata.pricePerPotion);
  if (potionName && potionDelta > 0 && pricePerPotion > 0) {
    return {
      items: [
        {
          itemName: potionName,
          quantity: potionDelta,
          price: pricePerPotion,
          total: potionDelta * pricePerPotion,
        },
      ],
    };
  }

  const shopItemName = toString(metadata.shopItemName);
  const shopItemId = toString(metadata.shopItemId);
  const shopQuantity = toNumber(metadata.quantity);
  const shopPrice = toNumber(metadata.price);
  if ((shopItemName || shopItemId) && shopPrice > 0) {
    return {
      items: [
        {
          itemId: shopItemId || null,
          itemName: shopItemName || null,
          quantity: shopQuantity || 1,
          price: shopPrice,
          total: shopPrice * (shopQuantity || 1),
        },
      ],
    };
  }

  return { items: [] };
}

type GoldSpendAccumulator = {
  byItem: Map<string, GoldSpendBreakdownItem>;
  total: number;
  unknown: number;
};

function createGoldSpendAccumulator(): GoldSpendAccumulator {
  return {
    byItem: new Map<string, GoldSpendBreakdownItem>(),
    total: 0,
    unknown: 0,
  };
}

function addGoldSpendEventToAccumulator(
  accumulator: GoldSpendAccumulator,
  event: { delta: number; metadata: Record<string, unknown> }
) {
  const delta = Math.abs(toNumber(event.delta));
  if (delta <= 0) return;
  accumulator.total += delta;

  const { items } = extractSpendItems(event.metadata ?? {});
  if (!items.length) {
    accumulator.unknown += delta;
    return;
  }

  let accounted = 0;
  for (const item of items) {
    const quantity = Math.max(0, toNumber(item.quantity));
    const price = Math.max(0, toNumber(item.price));
    let itemTotal = Math.max(0, toNumber(item.total));
    if (!itemTotal && price > 0 && quantity > 0) {
      itemTotal = price * quantity;
    }
    if (!itemTotal && items.length === 1) {
      itemTotal = delta;
    }
    if (!itemTotal) continue;
    accounted += itemTotal;

    const itemName =
      toString(item.itemName) || toString(item.itemId) || 'Unknown Item';
    const itemId = toString(item.itemId) || null;
    const key = itemId ? `id:${itemId}` : `name:${itemName.toLowerCase()}`;
    const existing = accumulator.byItem.get(key) ?? {
      itemId,
      itemName,
      total: 0,
      quantity: 0,
    };
    existing.total += itemTotal;
    existing.quantity += quantity;
    accumulator.byItem.set(key, existing);
  }

  if (accounted < delta) {
    accumulator.unknown += delta - accounted;
  }
}

function finalizeGoldSpendAccumulator(
  accumulator: GoldSpendAccumulator
): Omit<GoldSpendBreakdownDay, 'day'> {
  return {
    items: Array.from(accumulator.byItem.values()).sort((a, b) => b.total - a.total),
    total: accumulator.total,
    unknown: accumulator.unknown,
  };
}

function buildGoldSpendBreakdown(
  events: { day: string; delta: number; metadata: Record<string, unknown> }[]
): GoldSpendBreakdown {
  const overall = createGoldSpendAccumulator();
  const byDay = new Map<string, GoldSpendAccumulator>();

  for (const event of events) {
    addGoldSpendEventToAccumulator(overall, event);

    const day = toString(event.day);
    if (!day) continue;
    const dayAccumulator = byDay.get(day) ?? createGoldSpendAccumulator();
    addGoldSpendEventToAccumulator(dayAccumulator, event);
    if (!byDay.has(day)) {
      byDay.set(day, dayAccumulator);
    }
  }

  const daily = Array.from(byDay.entries())
    .map(([day, accumulator]) => ({
      day,
      ...finalizeGoldSpendAccumulator(accumulator),
    }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return {
    ...finalizeGoldSpendAccumulator(overall),
    days: daily,
  };
}

export function registerStatsRoutes(app: Application) {
  app.get('/api/stats/matches-per-day', async (req: Request, res: Response) => {
    const from = parseTimestamp(req.query.from);
    const to = parseTimestamp(req.query.to);
    try {
      const series = await statsRepo.getMatchesPerDay({
        fromIso: from,
        toIso: to,
      });
      res.json({
        series,
        from: from ?? null,
        to: to ?? null,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to load matches-per-day',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get(
    '/api/stats/token-allocations-per-day',
    async (req: Request, res: Response) => {
      const from = parseTimestamp(req.query.from);
      const to = parseTimestamp(req.query.to);
      try {
        const series = await statsRepo.getTokenAllocationsPerDay({
          fromIso: from,
          toIso: to,
        });
        res.json({
          series,
          from: from ?? null,
          to: to ?? null,
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to load token-allocations-per-day',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  app.get('/api/stats/active-users', async (req: Request, res: Response) => {
    const from = parseTimestamp(req.query.from);
    const to = parseTimestamp(req.query.to);
    const windowParam = req.query.windowDays;
    const windowDays =
      typeof windowParam === 'string' ? Number(windowParam) : undefined;
    try {
      const series = await statsRepo.getActiveUsersPerDay({
        fromIso: from ?? undefined,
        toIso: to ?? undefined,
        windowDays: Number.isFinite(windowDays) ? windowDays : undefined,
      });
      res.json({
        series,
        from: from ?? null,
        to: to ?? null,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to load active-users',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });
  app.get('/api/stats/daily-runs-used', async (req: Request, res: Response) => {
    const from = parseTimestamp(req.query.from);
    const to = parseTimestamp(req.query.to);
    try {
      const series = await statsRepo.getDailyRunsUsed({
        fromIso: from,
        toIso: to,
      });
      res.json({
        series,
        from: from ?? null,
        to: to ?? null,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to load daily-runs-used',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get(
    '/api/stats/competition-runs-used',
    async (req: Request, res: Response) => {
      const from = parseTimestamp(req.query.from);
      const to = parseTimestamp(req.query.to);
      try {
        const series = await statsRepo.getCompetitionRunsUsed({
          fromIso: from,
          toIso: to,
        });
        res.json({
          series,
          from: from ?? null,
          to: to ?? null,
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to load competition-runs-used',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  app.get(
    '/api/stats/trade-run-tokens-per-day',
    async (req: Request, res: Response) => {
      const from = parseTimestamp(req.query.from);
      const to = parseTimestamp(req.query.to);
      try {
        const series = await statsRepo.getTradeRunTokensPerDay({
          fromIso: from,
          toIso: to,
        });
        res.json({
          series,
          from: from ?? null,
          to: to ?? null,
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to load trade-run-tokens-per-day',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  app.get(
    '/api/stats/trade-run-directions-per-day',
    async (req: Request, res: Response) => {
      const from = parseTimestamp(req.query.from);
      const to = parseTimestamp(req.query.to);
      try {
        const series = await statsRepo.getTradeRunDirectionsPerDay({
          fromIso: from,
          toIso: to,
        });
        res.json({
          series,
          from: from ?? null,
          to: to ?? null,
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to load trade-run-directions-per-day',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  app.get(
    '/api/stats/trade-run-leverage-per-day',
    async (req: Request, res: Response) => {
      const from = parseTimestamp(req.query.from);
      const to = parseTimestamp(req.query.to);
      try {
        const series = await statsRepo.getTradeRunLeveragePerDay({
          fromIso: from,
          toIso: to,
        });
        res.json({
          series,
          from: from ?? null,
          to: to ?? null,
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to load trade-run-leverage-per-day',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  app.get(
    '/api/stats/withdrawals-per-day',
    async (req: Request, res: Response) => {
      const from = parseTimestamp(req.query.from);
      const to = parseTimestamp(req.query.to);
      try {
        const series = await statsRepo.getWithdrawalsPerDay({
          fromIso: from,
          toIso: to,
        });
        res.json({
          series,
          from: from ?? null,
          to: to ?? null,
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to load withdrawals-per-day',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  app.get('/api/stats/deposits-per-day', async (req: Request, res: Response) => {
    const from = parseTimestamp(req.query.from);
    const to = parseTimestamp(req.query.to);
    try {
      const series = await statsRepo.getDepositsPerDay({
        fromIso: from,
        toIso: to,
      });
      res.json({
        series,
        from: from ?? null,
        to: to ?? null,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to load deposits-per-day',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get('/api/stats/xp-gained-per-day', async (req: Request, res: Response) => {
    const from = parseTimestamp(req.query.from);
    const to = parseTimestamp(req.query.to);
    try {
      const series = await statsRepo.getXpGainedPerDay({
        fromIso: from,
        toIso: to,
      });
      res.json({
        series,
        from: from ?? null,
        to: to ?? null,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to load xp-gained-per-day',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get(
    '/api/stats/floors-cleared-per-day',
    async (req: Request, res: Response) => {
      const from = parseTimestamp(req.query.from);
      const to = parseTimestamp(req.query.to);
      try {
        const series = await statsRepo.getFloorsClearedPerDay({
          fromIso: from,
          toIso: to,
        });
        res.json({
          series,
          from: from ?? null,
          to: to ?? null,
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to load floors-cleared-per-day',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  app.get(
    '/api/stats/enemy-kills-per-day',
    async (req: Request, res: Response) => {
      const from = parseTimestamp(req.query.from);
      const to = parseTimestamp(req.query.to);
      try {
        const series = await statsRepo.getEnemyKillsPerDay({
          fromIso: from,
          toIso: to,
        });
        res.json({
          series,
          from: from ?? null,
          to: to ?? null,
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to load enemy-kills-per-day',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );


  app.get('/api/stats/gold-earned-per-day', async (req: Request, res: Response) => {
    const from = parseTimestamp(req.query.from);
    const to = parseTimestamp(req.query.to);
    try {
      const flow = await statsRepo.getGoldFlowPerDay({ fromIso: from, toIso: to });
      const series = flow.map((p) => ({ day: p.day, count: p.earned }));
      res.json({ series, from: from ?? null, to: to ?? null });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to load gold-earned-per-day',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get('/api/stats/items-repaired-per-day', async (req: Request, res: Response) => {
    const from = parseTimestamp(req.query.from);
    const to = parseTimestamp(req.query.to);
    try {
      const series = await statsRepo.getRepairItemsPerDay({
        fromIso: from,
        toIso: to,
      });
      res.json({ series, from: from ?? null, to: to ?? null });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to load items-repaired-per-day',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get(
    '/api/stats/gold-spent-on-repairs-per-day',
    async (req: Request, res: Response) => {
      const from = parseTimestamp(req.query.from);
      const to = parseTimestamp(req.query.to);
      try {
        const series = await statsRepo.getRepairGoldSpentPerDay({
          fromIso: from,
          toIso: to,
        });
        res.json({ series, from: from ?? null, to: to ?? null });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to load gold-spent-on-repairs-per-day',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  app.get('/api/stats/gold-spent-per-day', async (req: Request, res: Response) => {
    const from = parseTimestamp(req.query.from);
    const to = parseTimestamp(req.query.to);
    try {
      const flow = await statsRepo.getGoldFlowPerDay({ fromIso: from, toIso: to });
      const series = flow.map((p) => ({ day: p.day, count: p.spent }));
      res.json({ series, from: from ?? null, to: to ?? null });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to load gold-spent-per-day',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get('/api/stats/gold-spent-breakdown', async (req: Request, res: Response) => {
    const from = parseTimestamp(req.query.from);
    const to = parseTimestamp(req.query.to);
    try {
      const events = await statsRepo.getGoldSpendEvents({
        fromIso: from,
        toIso: to,
      });
      const breakdown = buildGoldSpendBreakdown(events);
      res.json({
        items: breakdown.items,
        total: breakdown.total,
        unknown: breakdown.unknown,
        days: breakdown.days,
        from: from ?? null,
        to: to ?? null,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to load gold-spent-breakdown',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get('/api/stats/gold-total-per-day', async (req: Request, res: Response) => {
    const from = parseTimestamp(req.query.from);
    const to = parseTimestamp(req.query.to);
    try {
      const total = await statsRepo.getGoldTotalPerDay({ fromIso: from, toIso: to });
      const series = total.map((p) => ({ day: p.day, count: p.total }));
      res.json({ series, from: from ?? null, to: to ?? null });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to load gold-total-per-day',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get('/api/stats/forge-gold-spent-per-day', async (req: Request, res: Response) => {
    const from = parseTimestamp(req.query.from);
    const to = parseTimestamp(req.query.to);
    try {
      const series = await statsRepo.getForgeGoldSpentPerDay({
        fromIso: from,
        toIso: to,
      });
      res.json({ series, from: from ?? null, to: to ?? null });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to load forge-gold-spent-per-day',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get(
    '/api/stats/forge-counts-per-day-by-rarity',
    async (req: Request, res: Response) => {
      const from = parseTimestamp(req.query.from);
      const to = parseTimestamp(req.query.to);
      try {
        const series = await statsRepo.getForgeCountsPerDayByRarity({
          fromIso: from,
          toIso: to,
        });
        res.json({ series, from: from ?? null, to: to ?? null });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to load forge-counts-per-day-by-rarity',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  app.get('/api/stats/lick-tongues-earned-per-day', async (req: Request, res: Response) => {
    const from = parseTimestamp(req.query.from);
    const to = parseTimestamp(req.query.to);
    try {
      const flow = await statsRepo.getLickTongueFlowPerDay({ fromIso: from, toIso: to });
      const series = flow.map((p) => ({ day: p.day, count: p.earned }));
      res.json({ series, from: from ?? null, to: to ?? null });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to load lick-tongues-earned-per-day',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get('/api/stats/lick-tongues-spent-per-day', async (req: Request, res: Response) => {
    const from = parseTimestamp(req.query.from);
    const to = parseTimestamp(req.query.to);
    try {
      const flow = await statsRepo.getLickTongueFlowPerDay({ fromIso: from, toIso: to });
      const series = flow.map((p) => ({ day: p.day, count: p.spent }));
      res.json({ series, from: from ?? null, to: to ?? null });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to load lick-tongues-spent-per-day',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get('/api/stats/lick-tongues-total-per-day', async (req: Request, res: Response) => {
    const from = parseTimestamp(req.query.from);
    const to = parseTimestamp(req.query.to);
    try {
      const total = await statsRepo.getLickTongueTotalPerDay({ fromIso: from, toIso: to });
      const series = total.map((p) => ({ day: p.day, count: p.total }));
      res.json({ series, from: from ?? null, to: to ?? null });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to load lick-tongues-total-per-day',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

}
