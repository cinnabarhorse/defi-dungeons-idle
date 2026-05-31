'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../../ui/Button';
import type {
  VictoryChestOpenedPayload,
} from '../../../types/messages';
import type { EndFlowOutcome, EndFlowStep } from './types';
import { cn } from '../../../lib/utils';
import { trackEvent } from '../../../lib/analytics';
import { openTopup } from '../../../lib/topup/routes';

type VictoryChestStatus =
  | 'none'
  | 'available'
  | 'opened'
  | 'opening'
  | 'teaser'
  | string;

export interface EndFlowControllerProps {
  outcome: EndFlowOutcome;

  isDailyQuestActive: boolean;
  victoryChestStatus: VictoryChestStatus;
  victoryChestPayload: VictoryChestOpenedPayload | null;
  isOpeningVictoryChest: boolean;
  victoryChestError: string | null;
  onOpenVictoryChest: () => void;

  onDownloadActionLog: () => void;
  hasActionLog: boolean;
  onBackToLobby: () => void;

  renderSummary: () => React.ReactNode;
}

type IdleRoomSender = {
  send: (type: string, payload?: unknown) => void;
};

type WindowWithIdleRoom = Window & {
  __idleRoom?: IdleRoomSender;
  __room?: IdleRoomSender;
  idleRoom?: IdleRoomSender;
};

function getIdleRoomSender(): IdleRoomSender | null {
  if (typeof window === 'undefined') return null;
  const w = window as WindowWithIdleRoom;
  return w.__idleRoom ?? w.__room ?? w.idleRoom ?? null;
}

function isChestAvailable(status: VictoryChestStatus): boolean {
  return String(status) === 'available';
}

function isChestOpened(status: VictoryChestStatus): boolean {
  return String(status) === 'opened';
}

function getRewardDisplay(payload: VictoryChestOpenedPayload): {
  mainLabel: string;
  cardLabel: string;
} {
  const r = payload.reward;
  if (r.type === 'potion') {
    const qty = ` x${r.quantity}`;
    return { mainLabel: `${r.itemName}${qty}`, cardLabel: `${r.itemName} x${r.quantity}` };
  }
  if (r.type === 'bonus_progression_run' || r.type === 'bonus_competition_run') {
    const mode = r.mode === 'progression' ? 'Progression' : 'Competition';
    return { mainLabel: `1 Bonus Run (${mode})`, cardLabel: `Bonus Run (${mode})` };
  }
  if (r.type === 'wearable') {
    const rarity = r.rarity.charAt(0).toUpperCase() + r.rarity.slice(1);
    return { mainLabel: `${r.wearableName} (${rarity})`, cardLabel: r.wearableName };
  }
  return { mainLabel: 'Reward', cardLabel: 'Reward' };
}

function getRewardImageUrl(payload: VictoryChestOpenedPayload): string | null {
  const r = payload.reward;
  if (r.type === 'potion') {
    const spriteId = r.potionTier === 2 ? 127 : r.potionTier === 3 ? 129 : 126;
    return `/wearables/${spriteId}.svg`;
  }
  if (r.type === 'wearable') {
    return `/wearables/${r.svgId}.svg`;
  }
  return null;
}

