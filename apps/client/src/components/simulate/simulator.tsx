'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQueryState } from 'nuqs';
import {
  rollBossCurrency,
  rollChestCurrency,
  rollBossDrops,
} from '../../data/loot-table';
import {
  DIFFICULTY_TIERS,
  getDifficultyTier,
} from '../../data/difficulty-tiers';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Label } from '../ui/Label';
import { Input } from '../ui/Input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';
import { Slider } from '../ui/Slider';
import { Button } from '../ui/Button';
import { Separator } from '../ui/Separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/Table';

interface SimulationInputs {
  tierId: string;
  floors: number;
  leverage: number;
  score: number;
  sims: number;
}

interface CurrencySummary {
  mean: number;
  p5: number;
  p50: number;
  p95: number;
}

interface WearableSummary {
  total: number;
  byRarity: Record<string, number>;
  byQuality: Record<string, number>;
}

interface SimulationResult {
  usdc: CurrencySummary;
  ghst: CurrencySummary;
  wearables: WearableSummary;
}

function quantiles(values: number[]): { p5: number; p50: number; p95: number } {
  if (values.length === 0) return { p5: 0, p50: 0, p95: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number) => {
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
    return sorted[idx];
  };
  return { p5: q(0.05), p50: q(0.5), p95: q(0.95) };
}

