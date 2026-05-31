import React, { useEffect, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { EndFlowController } from './endflow/EndFlowController';
import { useIdleGame } from '../../hooks/useIdleGame';
import { Button } from '../ui/Button';
import { ENEMY_SPRITE_CONFIGS } from '../../data/enemy-sprite-configs';
import { CharacterPreview } from '../CharacterPreview';
import { cn } from '../../lib/utils';
import { SPELLS } from '../../data/spells';
import {
  getQualityLabelForWearable,
  normalizeQualityTier,
} from '../../data/wearable-quality';
import { getWearableBySlug, slugifyWearableName } from '../../data/wearables';
import { getCharacter } from '../../lib/character-registry';
import type { InventoryItem } from '../../types/inventory';
import type {
  ServerToClientMessages,
  VictoryChestOpenedPayload,
  VictoryChestOpenFailedPayload,
} from '../../types/messages';
import { fetchOpenRuns } from '../../lib/daily-quest-trade';
import { getServerUrlForRegion } from '../../lib/server-regions';

type DailyQuestLeaderboardUpdatePayload =
  ServerToClientMessages['daily_quest:leaderboard_update'];

const groupLoots = (loots: any[]) => {
  const groups: Record<string, any> = {};
  for (const loot of loots) {
    // Some loots might be from Colyseus ArraySchema, which doesn't have spread
    const key = `${loot.name}-${loot.quality || ''}-${loot.rarity || ''}-${loot.type || ''}-${loot.wearableSlug || ''}`;
    if (!groups[key]) {
      groups[key] = {
        name: loot.name,
        type: loot.type,
        quantity: loot.quantity,
        rarity: loot.rarity,
        color: loot.color,
        wearableSlug: loot.wearableSlug,
        quality: loot.quality,
      };
    } else {
      groups[key].quantity += loot.quantity;
    }
  }
  return Object.values(groups);
};

const LOOT_RARITY_RANK: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  legendary: 3,
  mythical: 4,
  godlike: 5,
};

const LOOT_QUALITY_RANK: Record<string, number> = {
  broken: 0,
  budget: 1,
  average: 2,
  excellent: 3,
  flawless: 4,
};

function isGoldLoot(loot: any): boolean {
  const name = String(loot?.name ?? '').toLowerCase();
  return String(loot?.type ?? '') === 'coin' || name === 'gold';
}

function isPotionLoot(loot: any): boolean {
  const name = String(loot?.name ?? '').toLowerCase();
  return String(loot?.type ?? '') === 'potion' || name.includes('potion');
}

function isLickTongueLoot(loot: any): boolean {
  const name = String(loot?.name ?? '').toLowerCase();
  const slug = String(loot?.wearableSlug ?? '').toLowerCase();
  return name.includes('lick tongue') || slug === 'lick-tongue' || slug === 'lick_tongue';
}

function isWearableLoot(loot: any): boolean {
  const type = String(loot?.type ?? '');
  return Boolean(loot?.wearableSlug) || type === 'wearable' || type === 'weapon';
}

function getWearableRarityRank(loot: any): number {
  const explicit = String(loot?.rarity ?? '').toLowerCase();
  if (explicit) return LOOT_RARITY_RANK[explicit] ?? 0;

  const slug =
    typeof loot?.wearableSlug === 'string' && loot.wearableSlug
      ? loot.wearableSlug
      : slugifyWearableName(String(loot?.name ?? ''));
  const wearable = slug ? getWearableBySlug(slug) : undefined;
  const inferred = String(wearable?.rarityLevel ?? '').toLowerCase();
  return LOOT_RARITY_RANK[inferred] ?? 0;
}

function getWearableQualityRank(loot: any): number {
  const tier = normalizeQualityTier(loot?.quality);
  return LOOT_QUALITY_RANK[String(tier)] ?? 0;
}

function getPotionTierRank(loot: any): number {
  const name = String(loot?.name ?? '').toLowerCase();
  if (name.includes('ultra')) return 3;
  if (name.includes('greater')) return 2;
  if (name.includes('mana')) return 1;
  if (name.includes('health') || name.includes('healing')) return 0;
  return 0;
}

function sortLootsForSummary(loots: any[]): any[] {
  return [...loots].sort((a, b) => {
    // Order: Gold → Lick Tongue → Potions → Wearables → Other
    const aCategory = isGoldLoot(a)
      ? 0
      : isLickTongueLoot(a)
        ? 1
        : isPotionLoot(a)
          ? 2
          : isWearableLoot(a)
            ? 3
            : 4;
    const bCategory = isGoldLoot(b)
      ? 0
      : isLickTongueLoot(b)
        ? 1
        : isPotionLoot(b)
          ? 2
          : isWearableLoot(b)
            ? 3
            : 4;
    if (aCategory !== bCategory) return aCategory - bCategory;

    // Gold: keep stable/deterministic by name
    if (aCategory === 0) {
      const an = String(a?.name ?? '');
      const bn = String(b?.name ?? '');
      return an.localeCompare(bn);
    }

    // Lick Tongue: stable/deterministic by name
    if (aCategory === 1) {
      const an = String(a?.name ?? '');
      const bn = String(b?.name ?? '');
      return an.localeCompare(bn);
    }

    // Potions: higher tier first, then name
    if (aCategory === 2) {
      const tierDiff = getPotionTierRank(b) - getPotionTierRank(a);
      if (tierDiff !== 0) return tierDiff;
    }

    // Wearables: highest rarity, then highest quality
    if (aCategory === 3) {
      const rarityDiff = getWearableRarityRank(b) - getWearableRarityRank(a);
      if (rarityDiff !== 0) return rarityDiff;
      const qualityDiff = getWearableQualityRank(b) - getWearableQualityRank(a);
      if (qualityDiff !== 0) return qualityDiff;
    }

    const an = String(a?.name ?? '');
    const bn = String(b?.name ?? '');
    return an.localeCompare(bn);
  });
}

const Sprite = ({
  config,
  className,
  scale = 2,
}: {
  config: any;
  className?: string;
  scale?: number;
}) => {
  if (!config) return null;
  return (
    <div
      className={className}
      style={{
        width: config.frameWidth,
        height: config.frameHeight,
        backgroundImage: `url(${config.imagePath})`,
        backgroundPosition: '0 0',
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
        transform: `scale(${scale})`, // configurable scale
      }}
    />
  );
};

const LootIcon = ({ loot, className }: { loot: any; className?: string }) => {
  const isUSDC = loot.wearableSlug === 'usdc' || loot.name?.includes('USDC');
  const isGHST =
    loot.wearableSlug === 'ghst' || loot.name?.toUpperCase() === 'GHST';
  const isCoin =
    (loot.type === 'coin' || loot.itemType === 'gold_coin') &&
    !isUSDC &&
    !isGHST;

  if (isUSDC) {
    return (
      <img
        src="/loot-icons/usdc.svg"
        className={cn('w-8 h-8 object-contain', className)}
        alt="USDC"
      />
    );
  }

  if (isGHST) {
    return (
      <img
        src="/loot-icons/ghst.gif"
        className={cn('w-8 h-8 object-contain', className)}
        alt="GHST"
      />
    );
  }

  if (isCoin) {
    return (
      <img
        src="/loot-icons/coin.svg"
        className={cn('w-8 h-8 object-contain', className)}
        alt="Coin"
      />
    );
  }

  // Handle potions and special materials by name (they use specific SVG IDs)
  if (loot.name?.includes('Greater Healing Potion')) {
    return (
      <img
        src="/wearables/127.svg"
        className={cn('w-8 h-8 object-contain', className)}
        alt={loot.name}
      />
    );
  }
  if (loot.name?.includes('Ultra Healing Potion')) {
    return (
      <img
        src="/wearables/129.svg"
        className={cn('w-8 h-8 object-contain', className)}
        alt={loot.name}
      />
    );
  }
  if (loot.name?.includes('Health Potion')) {
    return (
      <img
        src="/wearables/126.svg"
        className={cn('w-8 h-8 object-contain', className)}
        alt={loot.name}
      />
    );
  }
  if (loot.name?.includes('Mana Potion')) {
    return (
      <img
        src="/wearables/128.svg"
        className={cn('w-8 h-8 object-contain', className)}
        alt={loot.name}
      />
    );
  }
  // Lick Tongue can be both a wearable AND a material - handle material case by name
  // (materials don't have wearableSlug synced, so we need this special case)
  if (loot.name?.includes('Lick Tongue') && loot.type === 'material') {
    return (
      <img
        src="/wearables/378.svg"
        className={cn('w-8 h-8 object-contain', className)}
        alt={loot.name}
      />
    );
  }

  // For wearables and weapons, look up the SVG ID from the wearable slug
  if (loot.wearableSlug || loot.type === 'wearable' || loot.type === 'weapon') {
    // Try to get the wearable definition to find the numeric SVG ID
    // First try the wearableSlug, then fallback to slugifying the name
    let wearable = loot.wearableSlug
      ? getWearableBySlug(loot.wearableSlug)
      : null;

    // Fallback: if no wearable found but we have a name, try slugifying the name
    if (!wearable && loot.name) {
      const slugFromName = slugifyWearableName(loot.name);
      wearable = getWearableBySlug(slugFromName);
    }

    const svgId = wearable?.id;

    if (svgId !== undefined) {
      return (
        <img
          src={`/wearables/${svgId}.svg`}
          className={cn('w-8 h-8 object-contain', className)}
          alt={loot.name}
          onError={(event) => {
            const target = event.currentTarget;
            target.style.display = 'none';
            const nextSibling = target.nextElementSibling;
            if (nextSibling instanceof HTMLElement) {
              nextSibling.style.display = 'block';
            }
          }}
        />
      );
    }
  }

  // Fallback Emojis
  const emoji =
    loot.type === 'potion'
      ? '🧪'
      : loot.type === 'material'
        ? '📦'
        : loot.type === 'wearable'
          ? '👕'
          : '📦';

  return (
    <div className={cn('text-2xl flex items-center justify-center', className)}>
      <span className="hidden">
        {/* Hidden slot for error fallback handler */}
      </span>
      <span>{emoji}</span>
    </div>
  );
};

