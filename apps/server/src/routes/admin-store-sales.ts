import type { Application, Request, Response } from 'express';
import { requireAdminSession } from './admin-auth';
import { logError } from '../lib/http-logging';
import {
  economyRepo,
  globalEconomyCountersRepo,
  playersRepo,
} from '../lib/db';
import { EQUIPMENT_SELL_DAILY_CAP } from '../lib/inventory-sell';

const INVENTORY_SELL_SOURCE = 'inventory_sell';
const EQUIPMENT_SELL_GOLD_COUNTER = 'equipment_sell_gold';

function parseDateParam(value: string | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const date = new Date(trimmed + 'T00:00:00.000Z');
  if (!Number.isFinite(date.getTime())) return null;
  return trimmed;
}

function getTodayUtc(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface StoreSaleItemRow {
  transactionId: string;
  playerId: string;
  playerUsername: string | null;
  createdAt: string | null;
  itemType: string;
  itemName: string;
  quantity: number;
  payout: number;
  quality: string | null;
  rarity: string | null;
}

function flattenSales(
  transactions: Array<{
    id: string;
    playerId: string;
    metadata: Record<string, unknown>;
    createdAt: string | null;
  }>,
  usernameByPlayerId: Record<string, string | null>
): StoreSaleItemRow[] {
  const rows: StoreSaleItemRow[] = [];
  const items = (meta: Record<string, unknown>): Array<Record<string, unknown>> => {
    const raw = meta?.items;
    if (!Array.isArray(raw)) return [];
    return raw as Array<Record<string, unknown>>;
  };
  for (const tx of transactions) {
    const meta = tx.metadata || {};
    const lineItems = items(meta);
    const playerUsername = usernameByPlayerId[tx.playerId] ?? null;
    if (lineItems.length === 0) {
      rows.push({
        transactionId: tx.id,
        playerId: tx.playerId,
        playerUsername,
        createdAt: tx.createdAt,
        itemType: 'unknown',
        itemName: '—',
        quantity: 0,
        payout: 0,
        quality: null,
        rarity: null,
      });
      continue;
    }
    for (const item of lineItems) {
      const itemType = typeof item.itemType === 'string' ? item.itemType : 'unknown';
      const itemName = typeof item.itemName === 'string' ? item.itemName : '—';
      const quantity = Number(item.quantity) || 0;
      const payout = Number(item.payout) || 0;
      const quality = typeof item.quality === 'string' ? item.quality : null;
      const rarity = typeof item.rarity === 'string' ? item.rarity : null;
      rows.push({
        transactionId: tx.id,
        playerId: tx.playerId,
        playerUsername,
        createdAt: tx.createdAt,
        itemType,
        itemName,
        quantity,
        payout,
        quality,
        rarity,
      });
    }
  }
  return rows;
}

export function registerAdminStoreSalesRoutes(app: Application) {
  app.get('/api/admin/store-sales', async (req: Request, res: Response) => {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;

    const dateParam = parseDateParam(req.query.date as string | undefined);
    const bucketDate = dateParam ?? getTodayUtc();

    try {
      const [transactions, counter] = await Promise.all([
        economyRepo.listBySourceAndDate({
          source: INVENTORY_SELL_SOURCE,
          bucketDate,
        }),
        globalEconomyCountersRepo.getCounter(
          EQUIPMENT_SELL_GOLD_COUNTER,
          bucketDate
        ),
      ]);

      const soldThatDay = counter?.amount ?? 0;
      const remainingThatDay = Math.max(
        0,
        EQUIPMENT_SELL_DAILY_CAP - soldThatDay
      );

      const playerIds = [
        ...new Set(transactions.map((t) => t.playerId).filter(Boolean)),
      ];
      const usernameByPlayerId =
        playerIds.length > 0
          ? await playersRepo.getPlayerUsernamesByIds(playerIds)
          : {};
      const sales = flattenSales(transactions, usernameByPlayerId);

      return res.json({
        date: bucketDate,
        dailyAllocation: {
          dailyCap: EQUIPMENT_SELL_DAILY_CAP,
          soldThatDay,
          remainingThatDay,
        },
        sales,
      });
    } catch (error) {
      logError(error, req);
      return res.status(500).json({
        error: 'Failed to load store sales',
      });
    }
  });
}