function formatNum(n: number, d = 2): string {
  if (!Number.isFinite(n)) return '0';
  const fixed = n.toFixed(d);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

interface BasePayoutRow {
  tierId: string;
  name: string;
  maxEarnings: number;
  usdc: CurrencySummary & { ev: number };
  ghst: CurrencySummary & { ev: number };
}

function computeBasePayoutContext(
  sampleCount: number,
  leverageTotal: number,
  floorIndex: number
): BasePayoutRow[] {
  const rows: BasePayoutRow[] = [];
  for (const tierId of Object.keys(DIFFICULTY_TIERS)) {
    const tier = getDifficultyTier(tierId);
    if (!tier) continue;
    const usdcSamples: number[] = [];
    const ghstSamples: number[] = [];
    for (let i = 0; i < sampleCount; i++) {
      const u = rollBossCurrency({
        difficultyTierId: tierId,
        currency: 'USDC',
        leverageTotal,
        floorIndex,
        randomSeed: i,
      });
      const g = rollBossCurrency({
        difficultyTierId: tierId,
        currency: 'GHST',
        leverageTotal,
        floorIndex,
        randomSeed: i,
      });
      usdcSamples.push(Number(u.amount || 0));
      ghstSamples.push(Number(g.amount || 0));
    }
    const usdcMean = usdcSamples.reduce((a, b) => a + b, 0) / sampleCount;
    const ghstMean = ghstSamples.reduce((a, b) => a + b, 0) / sampleCount;
    const uQ = quantiles(usdcSamples);
    const gQ = quantiles(ghstSamples);
    // EV is per-boss expectation at current (L, depth), approximated via sample mean
    const uEv = usdcMean;
    const gEv = ghstMean;
    rows.push({
      tierId,
      name: tier.name,
      maxEarnings: tier.maxEarnings,
      usdc: { mean: usdcMean, ...uQ, ev: uEv },
      ghst: { mean: ghstMean, ...gQ, ev: gEv },
    });
  }
  return rows;
}

export default function Simulator() {
  const defaultTier = useMemo(() => {
    // Prefer nightmare for testing, else first key
    const keys = Object.keys(DIFFICULTY_TIERS);
    return keys.includes('nightmare') ? 'nightmare' : keys[0] ?? 'normal';
  }, []);

  const [tierId, setTierId] = useQueryState('tier', { defaultValue: defaultTier, shallow: false });
  const [floorsParam, setFloorsParam] = useQueryState('floors', { defaultValue: '3', shallow: false });
  const [leverageParam, setLeverageParam] = useQueryState('lev', { defaultValue: '1', shallow: false });
  const [scoreParam, setScoreParam] = useQueryState('score', { defaultValue: '0', shallow: false });
  const [simsParam, setSimsParam] = useQueryState('sims', { defaultValue: '5000', shallow: false });

  const floors = useMemo(() => clampInt(Number(floorsParam), 1, 1000), [floorsParam]);
  const leverage = useMemo(() => clampInt(Number(leverageParam), 1, 10), [leverageParam]);
  const score = useMemo(() => Math.max(0, Number(scoreParam) || 0), [scoreParam]);
  const sims = useMemo(() => clampInt(Number(simsParam), 1, 200000), [simsParam]);

  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);

  const tierOptions = useMemo(() => {
    return Object.keys(DIFFICULTY_TIERS).map((id) => ({
      id,
      name: getDifficultyTier(id)?.name ?? id,
    }));
  }, []);

  const baseContext = useMemo(
    () => computeBasePayoutContext(200, leverage, Math.max(0, floors - 1)),
    [leverage, floors]
  );

  const handleRun = useCallback(async () => {
    const inputs: SimulationInputs = {
      tierId,
      floors,
      leverage,
      score,
      sims,
    };
    setIsRunning(true);
    try {
      const usdcTotals: number[] = new Array(inputs.sims).fill(0);
      const ghstTotals: number[] = new Array(inputs.sims).fill(0);
      const rarityCounts: Record<string, number> = {};
      const qualityCounts: Record<string, number> = {};
      let totalWearables = 0;

      for (let i = 0; i < inputs.sims; i++) {
        const floorIndex = Math.max(0, inputs.floors - 1);
        const usdc = rollBossCurrency({
          difficultyTierId: inputs.tierId,
          currency: 'USDC',
          leverageTotal: inputs.leverage,
          floorIndex,
          randomSeed: undefined,
        });
        const ghst = rollBossCurrency({
          difficultyTierId: inputs.tierId,
          currency: 'GHST',
          leverageTotal: inputs.leverage,
          floorIndex,
          randomSeed: undefined,
        });
        usdcTotals[i] = Number(usdc.amount || 0);
        ghstTotals[i] = Number(ghst.amount || 0);

        const drops = rollBossDrops({
          difficultyTierId: inputs.tierId,
          classification: 'boss',
        });
        if (Array.isArray(drops) && drops.length > 0) {
          totalWearables += drops.filter((d) => d.type === 'wearable').length;
          for (const d of drops) {
            if (d.type === 'wearable') {
              if (d.rarity) rarityCounts[d.rarity] = (rarityCounts[d.rarity] ?? 0) + 1;
              if (d.quality) qualityCounts[d.quality] = (qualityCounts[d.quality] ?? 0) + 1;
            }
          }
        }
      }

      const usdcMean = usdcTotals.reduce((a, b) => a + b, 0) / inputs.sims;
      const ghstMean = ghstTotals.reduce((a, b) => a + b, 0) / inputs.sims;
      const usdcQ = quantiles(usdcTotals);
      const ghstQ = quantiles(ghstTotals);

      const next: SimulationResult = {
        usdc: { mean: usdcMean, ...usdcQ },
        ghst: { mean: ghstMean, ...ghstQ },
        wearables: {
          total: totalWearables,
          byRarity: rarityCounts,
          byQuality: qualityCounts,
        },
      };
      setResult(next);
    } finally {
      setIsRunning(false);
    }
  }, [tierId, floors, leverage, score, sims]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Run payout simulator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Difficulty</Label>
              <Select value={tierId} onValueChange={setTierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select difficulty" />
                </SelectTrigger>
                <SelectContent>
                  {tierOptions.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">
                Max per-run token cap: ${getDifficultyTier(tierId)?.maxEarnings ?? 0}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Floor reached</Label>
              <Input
                inputMode="numeric"
                value={String(floors)}
                onChange={(e) => setFloorsParam(String(clampInt(Number(e.target.value), 1, 1000)))}
              />
              <div className="text-xs text-muted-foreground">Simulates boss rewards on the reached floor only</div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Leverage</Label>
              <div className="flex items-center gap-3">
                <div className="w-full">
                  <Slider
                    min={1}
                    max={50}
                    step={1}
                    value={[leverage]}
                    onValueChange={([v]) => setLeverageParam(String(clampInt(Number(v), 1, 50)))}
                  />
                </div>
                <div className="w-10 text-right text-sm tabular-nums">{leverage}x</div>
              </div>
              <div className="text-xs text-muted-foreground">
                Affects boss currency drop probability; does not affect wearables.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Score</Label>
              <Input
                inputMode="numeric"
                value={String(score)}
                onChange={(e) => setScoreParam(String(Math.max(0, Number(e.target.value) || 0)))}
              />
              <div className="text-xs text-muted-foreground">
                Currently informational; score does not affect payouts yet.
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Simulations</Label>
              <Input
                inputMode="numeric"
                value={String(sims)}
                onChange={(e) => setSimsParam(String(clampInt(Number(e.target.value), 1, 200000)))}
              />
              <div className="text-xs text-muted-foreground">More sims → smoother estimates</div>
            </div>
            <div className="flex items-end">
              <Button onClick={handleRun} disabled={isRunning} className="w-full">
                {isRunning ? 'Simulating…' : 'Run simulation'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded p-3">
                <div className="font-medium">USDC</div>
                <div className="text-sm text-muted-foreground">
                  Avg {formatNum(result.usdc.mean)} · P50 {formatNum(result.usdc.p50)} ·
                  P5 {formatNum(result.usdc.p5)} · P95 {formatNum(result.usdc.p95)}
                </div>
              </div>
              <div className="border rounded p-3">
                <div className="font-medium">GHST</div>
                <div className="text-sm text-muted-foreground">
                  Avg {formatNum(result.ghst.mean)} · P50 {formatNum(result.ghst.p50)} ·
                  P5 {formatNum(result.ghst.p5)} · P95 {formatNum(result.ghst.p95)}
                </div>
              </div>
            </div>

            <Separator className="my-2" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded p-3">
                <div className="font-medium">Wearables (total drops)</div>
                <div className="text-sm text-muted-foreground">
                  Total {result.wearables.total} across {formatNum(sims)} sims
                </div>
              </div>
              <div className="border rounded p-3">
                <div className="font-medium">Rarity distribution</div>
                <div className="text-sm text-muted-foreground space-y-1">
                  {Object.entries(result.wearables.byRarity)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="capitalize">{k}</span>
                        <span className="tabular-nums">{v}</span>
                      </div>
                    ))}
                  {Object.keys(result.wearables.byRarity).length === 0 && (
                    <div className="opacity-60">No data</div>
                  )}
                </div>
              </div>
            </div>

            <div className="border rounded p-3">
              <div className="font-medium">Quality distribution</div>
              <div className="text-sm text-muted-foreground space-y-1">
                {Object.entries(result.wearables.byQuality)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="capitalize">{k}</span>
                      <span className="tabular-nums">{v}</span>
                    </div>
                  ))}
                {Object.keys(result.wearables.byQuality).length === 0 && (
                  <div className="opacity-60">No data</div>
                )}
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              Notes: Leverage increases boss currency drop probability; depth bonuses apply based on reached floor.
              Wearables always drop from bosses and are influenced by difficulty tier. Score is
              currently informational only and not used in payouts.
            </div>
          </CardContent>
        </Card>
      )}
      
      <Card>
        <CardHeader>
          <CardTitle>
            Per-boss payouts by difficulty (L={leverage}, floor {Math.max(1, floors)})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Difficulty</TableHead>
                <TableHead className="text-right">USDC EV</TableHead>
                <TableHead className="text-right">USDC P50</TableHead>
                <TableHead className="text-right">USDC P5–P95</TableHead>
                <TableHead className="text-right">GHST EV</TableHead>
                <TableHead className="text-right">GHST P50</TableHead>
                <TableHead className="text-right">GHST P5–P95</TableHead>
                <TableHead className="text-right">Max/run</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {baseContext.map((r) => (
                <TableRow key={r.tierId}>
                  <TableCell className="whitespace-nowrap">{r.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNum(r.usdc.ev)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNum(r.usdc.p50)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNum(r.usdc.p5)}–{formatNum(r.usdc.p95)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNum(r.ghst.ev)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNum(r.ghst.p50)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNum(r.ghst.p5)}–{formatNum(r.ghst.p95)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNum(r.maxEarnings)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-2 text-xs text-muted-foreground">
            EV and ranges are per-boss using current leverage and floor depth, simulated via the boss drop process.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