const SpellSquare = ({
  spell,
  cooldownRemaining,
  playerMana,
  onClick,
  disabled,
}: {
  spell: any;
  cooldownRemaining: number;
  playerMana: number;
  onClick?: () => void;
  disabled?: boolean;
}) => {
  const isCoolingDown = cooldownRemaining > 0;
  const insufficientMana = playerMana < spell.manaCost;
  const isDisabled = disabled || isCoolingDown || insufficientMana;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className={cn(
        'relative w-16 h-16 rounded-xl bg-black/60 border-2 border-slate-700 overflow-hidden group transition-all shrink-0 shadow-lg',
        isCoolingDown && 'opacity-60',
        insufficientMana && 'brightness-75 border-blue-900/50',
        !isDisabled &&
          'cursor-pointer hover:border-purple-500 hover:shadow-purple-500/30 active:scale-95',
        isDisabled && 'cursor-not-allowed'
      )}
      title={`${spell.name} (${spell.manaCost} MP)${isCoolingDown ? ' - On Cooldown' : ''}${insufficientMana ? ' - Not Enough Mana' : ''}`}
    >
      {spell.icon && (
        <img
          src={spell.icon}
          alt={spell.name}
          className="w-full h-full object-cover select-none pointer-events-none"
        />
      )}
      <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />

      {/* Mana Cost Badge */}
      <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-blue-600 font-bold text-[10px] text-white shadow-md z-30">
        {spell.manaCost}
      </div>

      {/* Cooldown Overlay */}
      {isCoolingDown && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20">
          <span className="text-white font-black text-2xl drop-shadow-md">
            {cooldownRemaining}
          </span>
        </div>
      )}

      {/* Insufficient Mana Overlay */}
      {insufficientMana && !isCoolingDown && (
        <div className="absolute inset-0 border-2 border-blue-500/50 rounded-xl pointer-events-none z-10" />
      )}
    </button>
  );
};

const playSound = (name: string) => {
  try {
    const audio = new Audio(`/sfx/${name}.mp3`);
    audio.volume = 0.4;
    audio.play().catch(() => {});
  } catch {}
};

function formatTradeCountdown(closeAtUtc?: string, nowMs: number = Date.now()): string {
  if (!closeAtUtc) return '—';
  const closeAtMs = Date.parse(closeAtUtc);
  if (!Number.isFinite(closeAtMs)) return '—';
  const diffMs = Math.max(0, closeAtMs - nowMs);
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0 && seconds <= 0) return '00:00';
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatTradeUsdPrice(value: number, token?: string): string {
  if (!Number.isFinite(value)) return '0';
  const normalizedToken = String(token ?? '').toUpperCase();
  const maxDecimals = normalizedToken === 'GHST' ? 8 : 4;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDecimals,
  });
}