export function EndFlowController(props: EndFlowControllerProps) {
  const {
    outcome,
    isDailyQuestActive,
    victoryChestStatus,
    victoryChestPayload,
    isOpeningVictoryChest,
    victoryChestError,
    onOpenVictoryChest,
    onDownloadActionLog,
    hasActionLog,
    onBackToLobby,
    renderSummary,
  } = props;

  const hasChest = useMemo(() => {
    return String(victoryChestStatus ?? 'none') !== 'none';
  }, [victoryChestStatus]);

  const isPracticeRun = !hasChest && !isDailyQuestActive;

  const initialStep: EndFlowStep =
    victoryChestPayload || isChestOpened(victoryChestStatus)
      ? 'reward_result'
      : isPracticeRun
        ? 'summary'
        : 'reward_reveal';
  const [step, setStep] = useState<EndFlowStep>(initialStep);

  useEffect(() => {
    trackEvent('end_flow_started', { outcome });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    trackEvent('end_flow_step_viewed', { step, outcome });
  }, [step, outcome]);

  // When chest open succeeds, transition to reward_result.
  useEffect(() => {
    if (step !== 'reward_reveal') return;
    if (String(victoryChestStatus) === 'teaser') return;
    if (victoryChestPayload) {
      trackEvent('chest_open_succeeded', { outcome });
      setStep('reward_result');
    }
  }, [step, victoryChestPayload, outcome, victoryChestStatus]);

  useEffect(() => {
    if (step !== 'reward_reveal') return;
    if (String(victoryChestStatus) === 'teaser') return;
    if (victoryChestError) {
      trackEvent('chest_open_failed', { outcome });
    }
  }, [step, victoryChestError, outcome, victoryChestStatus]);

  const title = outcome === 'victory' ? 'Victory!' : 'Defeat';

  const panelClass =
    "w-full max-w-sm sm:max-w-md flex flex-col items-center justify-between gap-4 rounded-2xl p-5 relative overflow-hidden border border-amber-400/60 ring-1 ring-amber-200/10 bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-black/95 shadow-[0_0_0_1px_rgba(251,191,36,0.12),0_20px_60px_rgba(0,0,0,0.55)] before:content-[''] before:absolute before:inset-2 before:rounded-[14px] before:border before:border-amber-200/20 before:pointer-events-none after:content-[''] after:absolute after:inset-0 after:bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.22),transparent_55%)] after:pointer-events-none";
  const stepBadgeClass =
    'text-[10px] text-slate-300 uppercase tracking-[0.3em] font-black';
  const titleClass = 'text-4xl sm:text-5xl font-black tracking-wide';
  const pillClass =
    'w-full rounded-lg border border-slate-600 bg-slate-800/80 text-slate-100 py-3 text-sm font-black uppercase tracking-widest shadow-inner';
  const primaryCtaClass =
    'w-full rounded-lg bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white py-3 text-sm font-black uppercase tracking-widest shadow-lg hover:opacity-95';
  const panelInsetClass =
    'w-full rounded-xl border border-slate-700 bg-slate-850/70 px-4 py-3';

  return (
    <div
      className={cn(
        'absolute inset-0 z-50 flex items-center justify-center px-4 py-6',
        step !== 'summary' ? 'pointer-events-auto' : ''
      )}
    >
      <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" />
      <div className="relative w-full max-w-4xl text-white font-bold overflow-hidden flex flex-col items-center justify-center">
      {step === 'reward_reveal' ? (
        <div
          data-testid="endflow-step-reward-reveal"
          className={panelClass}
        >
          <h1
            className={cn(
              titleClass,
              outcome === 'victory' ? 'text-amber-300' : 'text-rose-400'
            )}
          >
            {title}
          </h1>
          <div className="text-sm text-slate-200 uppercase tracking-[0.25em] font-black">
            {hasChest || isDailyQuestActive ? 'You found a Chest!' : 'Run Rewards'}
          </div>
          <div className="w-full max-w-[260px] aspect-square rounded-xl border border-slate-700 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.15),rgba(15,23,42,0.95))] flex items-center justify-center text-6xl text-white/70">
            {hasChest || isDailyQuestActive ? (
              <img
                src={
                  isOpeningVictoryChest
                    ? '/images/treasurechest_open.jpg'
                    : '/images/treasurechest_closed.jpg'
                }
                alt="Victory chest"
                className="w-full h-full object-contain p-3"
              />
            ) : (
              <span className="text-6xl text-white/30">✦</span>
            )}
          </div>

          {String(victoryChestStatus) === 'teaser' ? (
            <>
              <div
                data-testid="endflow-chest-teaser"
                className="text-[11px] text-white/70 text-center max-w-md"
              >
                Stake at least <span className="font-black">1 USDC/GHO</span> to
                unlock this chest.
              </div>

              <div className="w-full max-w-md flex flex-col gap-2">
                <Button
                  data-testid="endflow-stake-now"
                  onClick={() => {
                    trackEvent('leaderboard_view_clicked', {
                      outcome,
                      source_step: 'reward_reveal_teaser',
                    });
                    openTopup();
                  }}
                  className="w-full bg-gradient-to-r from-emerald-600 to-teal-500 text-white py-4 text-base font-black shadow-lg"
                >
                  Stake Now
                </Button>

                <Button
                  data-testid="endflow-refresh-chest"
                  onClick={() => {
                    trackEvent('chest_open_clicked', { outcome });
                    const room = getIdleRoomSender();
                    if (room) room.send('idle_refresh_victory_chest');
                  }}
                  className="w-full bg-white/10 border border-white/20 text-white py-3 text-sm font-bold"
                >
                  I staked — refresh chest
                </Button>

                <Button
                  data-testid="endflow-teaser-continue"
                  onClick={() => setStep('summary')}
                  variant="ghost"
                  className="text-white/60 hover:text-white"
                >
                  Continue
                </Button>
              </div>
            </>
          ) : (
            <>
              {victoryChestError ? (
                <div className="w-full max-w-md text-[11px] text-rose-200 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2 text-center">
                  {victoryChestError}
                </div>
              ) : null}

              <Button
                data-testid="endflow-open-chest-button"
                onClick={() => {
                  trackEvent('chest_open_clicked', { outcome });
                  onOpenVictoryChest();
                }}
                disabled={
                  isOpeningVictoryChest || !isChestAvailable(victoryChestStatus)
                }
                className={cn(
                  'mt-4 w-full rounded-lg border border-amber-200/60 bg-gradient-to-b from-amber-400 via-amber-500 to-orange-600 py-3 text-sm font-black uppercase tracking-[0.18em] text-amber-50 drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)] shadow-[0_10px_24px_rgba(249,115,22,0.35),inset_0_1px_0_rgba(255,255,255,0.35)] transition hover:brightness-105 disabled:opacity-60'
                )}
              >
                {isOpeningVictoryChest
                  ? 'Opening…'
                  : victoryChestError
                    ? 'Retry Open'
                    : 'Open Chest'}
              </Button>
            </>
          )}
        </div>
      ) : null}

      {step === 'reward_result' ? (
        <div
          data-testid="endflow-step-reward-result"
          className={panelClass}
        >
          <div className={stepBadgeClass}>Reward Result</div>
          <div className="text-sm text-slate-200 uppercase tracking-[0.25em] font-black">
            Rewards
          </div>

          {victoryChestPayload ? (
            (() => {
              const { mainLabel, cardLabel } = getRewardDisplay(victoryChestPayload);
              const rewardImageUrl = getRewardImageUrl(victoryChestPayload);
              return (
                <>
                  <div className="w-full max-w-[260px] aspect-square rounded-xl border border-slate-700 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12),rgba(15,23,42,0.95))] flex flex-col items-center justify-center p-4 gap-2">
                    {rewardImageUrl ? (
                      <img
                        src={rewardImageUrl}
                        alt={mainLabel}
                        className="w-24 h-24 sm:w-32 sm:h-32 object-contain flex-shrink-0"
                      />
                    ) : null}
                    <span className="text-base font-semibold text-white/90 text-center leading-tight">
                      {mainLabel}
                    </span>
                  </div>
                  <div
                    data-testid="endflow-reward-cards"
                    className="w-full max-w-md bg-white/5 border border-white/10 rounded-xl p-4"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <div className={cn(panelInsetClass, 'text-center flex items-center justify-center gap-1.5')}>
                        <img
                          src="/loot-icons/coin.svg"
                          alt=""
                          className="w-5 h-5 object-contain flex-shrink-0"
                        />
                        <span className="text-lg text-white/80">+{victoryChestPayload.goldBonus.amount} Gold</span>
                      </div>
                      <div className={cn(panelInsetClass, 'text-center flex items-center justify-center px-2')}>
                        <span className="text-sm text-white/80 break-words leading-tight">
                          {cardLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()
          ) : (
            <div className="text-[11px] text-white/60">No rewards.</div>
          )}

          <div className="w-full max-w-md flex flex-col gap-2">
            <Button
              data-testid="endflow-continue-button"
              onClick={() => {
                trackEvent('reward_result_continue_clicked', { outcome });
                setStep('summary');
              }}
              className={primaryCtaClass}
            >
              Continue
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'summary' ? (
        <div
          data-testid="endflow-step-summary"
          className="w-full"
        >
          {isPracticeRun ? (
            <div className="w-full max-w-3xl mx-auto mb-3 flex items-center justify-center">
              <h1
                className={cn(
                  titleClass,
                  'text-center',
                  outcome === 'victory' ? 'text-amber-300' : 'text-rose-400'
                )}
              >
                {title}
              </h1>
            </div>
          ) : null}
          {renderSummary()}

          <div className="w-full max-w-3xl mx-auto mt-3 flex flex-col gap-3">
            <Button
              data-testid="endflow-play-again"
              onClick={() => {
                trackEvent('summary_play_again_clicked', { outcome });
                onBackToLobby();
              }}
              className={primaryCtaClass}
            >
              Play Again
            </Button>

            <Button
              data-testid="endflow-download-action-log"
              onClick={() => {
                trackEvent('action_log_download_clicked', { outcome });
                onDownloadActionLog();
              }}
              disabled={!hasActionLog}
              className={cn(pillClass, 'text-slate-300 disabled:opacity-50')}
            >
              Download Action Log
            </Button>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}
