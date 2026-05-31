import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getPgPool } from '../../client';
import {
  getGoldFlowPerDay,
  getGoldTotalPerDay,
  getLickTongueFlowPerDay,
  getLickTongueTotalPerDay,
  getRepairGoldSpentPerDay,
  getRepairItemsPerDay,
} from '../stats';

jest.mock('../../client', () => ({
  getPgPool: jest.fn(),
}));

describe('stats repo repair economy queries', () => {
  const query = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (getPgPool as jest.Mock).mockReturnValue({ query });
  });

  it('loads repair item counts from economy transactions', async () => {
    query.mockResolvedValue({
      rows: [{ day: '2026-03-20', count: 3 }],
    });

    const result = await getRepairItemsPerDay({
      fromIso: '2026-03-01T00:00:00.000Z',
      toIso: '2026-03-30T23:59:59.999Z',
    });

    expect(result).toEqual([{ day: '2026-03-20', count: 3 }]);

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('from economy_transactions t');
    expect(sql).toContain("t.source = 'wearable_repair'");
    expect(sql).toContain("jsonb_typeof(t.metadata->'items') = 'array'");
  });

  it('loads repair gold spend from economy transactions', async () => {
    query.mockResolvedValue({
      rows: [{ day: '2026-03-20', count: 88 }],
    });

    const result = await getRepairGoldSpentPerDay({
      fromIso: '2026-03-01T00:00:00.000Z',
      toIso: '2026-03-30T23:59:59.999Z',
    });

    expect(result).toEqual([{ day: '2026-03-20', count: 88 }]);

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('from economy_transactions t');
    expect(sql).toContain("t.source = 'wearable_repair'");
    expect(sql).toContain('sum(case when t.amount > 0 then t.amount else 0 end)');
  });

  it('includes historical repair spend in gold flow totals without double counting repair inventory events', async () => {
    query.mockResolvedValue({
      rows: [
        {
          day: '2026-03-20',
          earned: 100,
          spent: 25,
          net: 75,
        },
      ],
    });

    const result = await getGoldFlowPerDay({
      fromIso: '2026-03-01T00:00:00.000Z',
      toIso: '2026-03-30T23:59:59.999Z',
    });

    expect(result).toEqual([
      {
        day: '2026-03-20',
        earned: 100,
        spent: 25,
        net: 75,
      },
    ]);

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('from player_inventory_events e');
    expect(sql).toContain("e.reason is distinct from 'wearable_repair'");
    expect(sql).toContain('from economy_transactions t');
    expect(sql).toContain('-t.amount::numeric as delta');
  });

  it('excludes repair inventory events before subtracting repair spend from total gold in economy', async () => {
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      const statement = String(sql);
      if (statement.includes('from player_inventory_events e')) {
        const excludedReasons = Array.isArray(params?.[4]) ? params[4] : [];
        return {
          rows: [
            {
              day: '2026-03-20',
              total: Array.isArray(excludedReasons) &&
                excludedReasons.includes('wearable_repair')
                ? 1000
                : 912,
            },
          ],
        };
      }

      if (statement.includes('from economy_transactions et')) {
        const sources = Array.isArray(params?.[3]) ? params[3] : [];
        if (Array.isArray(sources) && sources.includes('wearable_repair')) {
          return { rows: [{ day: '2026-03-20', total: 88 }] };
        }
        if (Array.isArray(sources) && sources.includes('wearable_forge')) {
          return { rows: [{ day: '2026-03-20', total: 0 }] };
        }
      }

      return { rows: [] };
    });

    const result = await getGoldTotalPerDay({
      fromIso: '2026-03-01T00:00:00.000Z',
      toIso: '2026-03-30T23:59:59.999Z',
    });

    expect(result).toEqual([{ day: '2026-03-20', total: 912 }]);

    const inventorySql = String(query.mock.calls[0]?.[0] ?? '');
    const inventoryParams = query.mock.calls[0]?.[1] as unknown[];
    const repairSql = String(query.mock.calls[1]?.[0] ?? '');
    const forgeSql = String(query.mock.calls[2]?.[0] ?? '');
    expect(inventorySql).toContain('from player_inventory_events e');
    expect(inventorySql).toContain("coalesce(lower(trim(e.reason)), '') = any($5::text[])");
    expect(inventoryParams[4]).toEqual(['wearable_repair']);
    expect(repairSql).toContain('from economy_transactions et');
    expect(repairSql).toContain("lower(trim(et.source)) = any($4::text[])");
    expect(forgeSql).toContain('from economy_transactions et');
    expect(forgeSql).toContain("lower(trim(et.source)) = any($4::text[])");
  });

  it('includes forge lick tongue spend in the daily lick tongue flow series', async () => {
    query.mockResolvedValue({
      rows: [{ day: '2026-03-20', earned: 5, spent: 2, net: 3 }],
    });

    const result = await getLickTongueFlowPerDay({
      fromIso: '2026-03-01T00:00:00.000Z',
      toIso: '2026-03-30T23:59:59.999Z',
    });

    expect(result).toEqual([
      {
        day: '2026-03-20',
        earned: 5,
        spent: 2,
        net: 3,
      },
    ]);

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    const params = query.mock.calls[0]?.[1] as unknown[];
    expect(sql).toContain('from player_inventory_events e');
    expect(sql).not.toContain('e.reason is distinct');
    expect(params[2]).toEqual(['material', 'lick_tongue']);
    expect(params[3]).toEqual(['lick tongue', 'lick_tongue']);
  });

  it('includes forge lick tongue spend in the total lick tongues in economy series', async () => {
    query.mockResolvedValue({
      rows: [{ day: '2026-03-20', total: 44 }],
    });

    const result = await getLickTongueTotalPerDay({
      fromIso: '2026-03-01T00:00:00.000Z',
      toIso: '2026-03-30T23:59:59.999Z',
    });

    expect(result).toEqual([{ day: '2026-03-20', total: 44 }]);

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    const params = query.mock.calls[0]?.[1] as unknown[];
    expect(sql).toContain('from player_inventory_events e');
    expect(sql).not.toContain('e.reason is distinct');
    expect(params[2]).toEqual(['material', 'lick_tongue']);
    expect(params[3]).toEqual(['lick tongue', 'lick_tongue']);
  });
});
