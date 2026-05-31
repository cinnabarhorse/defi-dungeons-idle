'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';

export interface LeverageBreakdownButtonProps {
  leverageTotal?: number | null;
  legacyLeverage?: number | null;
  tradeRunLeverage?: number | null;
  tradeRunToken?: 'BTC' | 'ETH' | 'GHST' | null;
  tradeRunDirection?: 'long' | 'short' | null;
  precision?: number;
}

function normalizeLeverageValue(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

export function formatLeverageValue(
  value: number | null | undefined,
  precision: number = 1
): string {
  const normalized = normalizeLeverageValue(value);
  if (normalized == null) {
    return '—';
  }
  return `${normalized.toFixed(precision)}x`;
}

function formatTradeDirectionLabel(direction: 'long' | 'short' | null): string {
  return direction === 'short' ? 'Down' : 'Up';
}

function formatTradeRunLabel(input: {
  token?: 'BTC' | 'ETH' | 'GHST' | null;
  direction?: 'long' | 'short' | null;
  leverage?: number | null;
  precision?: number;
}): string | null {
  if (!input.token || !input.direction) {
    return null;
  }

  const leverage = formatLeverageValue(input.leverage, input.precision);
  if (leverage === '—') {
    return null;
  }

  return `${input.token} ${formatTradeDirectionLabel(input.direction)} ${leverage}`;
}

export function LeverageBreakdownButton({
  leverageTotal,
  legacyLeverage,
  tradeRunLeverage,
  tradeRunToken,
  tradeRunDirection,
  precision = 1,
}: LeverageBreakdownButtonProps) {
  const [open, setOpen] = useState(false);

  const normalizedTotal = normalizeLeverageValue(leverageTotal);
  if (normalizedTotal == null) {
    return '—';
  }

  const normalizedLegacy =
    normalizeLeverageValue(legacyLeverage) ?? normalizedTotal;
  const normalizedTrade = normalizeLeverageValue(tradeRunLeverage) ?? 0;

  const formula = `${formatLeverageValue(
    normalizedLegacy,
    precision
  )} + ${formatLeverageValue(
    normalizedTrade,
    precision
  )} = ${formatLeverageValue(normalizedTotal, precision)}`;
  const tradeRunLabel = formatTradeRunLabel({
    token: tradeRunToken,
    direction: tradeRunDirection,
    leverage: normalizedTrade,
    precision,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex rounded px-1 -mx-1 text-white/90 underline decoration-white/30 underline-offset-4 transition hover:text-white hover:decoration-white/60"
      >
        {formatLeverageValue(normalizedTotal, precision)}
      </button>
      <DialogContent
        className="max-w-sm border-white/10 bg-[#120c16]/95 text-white shadow-2xl"
        style={{ top: '50%', bottom: 'auto' }}
      >
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-white">Leverage Breakdown</DialogTitle>
          <DialogDescription className="text-white/60">
            Legacy leverage plus trade-run leverage.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">
              Formula
            </div>
            <div className="mt-2 text-lg font-semibold text-white">
              {formula}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2">
              <span className="text-sm text-white/70">Legacy leverage</span>
              <span className="text-sm font-semibold text-white">
                {formatLeverageValue(normalizedLegacy, precision)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-white/10 py-2">
              <span className="text-sm text-white/70">Trade run</span>
              <span className="text-sm font-semibold text-white">
                {tradeRunLabel ??
                  formatLeverageValue(normalizedTrade, precision)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 pt-2">
              <span className="text-sm text-white">Total leverage</span>
              <span className="text-sm font-semibold text-white">
                {formatLeverageValue(normalizedTotal, precision)}
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