export const IdleDungeonScreen = ({
  room,
  characterId,
  onLeave,
  dailyQuestActive = false,
  inventoryItems = [],
}: {
  room: any;
  characterId?: string;
  onLeave?: () => void;
  dailyQuestActive?: boolean;
  inventoryItems?: InventoryItem[];
}) => {
  const {
    idleRoom,
    playerHp,
    maxHp,
    playerMana,
    maxMana,
    playerLevel,
    playerXp,
    playerXpIntoLevel,
    playerXpForNextLevel,
    isAutoExploring,
    activeWeapon,
    activeGrenade,
    leverage,
    difficultyTier,
    score,
    maxDepthReached,
    kills,
    lootsCollected,
    tokenRewards,
    targetFloor,
    healthPotionCount,
    manaPotionCount,
    dailyQuestActive: serverDailyQuestActive,
    usesRealGotchi,
    competitionMultiplier,
    speedRun,
    speedRunMultiplier,
    potionsCollected,
    potionsUsed,
    potionsUsedByTier,
  } = useIdleGame(room);

  function getPotionCategory(item: InventoryItem) {
    if (item.type !== 'potion') return null;
    if (typeof item.potionTier === 'number' && item.potionTier > 0) {
      return 'health';
    }
    const name = String(item.name ?? '').toLowerCase();
    if (name.includes('health') || name.includes('healing')) return 'health';
    if (name.includes('mana')) return 'mana';
    return null;
  }

  function getPotionTierValue(item: InventoryItem) {
    if (typeof item.potionTier === 'number' && item.potionTier > 0) {
      return item.potionTier;
    }
    const name = String(item.name ?? '').toLowerCase();
    if (name.includes('ultra')) return 3;
    if (name.includes('greater')) return 2;
    if (name.includes('health') || name.includes('healing')) return 1;
    return 0;
  }

  function getPotionSpriteId(item: InventoryItem | null, fallback: number) {
    if (!item) return fallback;
    if (typeof item.spriteId === 'number') return item.spriteId;
    const name = String(item.name ?? '').toLowerCase();
    if (name.includes('ultra')) return 129;
    if (name.includes('greater')) return 127;
    if (name.includes('mana')) return 128;
    if (name.includes('health') || name.includes('healing')) return 126;
    return fallback;
  }

  function getBestPotionItem(kind: 'health' | 'mana') {
    return inventoryItems.reduce<InventoryItem | null>((best, item) => {
      if (item.quantity <= 0) return best;
      if (getPotionCategory(item) !== kind) return best;
      if (!best) return item;
      if (kind === 'health') {
        const bestTier = getPotionTierValue(best);
        const itemTier = getPotionTierValue(item);
        if (itemTier !== bestTier) {
          return itemTier > bestTier ? item : best;
        }
      }
      return best;
    }, null);
  }

  const bestHealthPotion = getBestPotionItem('health');
  const bestManaPotion = getBestPotionItem('mana');
  const bestHealthTier = bestHealthPotion
    ? getPotionTierValue(bestHealthPotion)
    : 0;
  const bestManaTier = bestManaPotion ? getPotionTierValue(bestManaPotion) : 0;

  const healthPotionCounts = useMemo(() => {
    const counts = { tier1: 0, tier2: 0, tier3: 0 };
    inventoryItems.forEach((item) => {
      if (getPotionCategory(item) !== 'health') return;
      const tier = getPotionTierValue(item);
      if (tier === 3) {
        counts.tier3 += item.quantity;
        return;
      }
      if (tier === 2) {
        counts.tier2 += item.quantity;
        return;
      }
      counts.tier1 += item.quantity;
    });

    const runTotal = Math.max(
      0,
      Number(idleRoom?.runHealthPotionsCollected) || 0
    );
    let runTier1 = Number(idleRoom?.runHealthPotionsCollectedTier1) || 0;
    let runTier2 = Number(idleRoom?.runHealthPotionsCollectedTier2) || 0;
    let runTier3 = Number(idleRoom?.runHealthPotionsCollectedTier3) || 0;
    const runTierTotal = runTier1 + runTier2 + runTier3;
    if (runTotal > 0 && runTierTotal === 0) {
      runTier1 = runTotal;
    }

    const totalInventory = counts.tier1 + counts.tier2 + counts.tier3;
    const expectedTotal = totalInventory + runTotal;
    const persistentUsedTier1 =
      Number(idleRoom?.persistentHealthPotionsUsedTier1) || 0;
    const persistentUsedTier2 =
      Number(idleRoom?.persistentHealthPotionsUsedTier2) || 0;
    const persistentUsedTier3 =
      Number(idleRoom?.persistentHealthPotionsUsedTier3) || 0;
    const persistentUsedTotal =
      persistentUsedTier1 + persistentUsedTier2 + persistentUsedTier3;
    const shouldAdjustForPersistentUsage =
      expectedTotal > healthPotionCount && persistentUsedTotal > 0;
    if (shouldAdjustForPersistentUsage) {
      counts.tier1 = Math.max(0, counts.tier1 - persistentUsedTier1);
      counts.tier2 = Math.max(0, counts.tier2 - persistentUsedTier2);
      counts.tier3 = Math.max(0, counts.tier3 - persistentUsedTier3);
    }

    counts.tier1 += Math.max(0, runTier1);
    counts.tier2 += Math.max(0, runTier2);
    counts.tier3 += Math.max(0, runTier3);

    return counts;
  }, [
    healthPotionCount,
    idleRoom?.runHealthPotionsCollected,
    idleRoom?.runHealthPotionsCollectedTier1,
    idleRoom?.runHealthPotionsCollectedTier2,
    idleRoom?.runHealthPotionsCollectedTier3,
    idleRoom?.persistentHealthPotionsUsedTier1,
    idleRoom?.persistentHealthPotionsUsedTier2,
    idleRoom?.persistentHealthPotionsUsedTier3,
    inventoryItems,
  ]);

  const collectedHealthPotionsByTier = useMemo(() => {
    const counts = { tier1: 0, tier2: 0, tier3: 0 };
    lootsCollected.forEach((loot: any) => {
      const type = String(loot?.type ?? '').toLowerCase();
      if (type !== 'potion') return;
      const name = String(loot?.name ?? '').toLowerCase();
      const quantity = Number(loot?.quantity) || 0;
      if (quantity <= 0) return;
      if (!name.includes('health') && !name.includes('healing')) return;
      if (name.includes('ultra')) {
        counts.tier3 += quantity;
        return;
      }
      if (name.includes('greater')) {
        counts.tier2 += quantity;
        return;
      }
      counts.tier1 += quantity;
    });
    return counts;
  }, [lootsCollected]);

  const usedHealthPotionsByTier = useMemo(
    () => ({
      tier1: potionsUsedByTier.tier1,
      tier2: potionsUsedByTier.tier2,
      tier3: potionsUsedByTier.tier3,
    }),
    [potionsUsedByTier]
  );

  const totalKills = useMemo(() => {
    const killMap = (kills ?? {}) as unknown as Record<string, number>;
    return Object.values(killMap).reduce((sum, v) => sum + (Number(v) || 0), 0);
  }, [kills]);

  const totalPotionsUsed = useMemo(() => {
    const used = (potionsUsed ?? {}) as unknown as { health?: number; mana?: number };
    const health = Number(used.health) || 0;
    const mana = Number(used.mana) || 0;
    return health + mana;
  }, [potionsUsed]);

  const totalPotionsCollected = useMemo(() => {
    const collected = (potionsCollected ?? {}) as unknown as {
      health?: number;
      mana?: number;
    };
    const health = Number(collected.health) || 0;
    const mana = Number(collected.mana) || 0;
    return health + mana;
  }, [potionsCollected]);


  const hudDebugEnabled = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('devHud') === 'true';
  }, []);

  // Prefer server-authoritative state if available
  const isDailyQuestActive = serverDailyQuestActive || dailyQuestActive;
  const gotchiBonusMultiplier =
    isDailyQuestActive && usesRealGotchi ? 1.25 : 1;
  const effectiveDailyQuestMultiplier =
    competitionMultiplier * gotchiBonusMultiplier;
  const displayScore = isDailyQuestActive
    ? Math.round(score * effectiveDailyQuestMultiplier)
    : score;

  useEffect(() => {
    if (!hudDebugEnabled) return;
    console.log('[HUD Debug] Idle Potions', {
      healthPotionCount,
      manaPotionCount,
      bestHealthPotion,
      bestManaPotion,
      bestHealthTier,
      bestManaTier,
      healthPotionCounts,
      collectedHealthPotionsByTier,
      usedHealthPotionsByTier,
    });
  }, [
    hudDebugEnabled,
    healthPotionCount,
    manaPotionCount,
    bestHealthPotion,
    bestManaPotion,
    bestHealthTier,
    bestManaTier,
    healthPotionCounts,
    collectedHealthPotionsByTier,
    usedHealthPotionsByTier,
  ]);

  const availableSpells = useMemo(() => {
    if (!activeWeapon?.weaponCategory) {
      // No weapon equipped, only show spells with no weapon requirements
      return SPELLS.filter(
        (spell) =>
          spell.enabled !== false &&
          (!spell.allowedWeaponTypes || spell.allowedWeaponTypes.length === 0)
      );
    }

    return SPELLS.filter((spell) => {
      if (spell.enabled === false) return false;
      if (!spell.allowedWeaponTypes || spell.allowedWeaponTypes.length === 0) {
        return true;
      }
      return spell.allowedWeaponTypes.includes(activeWeapon.weaponCategory);
    });
  }, [activeWeapon?.weaponCategory]);
  // Track previous log to detect changes for SFX
  const [prevLog, setPrevLog] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const fullHistoryRef = useRef<string[]>([]);
  const [lastTickLogCount, setLastTickLogCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const [victoryChestPayload, setVictoryChestPayload] =
    useState<VictoryChestOpenedPayload | null>(null);
  const [isOpeningVictoryChest, setIsOpeningVictoryChest] = useState(false);
  const [victoryChestError, setVictoryChestError] = useState<string | null>(
    null
  );
  const [unsettledTradePosition, setUnsettledTradePosition] =
    useState<DailyQuestLeaderboardUpdatePayload | null>(null);
  const [tradeCountdownNowMs, setTradeCountdownNowMs] = useState(() => Date.now());
  const openRunsHydratedRunIdRef = useRef<string | null>(null);
  const openTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    room.onMessage(
      'victory_chest_opened',
      (payload: VictoryChestOpenedPayload) => {
        setVictoryChestPayload(payload);
        setVictoryChestError(null);
        setIsOpeningVictoryChest(false);
        if (openTimeoutRef.current != null) {
          window.clearTimeout(openTimeoutRef.current);
          openTimeoutRef.current = null;
        }
      }
    );

    room.onMessage(
      'victory_chest_open_failed',
      (payload: VictoryChestOpenFailedPayload) => {
        setVictoryChestError(payload?.reason || 'Failed to open victory chest');
        setIsOpeningVictoryChest(false);
        if (openTimeoutRef.current != null) {
          window.clearTimeout(openTimeoutRef.current);
          openTimeoutRef.current = null;
        }
      }
    );
  }, [room]);

  useEffect(() => {
    const unsubscribeLeaderboard = room.onMessage(
      'daily_quest:leaderboard_update',
      (payload: DailyQuestLeaderboardUpdatePayload) => {
        if (payload?.status === 'unsettled') {
          setUnsettledTradePosition(payload);
          setTradeCountdownNowMs(Date.now());
          return;
        }
        if (
          payload?.status === 'settled' &&
          payload?.runId &&
          unsettledTradePosition?.runId === payload.runId
        ) {
          setUnsettledTradePosition(null);
        }
      }
    );

    return () => {
      if (unsubscribeLeaderboard) {
        unsubscribeLeaderboard();
      }
    };
  }, [room, unsettledTradePosition?.runId]);

  useEffect(() => {
    if (!unsettledTradePosition?.closesAtUtc) {
      return;
    }
    const intervalId = window.setInterval(() => {
      setTradeCountdownNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [unsettledTradePosition?.closesAtUtc]);

  useEffect(() => {
    const isVictory = String(idleRoom?.runStatus ?? '') === 'victory';
    if (!isVictory) {
      return;
    }
    if (!isDailyQuestActive) {
      return;
    }
    if (unsettledTradePosition?.status === 'unsettled') {
      return;
    }

    const victoryRunId = String(idleRoom?.victoryChestGameId ?? '').trim();
    if (!victoryRunId) {
      return;
    }
    if (openRunsHydratedRunIdRef.current === victoryRunId) {
      return;
    }
    openRunsHydratedRunIdRef.current = victoryRunId;

    let cancelled = false;

    const hydrateFromOpenRuns = async () => {
      try {
        const serverBaseUrl = getServerUrlForRegion();
        const payload = await fetchOpenRuns(serverBaseUrl);
        if (cancelled) {
          return;
        }

        const matchedRun = payload.runs.find((run) => run.runId === victoryRunId);
        if (!matchedRun) {
          return;
        }

        setUnsettledTradePosition({
          tier: matchedRun.difficultyId,
          rawScore: matchedRun.baseScore,
          finalScore: matchedRun.estimatedFinalScore,
          timeMultiplier: matchedRun.timeMultiplier,
          gotchiBonusMultiplier: matchedRun.gotchiBonusMultiplier,
          isRealGotchi: matchedRun.isRealGotchi,
          rank: null,
          status: 'unsettled',
          runId: matchedRun.runId,
          token: matchedRun.token,
          direction: matchedRun.direction,
          riskLeverage: matchedRun.riskLeverage,
          tradeMultiplier: matchedRun.estimatedTradeMultiplier,
          estimatedTradeMultiplier: matchedRun.estimatedTradeMultiplier,
          estimatedFinalScore: matchedRun.estimatedFinalScore,
          entryPriceUsd: matchedRun.entryPriceUsd,
          livePriceUsd: matchedRun.livePriceUsd,
          closesAtUtc: matchedRun.closesAtUtc,
        });
        setTradeCountdownNowMs(Date.now());
      } catch (error) {
        console.warn('[IdleDungeonScreen] Failed to hydrate open run in summary', {
          runId: victoryRunId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    void hydrateFromOpenRuns();

    return () => {
      cancelled = true;
    };
  }, [
    idleRoom?.runStatus,
    idleRoom?.victoryChestGameId,
    isDailyQuestActive,
    unsettledTradePosition?.status,
  ]);

  useEffect(() => {
    return () => {
      if (openTimeoutRef.current != null) {
        window.clearTimeout(openTimeoutRef.current);
        openTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const status = String(idleRoom?.victoryChestStatus ?? '');
    if (status !== 'available') return;
    if (victoryChestError) setVictoryChestError(null);
  }, [idleRoom?.victoryChestStatus, victoryChestError]);

  useEffect(() => {
    const status = String(idleRoom?.victoryChestStatus ?? '');
    const raw = String(idleRoom?.victoryChestRewardJson ?? '');
    if (!raw) return;
    if (status !== 'opened') return;
    if (victoryChestPayload) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        setVictoryChestPayload(parsed as VictoryChestOpenedPayload);
      }
    } catch {}
  }, [idleRoom?.victoryChestStatus, idleRoom?.victoryChestRewardJson, victoryChestPayload]);

  function handleOpenVictoryChest() {
    if (isOpeningVictoryChest) return;
    setIsOpeningVictoryChest(true);
    setVictoryChestError(null);
    room.send('idle_open_victory_chest');
    if (openTimeoutRef.current != null) {
      window.clearTimeout(openTimeoutRef.current);
    }
    openTimeoutRef.current = window.setTimeout(() => {
      openTimeoutRef.current = null;
      setIsOpeningVictoryChest(false);
      setVictoryChestError(
        'Timed out opening chest. Please try again.'
      );
    }, 10000);
  }

  // Handle SFX and history
  useEffect(() => {
    if (
      idleRoom?.encounter?.lastActionLog &&
      idleRoom.encounter.lastActionLog !== prevLog
    ) {
      const fullLog = idleRoom.encounter.lastActionLog;
      setPrevLog(fullLog);

      // Split by newline to handle multiple actions in one tick
      const newLogs = fullLog
        .split('\n')
        .filter((line: string) => line.trim() !== '');

      // Check if we are at the bottom before updating history
      if (scrollRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        // 50px threshold for being "at the bottom"
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
        shouldAutoScrollRef.current = isAtBottom;
      }

      const uniqueNewLogs: string[] = [];
      for (const log of newLogs) {
        if (
          uniqueNewLogs.length > 0 &&
          uniqueNewLogs[uniqueNewLogs.length - 1] === log
        )
          continue;
        if (
          uniqueNewLogs.length === 0 &&
          history.length > 0 &&
          history[history.length - 1] === log
        )
          continue;
        uniqueNewLogs.push(log);
      }

      if (uniqueNewLogs.length > 0) {
        setLastTickLogCount(uniqueNewLogs.length);
        fullHistoryRef.current = [...fullHistoryRef.current, ...uniqueNewLogs];
        setHistory((prev) => {
          // Append new logs to the end
          const next = [...prev, ...uniqueNewLogs];
          return next.slice(-200);
        });
      }

      // Play SFX based on the content of the latest line or all new lines
      for (const log of newLogs) {
        if (log.includes('hits you')) playSound('gotchihit');
        else if (log.includes('You hit')) playSound('slash');
        else if (log.includes('defeated')) playSound('enemy_dead');
        else if (log.includes('enter Room')) playSound('fastwoosh');
      }
    }
  }, [idleRoom?.encounter?.lastActionLog, prevLog]);

  // Handle auto-scroll after history updates
  useEffect(() => {
    if (shouldAutoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  // Reset history only on full run restart
  useEffect(() => {
    if (
      idleRoom?.runStatus === 'active' &&
      idleRoom?.depth === 1 &&
      idleRoom?.roomsVisited === 1
    ) {
      setHistory([]);
      setPrevLog('');
      setLastTickLogCount(0);
      fullHistoryRef.current = [];
      setUnsettledTradePosition(null);
    }
  }, [idleRoom?.runStatus, idleRoom?.depth, idleRoom?.roomsVisited]);

  function handleDownloadActionLog() {
    const logs = fullHistoryRef.current.length > 0
      ? fullHistoryRef.current
      : history;
    if (logs.length === 0) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `idle-run-action-log-${timestamp}.txt`;
    const content = logs.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const hasActionLog =
    fullHistoryRef.current.length > 0 || history.length > 0;

  if (!idleRoom)
    return (
      <div className="text-white flex items-center justify-center h-screen">
        Loading Dungeon...
      </div>
    );

  const { encounter, depth, runStatus, grenadeCooldownRemaining } = idleRoom;
  const {
    name,
    progressCurrent,
    progressMax,
    isCompleted,
    type,
    isPlayerTurn,
    lastActionLog,
    imageId,
    enemies,
    targetIndex,
    distance,
    playerAttackRange,
    loots,
    playerAttackSpeed,
    playerActionGauge,
  } = encounter;

  const sendAction = (action: string) => {
    room.send('idle_combat_action', { action });
  };

  const nextRoom = () => {
    room.send('idle_enter_next_room');
  };

  const kite = () => {
    room.send('idle_kite');
  };

  const throwGrenade = () => {
    room.send('idle_grenade');
  };

  const castSpell = (spellId: string) => {
    room.send('idle_cast_spell', { spellId });
  };

  const toggleAuto = () => {
    room.send('idle_toggle_auto', { enabled: !isAutoExploring });
  };

  const toggleSpeedRun = () => {
    room.send('idle_set_speed_run', { enabled: !speedRun });
  };

  const adjustSpeedRunMultiplier = (delta: number) => {
    const next = Math.min(50, Math.max(1, (speedRunMultiplier || 1) + delta));
    room.send('idle_set_speed_run', { enabled: speedRun, multiplier: next });
  };

  const outcomeLabel = runStatus === 'victory' ? 'Victory!' : 'Game Over';
  const killingEnemy =
    idleRoom?.lastKillingEnemyName && idleRoom.lastKillingEnemyName.length > 0
      ? idleRoom.lastKillingEnemyName
      : 'Unknown';
  const killingEnemyHpRemaining =
    typeof idleRoom?.lastKillingEnemyHpRemaining === 'number' &&
    idleRoom.lastKillingEnemyHpRemaining >= 0
      ? idleRoom.lastKillingEnemyHpRemaining
      : null;
  const killingEnemyHpMax =
    typeof idleRoom?.lastKillingEnemyHpMax === 'number' &&
    idleRoom.lastKillingEnemyHpMax > 0
      ? idleRoom.lastKillingEnemyHpMax
      : null;
  const killingEnemyDamage =
    typeof idleRoom?.lastKillingEnemyDamage === 'number' &&
    idleRoom.lastKillingEnemyDamage >= 0
      ? idleRoom.lastKillingEnemyDamage
      : null;
  const playerHpOnDeath =
    typeof idleRoom?.lastKillingPlayerHpRemaining === 'number'
      ? idleRoom.lastKillingPlayerHpRemaining
      : null;
  const characterName = (() => {
    if (!characterId) return 'Unknown';
    if (characterId.startsWith('gotchi:')) {
      const idPart = characterId.split(':')[1];
      return idPart ? `Gotchi #${idPart}` : 'Gotchi';
    }
    const character = getCharacter(characterId);
    return character?.info?.name || characterId;
  })();

  const isRunEnded = runStatus === 'dead' || runStatus === 'victory' || playerHp <= 0;
  const isVictory = runStatus === 'victory';
  const victoryChestStatus = String(idleRoom?.victoryChestStatus ?? 'none');
  const endFlowChestStatus = isVictory ? victoryChestStatus : 'none';
  const endFlowChestPayload = isVictory ? victoryChestPayload : null;
  const endFlowChestError = isVictory ? victoryChestError : null;
  const endFlowIsOpening = isVictory ? isOpeningVictoryChest : false;
  const endFlowDailyQuestActive = isVictory ? isDailyQuestActive : false;
  const handleOpenVictoryChestSafe = isVictory ? handleOpenVictoryChest : () => {};
  const unsettledPosition =
    unsettledTradePosition?.status === 'unsettled'
      ? unsettledTradePosition
      : null;
  const unsettledEstimatedMultiplier = Number(
    unsettledPosition?.estimatedTradeMultiplier ??
      unsettledPosition?.tradeMultiplier ??
      1
  );
  const unsettledEstimatedFinalScore = Number(
    unsettledPosition?.estimatedFinalScore ?? unsettledPosition?.finalScore ?? 0
  );
  const unsettledEntryPriceUsd = Number(unsettledPosition?.entryPriceUsd ?? 0);
  const unsettledDirectionLabel =
    unsettledPosition?.direction === 'short' ? '📉 Down' : '📈 Up';
  const unsettledLeverage = Math.round(
    Number(unsettledPosition?.riskLeverage ?? 1)
  );

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-slate-100 font-sans p-4 select-none relative">
      {isRunEnded ? (
        <EndFlowController
          outcome={runStatus === 'victory' ? 'victory' : 'defeat'}
          isDailyQuestActive={endFlowDailyQuestActive}
          victoryChestStatus={endFlowChestStatus}
          victoryChestPayload={endFlowChestPayload}
          isOpeningVictoryChest={endFlowIsOpening}
          victoryChestError={endFlowChestError}
          onOpenVictoryChest={handleOpenVictoryChestSafe}
          onDownloadActionLog={handleDownloadActionLog}
          hasActionLog={hasActionLog}
          onBackToLobby={() => {
            if (onLeave) onLeave();
            else room.leave();
          }}
          renderSummary={() => (
            <div className="w-full max-w-3xl mx-auto mb-4">
              <div className="w-full rounded-2xl p-4 sm:p-5 relative overflow-hidden border border-amber-400/60 ring-1 ring-amber-200/10 bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-black/95 shadow-[0_0_0_1px_rgba(251,191,36,0.12),0_12px_28px_rgba(0,0,0,0.45)] before:content-[''] before:absolute before:inset-2 before:rounded-[14px] before:border before:border-amber-200/20 before:pointer-events-none after:content-[''] after:absolute after:inset-0 after:bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.18),transparent_60%)] after:pointer-events-none">
                <h2 className="text-xl text-slate-400 mb-3 border-b border-slate-700 pb-2 uppercase tracking-widest font-black">
                  Run Summary
                </h2>

                {/* Compact Summary Panel */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-white/5 p-2 rounded-lg border border-white/10 flex flex-col items-center justify-center text-center">
                    <div className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter mb-1 whitespace-nowrap">
                      Outcome
                    </div>
                    <div className="text-xs font-black text-slate-100">
                      {outcomeLabel}
                    </div>
                  </div>
                  <div className="bg-white/5 p-2 rounded-lg border border-white/10 flex flex-col items-center justify-center text-center">
                    <div className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter mb-1 whitespace-nowrap">
                      Floor
                    </div>
                    <div className="text-sm font-hud font-black text-white">
                      {Math.ceil(depth / 10)}-{depth % 10 || 10}
                    </div>
                  </div>
                  <div className="bg-white/5 p-2 rounded-lg border border-white/10 flex flex-col items-center justify-center text-center overflow-hidden">
                    <div className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter mb-1 whitespace-nowrap">
                      Difficulty
                    </div>
                    <div className="text-[9px] font-black text-purple-400 uppercase leading-none truncate w-full">
                      {difficultyTier
                        .replace(/normal_/g, 'N')
                        .replace(/nightmare_/g, 'NM')
                        .replace(/_/g, ' ')}
                    </div>
                  </div>
                  <div className="bg-white/5 p-2 rounded-lg border border-white/10 flex flex-col items-center justify-center text-center">
                    <div className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter mb-1 whitespace-nowrap">
                      Rooms
                    </div>
                    <div className="text-sm font-black text-slate-100">
                      {idleRoom.roomsVisited}
                    </div>
                  </div>
                </div>

                <details className="mt-3" open>
                  <summary className="cursor-pointer text-slate-300 text-sm font-bold">
                    Run Stats
                  </summary>
                  <div className="mt-3 space-y-3">
                    {(totalKills > 0 ||
                      Number(score) > 0 ||
                      Number(maxDepthReached) > 0 ||
                      totalPotionsCollected > 0 ||
                      totalPotionsUsed > 0) && (
                      <div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                            <span className="text-[10px] text-slate-300 font-bold">
                              Enemies Killed
                            </span>
                            <span className="text-sm text-white font-black tabular-nums">
                              {totalKills}
                            </span>
                          </div>
                          <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                            <span className="text-[10px] text-slate-300 font-bold">
                              Score
                            </span>
                            <span className="text-sm text-white font-black tabular-nums">
                              {Number(score) || 0}
                            </span>
                          </div>
                          <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                            <span className="text-[10px] text-slate-300 font-bold">
                              Max Depth
                            </span>
                            <span className="text-sm text-white font-black tabular-nums">
                              {Number(maxDepthReached) || 0}
                            </span>
                          </div>
                          <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                            <span className="text-[10px] text-slate-300 font-bold">
                              Potions Used
                            </span>
                            <span className="text-sm text-white font-black tabular-nums">
                              {totalPotionsUsed}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {unsettledPosition ? (
                      <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-[10px] text-emerald-300 uppercase font-bold tracking-widest">
                            Open Prediction Position
                          </h3>
                          <span className="text-[10px] text-emerald-200/80 font-mono">
                            Closes {formatTradeCountdown(unsettledPosition.closesAtUtc, tradeCountdownNowMs)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                          <div className="rounded bg-black/20 border border-emerald-400/20 px-2 py-1.5">
                            <div className="text-emerald-100/70">Position</div>
                            <div className="font-semibold text-emerald-100">
                              {unsettledPosition.token ?? '—'} · {unsettledDirectionLabel}
                            </div>
                          </div>
                          <div className="rounded bg-black/20 border border-emerald-400/20 px-2 py-1.5">
                            <div className="text-emerald-100/70">Leverage</div>
                            <div className="font-mono text-emerald-100">
                              {unsettledLeverage}x
                            </div>
                          </div>
                          <div className="rounded bg-black/20 border border-emerald-400/20 px-2 py-1.5">
                            <div className="text-emerald-100/70">Entry</div>
                            <div className="font-mono text-emerald-100">
                              $
                              {formatTradeUsdPrice(
                                unsettledEntryPriceUsd,
                                unsettledPosition?.token
                              )}
                            </div>
                          </div>
                          <div className="rounded bg-black/20 border border-emerald-400/20 px-2 py-1.5">
                            <div className="text-emerald-100/70">Est. Mult</div>
                            <div className="font-mono text-emerald-100">
                              {unsettledEstimatedMultiplier.toFixed(3)}x
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-emerald-100/80">
                            Est. Final Score:{' '}
                            <strong className="text-emerald-100">
                              {Math.max(0, Math.round(unsettledEstimatedFinalScore)).toLocaleString()}
                            </strong>
                          </span>
                          <span className="text-emerald-200/70">
                            Manage in lobby Open Runs
                          </span>
                        </div>
                      </div>
                    ) : null}

                    {tokenRewards && tokenRewards.length > 0 && (
                      <div>
                        <h3 className="text-[10px] text-amber-400 uppercase font-bold tracking-widest mb-1.5 border-b border-amber-600/30 pb-1 flex items-center gap-2">
                          <span>💰 Token Rewards</span>
                          <span className="text-[8px] text-amber-300/60 font-normal tracking-normal">
                            (Daily Quest)
                          </span>
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                          {tokenRewards.map((token: any, idx: number) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 bg-amber-500/10 border-2 border-amber-500/30 rounded-lg p-2 shadow-lg"
                            >
                              <LootIcon loot={token} className="w-10 h-10 shrink-0" />
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs text-amber-100 font-black truncate leading-none mb-1">
                                  {token.name}
                                </span>
                                <span className="text-[10px] text-amber-300/80 font-mono leading-none">
                                  {token.tokenAmount > 0
                                    ? `${token.tokenAmount.toFixed(2)} ${token.name}`
                                    : 'Cryptocurrency'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {lootsCollected && lootsCollected.length > 0 && (
                      <div>
                        <h3 className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1.5 border-b border-slate-800 pb-1">
                          {runStatus === 'victory' ? 'Loot Collected' : 'Loot Lost'}
                        </h3>
                        <div className="max-h-[200px] md:max-h-[220px] lg:max-h-[240px] overflow-y-auto overscroll-contain pr-1">
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                            {sortLootsForSummary(groupLoots(lootsCollected)).map((loot: any, idx: number) => (
                              <div
                                key={idx}
                                className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg p-2"
                              >
                                <LootIcon loot={loot} className="w-8 h-8 shrink-0" />
                                <div className="flex flex-col min-w-0">
                                  <span className="text-[10px] text-white font-bold truncate leading-none mb-1">
                                    {loot.quality
                                      ? `${getQualityLabelForWearable(
                                          normalizeQualityTier(loot.quality),
                                          loot.wearableSlug
                                        )} ${loot.name}`
                                      : loot.name}
                                  </span>
                                  <span className="text-[9px] text-slate-400 font-mono leading-none">
                                    x{loot.quantity}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {!(totalKills > 0 ||
                      Number(score) > 0 ||
                      Number(maxDepthReached) > 0 ||
                      totalPotionsCollected > 0 ||
                      totalPotionsUsed > 0) &&
                    (!tokenRewards || tokenRewards.length === 0) &&
                    (!lootsCollected || lootsCollected.length === 0) ? (
                      <div className="text-[11px] text-white/60">
                        No additional details.
                      </div>
                    ) : null}
                  </div>
                </details>
              </div>
            </div>
          )}
        />
      ) : null}
      {/* XP Bar - Very Top */}
      <div className="absolute top-0 left-0 w-full h-1.5 bg-slate-900 overflow-hidden z-50">
        <div
          className="h-full bg-sky-400 transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(56,189,248,0.6)]"
          style={{
            width: `${Math.min(100, (playerXpIntoLevel / playerXpForNextLevel) * 100)}%`,
          }}
        />
        <div className="absolute top-2 left-4 text-[8px] font-bold text-sky-400/60 uppercase tracking-[0.2em] pointer-events-none">
          Level {playerLevel} • {playerXpIntoLevel.toLocaleString()} /{' '}
          {playerXpForNextLevel.toLocaleString()} XP
        </div>
      </div>


      {/* Header */}
      <div className="absolute top-4 left-4 flex flex-col gap-1">
        <div className="text-xl font-bold text-yellow-500 flex items-center gap-2">
          ⬇️ Floor {Math.ceil(depth / 10)} - Room {depth % 10 || 10}
          <span className="text-slate-500 text-xs font-normal ml-2">
            Boss: Floor {targetFloor}
          </span>
        </div>
        <div className="flex gap-2 items-center">
          <div className="px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[10px] font-bold uppercase tracking-wider">
            {difficultyTier.replace(/_/g, ' ')}
          </div>
          <div className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
            LEV {Math.round(leverage)}x
          </div>
        </div>
      </div>

      {/* Auto Toggle - Top Right */}
      <div className="absolute top-4 right-4 flex items-center gap-3">
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
            {isDailyQuestActive ? 'Daily Quest Score' : 'Score'}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xl font-hud font-black text-white tabular-nums leading-none">
              {displayScore.toLocaleString()}
            </span>
            {isDailyQuestActive && competitionMultiplier > 1 && (
              <span className="text-xs font-bold text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
                Time ×{competitionMultiplier.toFixed(2)}
              </span>
            )}
            {isDailyQuestActive && usesRealGotchi && (
              <span className="text-xs font-bold text-emerald-300 bg-emerald-500/20 px-1.5 py-0.5 rounded border border-emerald-500/30">
                Real Gotchi +25%
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => adjustSpeedRunMultiplier(-5)}
            className="font-mono text-[11px] px-2 py-2 border bg-slate-800 border-slate-600 hover:bg-slate-700 text-slate-300"
          >
            -
          </Button>
          <div className="flex flex-col items-center min-w-[64px]">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
              Speed
            </span>
            <span className="text-xs font-mono text-amber-300">
              x{Math.max(1, Math.floor(speedRunMultiplier || 1))}
            </span>
          </div>
          <Button
            onClick={() => adjustSpeedRunMultiplier(5)}
            className="font-mono text-[11px] px-2 py-2 border bg-slate-800 border-slate-600 hover:bg-slate-700 text-slate-300"
          >
            +
          </Button>
          <Button
            onClick={toggleSpeedRun}
            className={`font-mono text-[11px] px-3 py-2 border ${
              speedRun
                ? 'bg-amber-600 border-amber-400 hover:bg-amber-500'
                : 'bg-slate-800 border-slate-600 hover:bg-slate-700 text-slate-400'
            }`}
          >
            {speedRun ? '✓ SPEED RUN' : 'SPEED RUN'}
          </Button>
        </div>
      </div>

      {/* Visual Area */}
      <div className="w-full max-w-lg h-64 bg-slate-900 rounded-xl border border-slate-700 flex items-center justify-center mb-6 relative overflow-hidden shadow-2xl">
        {type === 'combat' ? (
          <div
            className="flex gap-4 items-end justify-center w-full h-full pb-8 px-4 transition-all duration-1000 ease-in-out"
            style={{
              transform: `translateX(${Math.min(150, (distance - 32) / 3)}px)`,
            }}
          >
            {enemies && enemies.length > 0 ? (
              enemies.map((enemy: any, idx: number) => {
                if (enemy.isDead) return null;
                const isTarget = idx === targetIndex;
                const spriteConfig =
                  ENEMY_SPRITE_CONFIGS[enemy.imageId] ||
                  ENEMY_SPRITE_CONFIGS['slime'];
                return (
                  <div
                    key={idx}
                    onClick={() => room.send('idle_set_target', { index: idx })}
                    className={`flex flex-col items-center cursor-pointer transition-all relative group ${
                      isTarget
                        ? 'z-10 scale-110 drop-shadow-[0_0_8px_rgba(220,38,38,0.8)]'
                        : 'opacity-90 hover:opacity-100 hover:scale-105'
                    } ${enemy.specialState === 'charging' ? 'ring-2 ring-red-500 rounded-lg animate-pulse bg-red-500/20' : ''}`}
                  >
                    {/* Target Indicator */}
                    {isTarget && (
                      <div className="absolute -top-6 text-red-500 font-bold animate-bounce">
                        ▼
                      </div>
                    )}

                    {/* Charging Indicator */}
                    {enemy.specialState === 'charging' && (
                      <div className="absolute -top-8 bg-red-600 text-white text-[8px] font-black px-1 rounded animate-bounce">
                        CHARGING!
                      </div>
                    )}

                    {/* HP Bar mini */}
                    <div className="w-16 bg-slate-800 h-1.5 mb-0.5 rounded-full overflow-hidden border border-slate-900">
                      <div
                        className="bg-red-500 h-full transition-all"
                        style={{
                          width: `${(Math.max(0, enemy.hp) / enemy.maxHp) * 100}%`,
                        }}
                      />
                    </div>
                    <Sprite config={spriteConfig} />
                    <div className="text-[8px] font-mono text-slate-400 mt-1">
                      SPD: {enemy.attackSpeed}
                    </div>
                  </div>
                );
              })
            ) : (
              <Sprite
                config={
                  ENEMY_SPRITE_CONFIGS[imageId] || ENEMY_SPRITE_CONFIGS['slime']
                }
              />
            )}
          </div>
        ) : type === 'portal' ? (
          <div className="relative group cursor-pointer transition-transform hover:scale-110">
            <img
              src="/sprites/portals/og_portal.png"
              alt="Portal"
              className="w-32 h-32 object-contain animate-[pulse_2s_infinite]"
            />
            <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl animate-pulse" />
          </div>
        ) : (
          <div className="text-8xl animate-bounce">
            {type === 'treasure' ? '📦' : '✨'}
          </div>
        )}

        {/* Distance Indicator */}
        {type === 'combat' && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/60 px-3 py-1 rounded-full text-xs font-mono text-slate-300 border border-slate-700">
            DISTANCE: {Math.round(distance)}px
          </div>
        )}

        {/* Name only if single target or group summary */}
        <div className="absolute bottom-2 text-slate-300 font-semibold text-sm bg-black/50 px-2 rounded">
          {type === 'combat' && enemies && enemies.length > 1
            ? `${enemies.filter((e: any) => !e.isDead).length} Hostiles Remaining`
            : name}
        </div>
      </div>

      {/* Progress / Stats */}
      <div className="w-full max-w-lg mb-6 space-y-4">
        {/* Global Encounter Health (Sum of all) */}
        <div className="min-h-[44px]">
          {type === 'combat' ? (
            <div>
              <div className="flex justify-between text-sm mb-1 font-mono">
                <span className="text-red-400 font-bold">Total Enemy HP</span>
                <span>
                  {progressCurrent}/{progressMax} HP
                </span>
              </div>
              <div className="h-6 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                <div
                  className="h-full bg-red-600 transition-all duration-300 ease-out"
                  style={{
                    width: `${(Math.max(0, progressCurrent) / progressMax) * 100}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="h-[44px]" /> // Placeholder to maintain height
          )}
        </div>

        {/* Player Health */}
        <div className="min-h-[68px]">
          <div className="flex justify-between text-sm mb-1 font-mono">
            <div className="flex items-center gap-2">
              <span className="text-green-400 font-bold">Player</span>
              <span className="text-[10px] text-slate-500">
                SPD: {playerAttackSpeed}
              </span>
              <div className="flex items-center gap-2 ml-2">
                <div className="flex items-center gap-1 bg-red-900/30 px-1.5 py-0.5 rounded border border-red-500/20">
                  <img
                    src="/wearables/126.svg"
                    className="w-3.5 h-3.5"
                    alt="Health Potion"
                  />
                  <span className="text-[10px] font-bold text-red-400">
                    {healthPotionCounts.tier1}
                  </span>
                  <span className="text-[9px] text-white/60 font-mono">T1</span>
                </div>
                <div className="flex items-center gap-1 bg-red-900/30 px-1.5 py-0.5 rounded border border-red-500/20">
                  <img
                    src="/wearables/127.svg"
                    className="w-3.5 h-3.5"
                    alt="Greater Healing Potion"
                  />
                  <span className="text-[10px] font-bold text-red-300">
                    {healthPotionCounts.tier2}
                  </span>
                  <span className="text-[9px] text-white/60 font-mono">T2</span>
                </div>
                <div className="flex items-center gap-1 bg-red-900/30 px-1.5 py-0.5 rounded border border-red-500/20">
                  <img
                    src="/wearables/129.svg"
                    className="w-3.5 h-3.5"
                    alt="Ultra Healing Potion"
                  />
                  <span className="text-[10px] font-bold text-red-200">
                    {healthPotionCounts.tier3}
                  </span>
                  <span className="text-[9px] text-white/60 font-mono">T3</span>
                </div>
                <div className="flex items-center gap-1 bg-blue-900/30 px-1.5 py-0.5 rounded border border-blue-500/20">
                  <img
                    src={`/wearables/${getPotionSpriteId(bestManaPotion, 128)}.svg`}
                    className="w-3.5 h-3.5"
                    alt={bestManaPotion?.name ?? 'Mana Potion'}
                  />
                  <span className="text-[10px] font-bold text-blue-400">
                    {manaPotionCount}
                  </span>
                  <span className="text-[9px] text-white/60 font-mono">MP</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span>
                {Math.ceil(playerHp)}/{maxHp} HP
              </span>
              {maxMana > 0 && (
                <span className="text-blue-400 border-l border-slate-700 pl-3">
                  {Math.floor(playerMana)}/{maxMana} MP
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {characterId && (
              <div className="flex-shrink-0 border-2 border-slate-700 rounded-lg bg-slate-900 overflow-hidden relative">
                <CharacterPreview
                  characterId={characterId}
                  size="sm"
                  isSelected={true}
                />
                {/* Manual Turn Indicator Overlay */}
                {isPlayerTurn && (
                  <div className="absolute inset-0 ring-2 ring-green-500 animate-pulse pointer-events-none" />
                )}
              </div>
            )}
            <div className="flex flex-col flex-1 gap-1.5 max-w-[280px]">
              {/* HP Bar */}
              <div className="h-6 bg-slate-800 rounded-full overflow-hidden border border-slate-700 w-full relative">
                <div
                  className="h-full bg-green-600 transition-all duration-300 ease-out"
                  style={{
                    width: `${(Math.max(0, playerHp) / maxHp) * 100}%`,
                  }}
                />
              </div>
              {/* Mana Bar */}
              {maxMana > 0 && (
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700 w-full relative">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300 ease-out"
                    style={{
                      width: `${(Math.max(0, playerMana) / maxMana) * 100}%`,
                    }}
                  />
                </div>
              )}
            </div>

            {/* Abilities Section */}
            {activeGrenade && (
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                  grenadeCooldownRemaining > 0
                    ? 'bg-slate-800/80 border-slate-600 opacity-70'
                    : 'bg-gradient-to-br from-orange-600/40 to-amber-700/30 border-orange-500 shadow-lg shadow-orange-500/20'
                }`}
                title={`${activeGrenade.name}${grenadeCooldownRemaining > 0 ? ` - Cooldown: ${grenadeCooldownRemaining}s` : ' - Ready!'}`}
              >
                <img
                  src={`/wearables/${activeGrenade.svgId}.svg`}
                  className={`w-8 h-8 object-contain transition-all ${
                    grenadeCooldownRemaining > 0
                      ? 'grayscale opacity-60'
                      : 'drop-shadow-[0_0_4px_rgba(251,146,60,0.6)]'
                  }`}
                  alt={activeGrenade.name}
                />
                <span
                  className={`text-xs font-bold ${grenadeCooldownRemaining > 0 ? 'text-slate-400' : 'text-orange-300'}`}
                >
                  {grenadeCooldownRemaining > 0
                    ? `${grenadeCooldownRemaining}s`
                    : '✓'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Log */}
      <div
        ref={scrollRef}
        className={cn(
          'w-full max-w-lg bg-black/40 rounded-lg p-3 mb-4 text-sm font-mono overflow-y-auto border border-slate-800 scroll-smooth select-text cursor-text',
          isAutoExploring ? 'h-96' : 'h-48'
        )}
      >
        {history.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {history.map((log, index) => {
              const isLatestGroup = index >= history.length - lastTickLogCount;
              return (
                <div
                  key={index}
                  className={cn(
                    'transition-all duration-500 break-words',
                    isLatestGroup
                      ? 'text-slate-200 animate-in fade-in slide-in-from-bottom-2 duration-300'
                      : 'text-slate-600 opacity-60'
                  )}
                >
                  {log
                    .split(
                      /(CRITICAL STRIKE!|Health Potion|HP Potion|Mana Potion|::enemy:.*?::|::spell:.*?::|::gold::.*?::|::wearable:.*?::)/g
                    )
                    .map((part, i) => {
                      if (part === 'CRITICAL STRIKE!') {
                        return (
                          <span
                            key={i}
                            className={cn(
                              'text-red-500 font-black',
                              isLatestGroup ? 'text-lg' : 'text-sm'
                            )}
                          >
                            {part}
                          </span>
                        );
                      }
                      if (part.startsWith('::gold::')) {
                        return (
                          <span
                            key={i}
                            className={cn(
                              'text-yellow-400 font-black',
                              isLatestGroup ? 'text-lg' : 'text-sm'
                            )}
                          >
                            {part.replace('::gold::', '').replace(/::$/, '')}
                          </span>
                        );
                      }
                      if (
                        part === 'Health Potion' ||
                        part === 'HP Potion' ||
                        part === 'Mana Potion'
                      ) {
                        const isHp =
                          part === 'Health Potion' || part === 'HP Potion';
                        return (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 mx-0.5 align-middle bg-white/5 px-1 rounded border border-white/10"
                          >
                            <img
                              src={`/wearables/${isHp ? '126' : '128'}.svg`}
                              className="w-4 h-4 object-contain"
                              alt={part}
                            />
                            <span
                              className={cn(
                                'font-bold',
                                isHp ? 'text-red-400' : 'text-blue-400'
                              )}
                            >
                              {part}
                            </span>
                          </span>
                        );
                      }
                      if (part.startsWith('::spell:') && part.endsWith('::')) {
                        const spellId = part
                          .replace('::spell:', '')
                          .replace('::', '');
                        const spell = SPELLS.find((s) => s.id === spellId);
                        if (!spell || !spell.icon) return null;

                        return (
                          <span
                            key={i}
                            className="inline-flex items-center justify-center w-6 h-6 mx-0.5 align-middle bg-white/5 rounded border border-white/10 overflow-hidden relative shadow-sm"
                          >
                            <img
                              src={spell.icon}
                              className="w-full h-full object-cover"
                              alt={spell.name}
                            />
                          </span>
                        );
                      }
                      if (part.startsWith('::enemy:') && part.endsWith('::')) {
                        const imageId = part
                          .replace('::enemy:', '')
                          .replace('::', '');
                        const config =
                          ENEMY_SPRITE_CONFIGS[imageId] ||
                          ENEMY_SPRITE_CONFIGS['slime'];

                        // Calculate scale to fit in a 24x24 box
                        const maxDim = Math.max(
                          config.frameWidth,
                          config.frameHeight
                        );
                        const scale = 24 / maxDim;

                        return (
                          <span
                            key={i}
                            className="inline-flex items-center justify-center w-6 h-6 mx-0.5 align-middle bg-white/5 rounded border border-white/10 overflow-hidden relative"
                          >
                            <div
                              style={{
                                width: config.frameWidth,
                                height: config.frameHeight,
                                backgroundImage: `url(${config.imagePath})`,
                                backgroundPosition: '0 0',
                                backgroundRepeat: 'no-repeat',
                                imageRendering: 'pixelated',
                                transform: `scale(${scale})`,
                                position: 'absolute',
                              }}
                            />
                          </span>
                        );
                      }
                      if (
                        part.startsWith('::wearable:') &&
                        part.endsWith('::')
                      ) {
                        const svgId = part
                          .replace('::wearable:', '')
                          .replace('::', '');
                        return (
                          <span
                            key={i}
                            className="inline-flex items-center justify-center w-6 h-6 mx-0.5 align-middle bg-white/5 rounded border border-white/10 overflow-hidden"
                          >
                            <img
                              src={`/wearables/${svgId}.svg`}
                              className="w-5 h-5 object-contain"
                              alt="Item"
                            />
                          </span>
                        );
                      }
                      return part;
                    })}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-slate-600 italic mt-8 flex flex-col items-center gap-2">
            <div className="animate-spin h-4 w-4 border-2 border-slate-700 border-t-slate-500 rounded-full" />
            <span>Encounter started...</span>
          </div>
        )}
      </div>

      {/* Loot Found */}
      <div className="w-full max-w-lg min-h-[52px] mb-4">
        {loots && loots.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {groupLoots(loots).map((loot: any, idx: number) => (
              <div
                key={idx}
                className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 shrink-0 animate-in zoom-in duration-300"
              >
                <LootIcon loot={loot} className="w-10 h-10 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 font-bold uppercase leading-none mb-1">
                    {loot.quality
                      ? `${getQualityLabelForWearable(
                          normalizeQualityTier(loot.quality),
                          loot.wearableSlug
                        )} ${loot.name}`
                      : loot.name}
                  </span>
                  <span className="text-xs font-mono text-white leading-none">
                    x{loot.quantity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-[52px]" /> // Placeholder
        )}
      </div>

      {/* Spells Bar (Removed - now in Actions) */}

      {/* Actions */}
      {!isAutoExploring && (
        <div className="w-full max-w-lg min-h-24">
          {isCompleted ? (
            <div className="flex justify-center">
              <Button
                onClick={nextRoom}
                className="bg-yellow-600 hover:bg-yellow-500 py-4 px-8 text-xl font-bold shadow-lg shadow-yellow-900/20"
              >
                Enter Next Room ➡
              </Button>
            </div>
          ) : (
            <>
              {type === 'combat' ? (
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {/* Standard Actions */}
                  <Button
                    onClick={() => sendAction('attack')}
                    disabled={!isPlayerTurn}
                    className={`h-16 px-6 text-sm font-bold transition-all rounded-xl ${
                      !isPlayerTurn
                        ? 'opacity-50 cursor-not-allowed bg-slate-700'
                        : 'bg-red-700 hover:bg-red-600 shadow-red-900/50 shadow-lg active:transform active:scale-95'
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center">
                      {activeWeapon && (
                        <img
                          src={`/wearables/${activeWeapon.svgId}.svg`}
                          className="w-6 h-6 object-contain mb-1"
                          alt={activeWeapon.name}
                        />
                      )}
                      <span>
                        {distance > playerAttackRange ? 'Move' : 'Attack'}
                      </span>
                    </div>
                  </Button>

                  <Button
                    onClick={kite}
                    disabled={!isPlayerTurn}
                    className={`h-16 px-6 text-sm font-bold transition-all rounded-xl ${
                      !isPlayerTurn
                        ? 'opacity-50 cursor-not-allowed bg-slate-700'
                        : 'bg-blue-700 hover:bg-blue-600 shadow-blue-900/50 shadow-lg active:transform active:scale-95'
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center gap-1">
                      <span className="text-xl leading-none">🏃‍♂️</span>
                      <span>Kite</span>
                    </div>
                  </Button>

                  {activeGrenade && (
                    <Button
                      onClick={throwGrenade}
                      disabled={!isPlayerTurn || grenadeCooldownRemaining > 0}
                      className={`h-16 px-4 text-sm font-bold transition-all rounded-xl ${
                        !isPlayerTurn || grenadeCooldownRemaining > 0
                          ? 'opacity-50 cursor-not-allowed bg-slate-700'
                          : 'bg-orange-700 hover:bg-orange-600 shadow-orange-900/50 shadow-lg active:transform active:scale-95'
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center">
                        <img
                          src={`/wearables/${activeGrenade.svgId}.svg`}
                          className="w-6 h-6 object-contain mb-1"
                          alt={activeGrenade.name}
                        />
                        <span className="text-[10px]">
                          {grenadeCooldownRemaining > 0
                            ? `CD(${grenadeCooldownRemaining})`
                            : 'Grenade'}
                        </span>
                      </div>
                    </Button>
                  )}

                  {/* Spells */}
                  {availableSpells.map((spell) => {
                    const cooldownRemaining =
                      idleRoom.spellCooldowns?.[spell.id] || 0;
                    return (
                      <SpellSquare
                        key={spell.id}
                        spell={spell}
                        cooldownRemaining={cooldownRemaining}
                        playerMana={playerMana}
                        onClick={() => castSpell(spell.id)}
                        disabled={!isPlayerTurn}
                      />
                    );
                  })}
                </div>
              ) : (
                <Button
                  onClick={nextRoom}
                  className="w-full bg-blue-600 hover:bg-blue-500 py-4 text-xl font-bold rounded-xl"
                >
                  Continue
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {/* Spells shown in auto mode (visible but disabled) */}
      {isAutoExploring &&
        !isCompleted &&
        type === 'combat' &&
        availableSpells.length > 0 && (
          <div className="w-full max-w-lg">
            <div className="flex flex-wrap items-center justify-center gap-3">
              {availableSpells.map((spell) => {
                const cooldownRemaining =
                  idleRoom.spellCooldowns?.[spell.id] || 0;
                return (
                  <SpellSquare
                    key={spell.id}
                    spell={spell}
                    cooldownRemaining={cooldownRemaining}
                    playerMana={playerMana}
                    disabled
                  />
                );
              })}
            </div>
          </div>
        )}
    </div>
  );
};
