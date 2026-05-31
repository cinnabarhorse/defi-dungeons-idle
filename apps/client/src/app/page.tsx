'use client';

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type SetStateAction,
} from 'react';
import { IdleGameContainer } from '../components/containers/IdleGameContainer';
import { Client as ColyseusClient, Room } from 'colyseus.js';
import { Lobby, type LobbyProps, type GameMode } from '../components/Lobby';
import { WalletConnectControl } from '../components/WalletConnectControl';
import { useIdleGame } from '../hooks/useIdleGame';
// Tabs are rendered globally in RootLayout
import { GAME_CONFIG } from '../lib/constants';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';

import { useGameState } from '../hooks/useGameState';
import { useSession } from '../components/providers/SessionProvider';
import { useRoomManagement } from '../hooks/useRoomManagement';
import {
  getDefaultCharacter,
  setCharacterSpriteOverride,
} from '../lib/character-registry';

import {
  getDifficultyTier,
  isTierEligible,
  normalizeTierId,
} from '../data/difficulty-tiers';
import { usePlayer } from '../components/providers/PlayerProvider';
import { useDailyRuns } from '../hooks/useDailyRuns';
import type {
  ProgressionLevelLostMessage,
  ProgressionProfileMessage,
  ProgressionXpAwardMessage,
} from '../types/progression';
import type {
  KillStreakProfileMessage,
  KillStreakUpdatedMessage,
  KillStreakResetMessage,
} from '../types/kill-streak';
import {
  applyXp as applyXpToProgression,
  cloneProfile as cloneProgressionProfile,
  createDefaultProfile,
  type ProgressionProfile,
} from '../lib/progression';
import { getServerUrlForRegion } from '../lib/server-regions';
import {
  getDevModeConfig,
  devModeToRoomOptions,
  isDevEnvironment,
} from '../lib/dev-mode';
import {
  handlePWAAction as handlePWAActionUtil,
  isIOSSafari,
} from '../lib/pwa-utils';
import { getAppServerBaseUrl } from '../lib/server-url';
import { fetchDedupe } from '../lib/fetch-dedupe';
import type {
  AudioSettings,
  PlayerPreferencesSnapshot,
} from '../types/preferences';
import type { DailyRunsExhaustedPayload } from '../types/daily-runs';
import { clearGotchiSpritesCache } from '../hooks/useGotchiSprites';
import {
  normalizeTradeLeverage,
  TRADE_LEVERAGE_MAX,
  TRADE_LEVERAGE_MIN,
  normalizeTradeDirection,
  normalizeTradeToken,
  type TradeDirection,
  type TradeToken,
} from '../lib/trade-config';
import { dispatchOpenRunsRefresh } from '../lib/daily-quest-trade';
import { Button } from '../components/ui/Button';
import {
  isOwnershipRequiredCode,
  isSnapshotOutageCode,
} from '../lib/session-errors';
import { getRunEligibilityCtaState } from '../lib/run-access';

const DEV_MODE = process.env.NODE_ENV !== 'production';

// LocalStorage keys for lobby preferences
const STORAGE_KEY_LEVERAGE = 'dd-lobby-leverage';
const STORAGE_KEY_TRADE_LEVERAGE = 'dd-lobby-trade-leverage';
const STORAGE_KEY_TRADE_TOKEN = 'dd-lobby-trade-token';
const STORAGE_KEY_TRADE_DIRECTION = 'dd-lobby-trade-direction';
const STORAGE_KEY_AUTO_ASCEND_FLOOR = 'dd-lobby-auto-ascend-floor';
const STORAGE_KEY_SPEED_RUN_MULTIPLIER = 'dd-lobby-speed-run-multiplier';
const PRACTICE_RUN_LEVERAGE_MAX = 40;

function getRunLeverageMax(mode: GameMode): number {
  return mode === 'competitive' ? TRADE_LEVERAGE_MAX : PRACTICE_RUN_LEVERAGE_MAX;
}

function normalizeRunLeverage(
  value: unknown,
  fallback: number = TRADE_LEVERAGE_MIN,
  max: number = PRACTICE_RUN_LEVERAGE_MAX
): number {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : fallback;
  const rounded = Math.round(safe);
  return Math.max(TRADE_LEVERAGE_MIN, Math.min(max, rounded));
}

interface JoinTarget {
  roomId: string;
  colyseusRoomId?: string;
  regionId?: string;
  regionName: string;
  playerCount: number;
  maxPlayers: number;
  difficultyTier?: string | null;
  hostSessionId?: string;
  isFull?: boolean;
}

// Helper functions for localStorage persistence
function loadLeveragePreference(): number {
  if (typeof window === 'undefined') {
    return TRADE_LEVERAGE_MIN;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY_LEVERAGE);
    if (stored) {
      return normalizeRunLeverage(Number.parseFloat(stored));
    }
  } catch (error) {
    console.warn('Failed to load leverage preference from localStorage', error);
  }
  return TRADE_LEVERAGE_MIN;
}

function saveLeveragePreference(value: number): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY_LEVERAGE, String(value));
  } catch (error) {
    console.warn('Failed to save leverage preference to localStorage', error);
  }
}

function loadTradeLeveragePreference(): number {
  if (typeof window === 'undefined') {
    return TRADE_LEVERAGE_MIN;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY_TRADE_LEVERAGE);
    if (stored) {
      return Math.round(normalizeTradeLeverage(Number.parseFloat(stored)));
    }
  } catch (error) {
    console.warn(
      'Failed to load trade leverage preference from localStorage',
      error
    );
  }
  return TRADE_LEVERAGE_MIN;
}

function saveTradeLeveragePreference(value: number): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY_TRADE_LEVERAGE, String(value));
  } catch (error) {
    console.warn(
      'Failed to save trade leverage preference to localStorage',
      error
    );
  }
}

function loadTradeTokenPreference(): TradeToken {
  if (typeof window === 'undefined') {
    return 'BTC';
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY_TRADE_TOKEN);
    return normalizeTradeToken(stored, 'BTC');
  } catch (error) {
    console.warn('Failed to load trade token preference from localStorage', error);
  }
  return 'BTC';
}

function saveTradeTokenPreference(value: TradeToken): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY_TRADE_TOKEN, value);
  } catch (error) {
    console.warn('Failed to save trade token preference to localStorage', error);
  }
}

function loadTradeDirectionPreference(): TradeDirection {
  if (typeof window === 'undefined') {
    return 'long';
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY_TRADE_DIRECTION);
    return normalizeTradeDirection(stored, 'long');
  } catch (error) {
    console.warn(
      'Failed to load trade direction preference from localStorage',
      error
    );
  }
  return 'long';
}

function saveTradeDirectionPreference(value: TradeDirection): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY_TRADE_DIRECTION, value);
  } catch (error) {
    console.warn(
      'Failed to save trade direction preference to localStorage',
      error
    );
  }
}

function loadAutoAscendFloorPreference(): number {
  if (typeof window === 'undefined') {
    return 5;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY_AUTO_ASCEND_FLOOR);
    if (stored) {
      const parsed = Number.parseInt(stored, 10);
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 20) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn(
      'Failed to load auto-ascend floor preference from localStorage',
      error
    );
  }
  return 5;
}

function saveAutoAscendFloorPreference(value: number): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY_AUTO_ASCEND_FLOOR, String(value));
  } catch (error) {
    console.warn(
      'Failed to save auto-ascend floor preference to localStorage',
      error
    );
  }
}

function loadSpeedRunMultiplierPreference(): number {
  if (typeof window === 'undefined') {
    return 1;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SPEED_RUN_MULTIPLIER);
      if (stored) {
        const parsed = Number.parseInt(stored, 10);
        if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 50) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn(
      'Failed to load speed run multiplier preference from localStorage',
      error
    );
  }
  return 1;
}

function saveSpeedRunMultiplierPreference(value: number): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY_SPEED_RUN_MULTIPLIER, String(value));
  } catch (error) {
    console.warn(
      'Failed to save speed run multiplier preference to localStorage',
      error
    );
  }
}

function formatWalletLabel(address: string | null | undefined) {
  if (!address) {
    return null;
  }
  const trimmed = address.trim();
  if (trimmed.length <= 10) {
    return trimmed;
  }
  const normalized = trimmed.toLowerCase();
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function parseDailyRunsError(
  error: unknown
): DailyRunsExhaustedPayload | null {
  if (!error) return null;

  const extract = (value: any): DailyRunsExhaustedPayload | null => {
    if (!value || value.code !== 'DAILY_RUNS_EXHAUSTED') {
      return null;
    }

    const usdcStaked = Number(value.usdcStaked) || 0;
    const ghoStaked = Number(value.ghoStaked) || 0;
    const totalStakedRaw = Number(value.totalStaked);
    const totalStaked = Number.isFinite(totalStakedRaw)
      ? totalStakedRaw
      : usdcStaked + ghoStaked;

    return {
      code: 'DAILY_RUNS_EXHAUSTED',
      resetAtUtc: String(value.resetAtUtc ?? ''),
      allowedRuns: Number(value.allowedRuns) || 0,
      usedRuns: Number(value.usedRuns) || 0,
      usdcStaked,
      ghoStaked,
      totalStaked,
    };
  };

  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message);
      const extracted = extract(parsed);
      if (extracted) return extracted;
    } catch {
      // ignore
    }
  }

  return extract(error as any);
}

export default function HomePage() {
  const {
    gameStarted,
    setGameStarted,
    isStarting,
    setIsStarting,
    placeholderName,
    playerName,
    setPlayerName,
    error,
    setError,
  } = useGameState();

  const {
    isWalletConnected,
    walletAddress,
    isConnecting: isWalletConnecting,
    connectWallet,
    error: sessionError,
    errorCode: sessionErrorCode,
    canPlayToday,
    playError,
    acquiredAfterSnapshot,
    playResetAt,
    hasActiveWallet,
    hasValidSession,

    isSessionVerified,
    isSessionSynced,
    playerId,
    lastKnownWalletAddress,
    ensName,
  } = useSession();

  const devModeConfig = useMemo(() => getDevModeConfig(), []);
  const devModeEnabled = devModeConfig.enabled;
  const hasEffectiveWallet = Boolean(hasActiveWallet || devModeEnabled);
  const canLoadPlayerData = Boolean(hasValidSession && hasEffectiveWallet);
  const scopedPlayerId = canLoadPlayerData ? playerId : null;

  const welcomeWalletLabel = useMemo(() => {
    return formatWalletLabel(lastKnownWalletAddress || walletAddress);
  }, [lastKnownWalletAddress, walletAddress]);

  // Prefer ENS name from session (if available) for playerName
  useEffect(() => {
    if (ensName && ensName !== playerName) {
      setPlayerName(ensName);
    }
  }, [ensName, playerName, setPlayerName]);

  const {
    currentRoomId,
    setCurrentRoomId,
    hostSessionId,
    setHostSessionId,
    playerCount,
    setPlayerCount,
    roomPhase,
    setRoomPhase,
    countdownEndsAt,
    setCountdownEndsAt,
    autoCloseAt,
    setAutoCloseAt,
    runStartedAt,
    setRunStartedAt,
  } = useRoomManagement();

  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const hasSentDevActionRef = useRef(false);
  const hasAppliedDevModeTypeRef = useRef(false);
  const hasAutoStartedRef = useRef(false);

  // Get idle game state for idle mode
  const idleGameState = useIdleGame(activeRoom);
  const lastKnownIdleStateRef = useRef<any>(null);

  useEffect(() => {
    if (idleGameState.idleRoom) {
      lastKnownIdleStateRef.current = idleGameState;
    }
  }, [idleGameState]);

  const {
    progressionProfile,
    progressionLevelProgress,
    applyServerProfile,
    applyServerXpAward,
    applyServerLevelLoss,
    updateProgressionProfile,
    saveProgressionProfile,
    resetProgressionProfile,
    deallocateAllStats,
    unlockedCharacters,
    lickTongueCount,
    stakedUsdcBalance,
    refreshProgression,
    preferenceDefaults,
    effectivePreferences,
    arePreferencesHydrated,
    unlockCharacter,
    updatePlayerPreferences,
    killStreakState,
    applyKillStreakProfile,
    applyKillStreakUpdate,
    applyKillStreakReset,
    equipment,
    inventory,
    gotchiSprites,
  } = usePlayer();

  const { state: equipmentState } = equipment;
  const {
    inventoryItems,
    refreshInventory,
  } = inventory;


  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const devAction = useMemo(() => {
    const action = searchParams.get('devAction');
    if (action === 'force-victory-chest' || action === 'force-death') {
      return action;
    }
    return 'none';
  }, [searchParams]);

  const devModeType = useMemo(() => {
    const mode = searchParams.get('devModeType');
    if (mode === 'competitive' || mode === 'practice') return mode;
    return null;
  }, [searchParams]);

  const devAutoStart = useMemo(() => {
    return searchParams.get('devAutoStart') === 'true';
  }, [searchParams]);

  // Mode selection state
  const [selectedMode, setSelectedMode] = useState<
    'competitive' | null
  >(null);
  const [speedRunMultiplier, setSpeedRunMultiplier] = useState<number>(() =>
    loadSpeedRunMultiplierPreference()
  );

  // Rank tab state

  const [hasVictory, setHasVictory] = useState(false);
  const [runEndedAt, setRunEndedAt] = useState<number | null>(null);
  const [usdcTotal, setUsdcTotal] = useState<number | null>(null);
  const [isEconomyLoading, setIsEconomyLoading] = useState<boolean>(false);
  const [economyError, setEconomyError] = useState<string | null>(null);

  const handleAdjustStats = useCallback(() => {
    router.push('/me/allocate-stats');
  }, [router]);

  const handleNavigateToTopUp = useCallback(() => {
    router.push('/me/topup');
  }, [router]);


  useEffect(() => {
    if (!gameStarted) {
      setHasVictory(false);
      setRunEndedAt(null);
    }
  }, [gameStarted]);

  const previousRunStartedAtRef = useRef<number>(0);
  const runEndedNormallyRef = useRef<boolean>(false);
  useEffect(() => {
    if (roomPhase === 'in_game' && runStartedAt > 0) {
      if (runStartedAt !== previousRunStartedAtRef.current) {
        previousRunStartedAtRef.current = runStartedAt;
        setRunEndedAt(null);
        runEndedNormallyRef.current = false;
      }
    } else {
      previousRunStartedAtRef.current = 0;
      if (roomPhase !== 'ended') {
        runEndedNormallyRef.current = false;
      }
    }
  }, [roomPhase, runStartedAt]);

  // Freeze run duration when victory is achieved (e.g., boss defeated/treasure room)
  useEffect(() => {
    if (hasVictory && runEndedAt == null && runStartedAt > 0) {
      setRunEndedAt(Date.now());
    }
  }, [hasVictory, runEndedAt, runStartedAt]);

  useEffect(() => {
    if (roomPhase === 'ended') {
      // Track run completion when the room ends
      if (gameStarted && runStartedAt > 0) {
        runEndedNormallyRef.current = true;
      }
    }
  }, [roomPhase, gameStarted, runStartedAt]);

  // Show run summary when idle run ends (for idle mode)
  const idleRunStatus = idleGameState.idleRoom?.runStatus;
  const idlePlayerHp = idleGameState.playerHp;
  useEffect(() => {
    if (
      gameStarted &&
      activeRoom &&
      idleGameState.idleRoom &&
      (idleRunStatus === 'dead' ||
        idleRunStatus === 'victory' ||
        idlePlayerHp <= 0)
    ) {
      runEndedNormallyRef.current = true;
      // Do NOT show the generic RunSummary for idle mode
      // IdleDungeonScreen handles its own summary view
    }
  }, [
    gameStarted,
    activeRoom,
    idleRunStatus,
    idlePlayerHp,
    idleGameState.idleRoom,
  ]);

  useEffect(() => {
    if (!devModeEnabled) return;
    if (!devModeType) return;
    if (hasAppliedDevModeTypeRef.current) return;
    if (devModeType === 'competitive') {
      setSelectedMode('competitive');
    } else {
      setSelectedMode(null);
    }
    hasAppliedDevModeTypeRef.current = true;
  }, [devModeEnabled, devModeType]);

  useEffect(() => {
    if (!activeRoom) return;
    if (devAction === 'none') return;
    if (!devModeEnabled) return;
    if (hasSentDevActionRef.current) return;

    const message =
      devAction === 'force-victory-chest'
        ? 'debug_idle_force_victory_chest'
        : 'debug_idle_force_death';

    try {
      activeRoom.send(message);
      hasSentDevActionRef.current = true;
      console.log(`[DevMode] Sent ${message}`);
    } catch (error) {
      console.warn(`[DevMode] Failed to send ${message}`, error);
    }
  }, [activeRoom, devAction, devModeEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!devModeEnabled) return;

    const w = window as Window & {
      __idleRoom?: Room;
      __room?: Room;
      idleRoom?: Room;
    };

    if (activeRoom) {
      w.__idleRoom = activeRoom;
      w.__room = activeRoom;
      w.idleRoom = activeRoom;
    }

    return () => {
      if (w.__idleRoom === activeRoom) delete w.__idleRoom;
      if (w.__room === activeRoom) delete w.__room;
      if (w.idleRoom === activeRoom) delete w.idleRoom;
    };
  }, [activeRoom, devModeEnabled]);

  // Global keyboard shortcuts
  useEffect(() => {
    const isEditableTarget = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select')
        return true;
      const contentEditable = (node as HTMLElement).isContentEditable;
      return !!contentEditable;
    };

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      // Ignore if typing in editable elements
      if (isEditableTarget(event.target)) {
        return;
      }

      // F11 for PWA install (on mobile Safari, otherwise does nothing special)
      if (event.key === 'F11') {
        event.preventDefault(); // Prevent browser's default F11 behavior
        if (isIOSSafari()) {
          handlePWAActionUtil().catch((error) => {
            console.error('Failed to handle PWA action:', error);
          });
        }
      }

      if (
        DEV_MODE &&
        event.key.toLowerCase() === 'r' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !event.altKey
      ) {
        if (gameStarted && roomPhase === 'in_game' && runStartedAt > 0) {
          event.preventDefault();
          event.stopPropagation();
        }
      }

    };

    document.addEventListener('keydown', handleGlobalKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, []);

  // Mobile detection and control state
  const [isMobile, setIsMobile] = useState(false);
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);
  const [dailyQuestThresholdScore, setDailyQuestThresholdScore] = useState<
    number | null
  >(null);

  // Character selection state with proper hydration handling
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    null
  );
  // US-only region (multi-region removed - idle mode is latency tolerant)
  const selectedRegionId = 'us-ashburn';

  // Difficulty tier selection state
  const [selectedDifficultyTier, setSelectedDifficultyTier] = useState<
    string | null
  >(null);
  const [leverage, setLeverage] = useState<number>(() =>
    loadLeveragePreference()
  );
  const [tradeLeverage, setTradeLeverage] = useState<number>(() =>
    loadTradeLeveragePreference()
  );
  const [tradeToken, setTradeToken] = useState<TradeToken>(() =>
    loadTradeTokenPreference()
  );
  const [tradeDirection, setTradeDirection] = useState<TradeDirection>(() =>
    loadTradeDirectionPreference()
  );
  const [autoAscendFloor, setAutoAscendFloor] = useState<number>(() =>
    loadAutoAscendFloorPreference()
  );
  const runLeverageMax = getRunLeverageMax(selectedMode);

  // Validated setters for leverage and auto-ascend floor
  const handleLeverageChange = useCallback((value: number) => {
    const validated = normalizeRunLeverage(
      value,
      TRADE_LEVERAGE_MIN,
      runLeverageMax
    );
    setLeverage(validated);
  }, [runLeverageMax]);

  const handleTradeLeverageChange = useCallback((value: number) => {
    const validated = Math.round(
      normalizeTradeLeverage(value, TRADE_LEVERAGE_MIN)
    );
    setTradeLeverage(validated);
  }, []);

  const handleTradeTokenChange = useCallback((value: TradeToken) => {
    setTradeToken(normalizeTradeToken(value, 'BTC'));
  }, []);

  const handleTradeDirectionChange = useCallback((value: TradeDirection) => {
    setTradeDirection(normalizeTradeDirection(value, 'long'));
  }, []);

  const handleAutoAscendFloorChange = useCallback((value: number) => {
    const validated = Math.max(1, Math.min(20, Math.floor(Number(value) || 5)));
    setAutoAscendFloor(validated);
  }, []);

  const handleSpeedRunMultiplierChange = useCallback((value: number) => {
    const validated = Math.max(1, Math.min(50, Math.floor(Number(value) || 1)));
    setSpeedRunMultiplier(validated);
  }, []);

  // Mode selection handlers
  const handleModeChange = useCallback((mode: GameMode) => {
    if (mode === null && selectedMode === 'competitive') {
      setLeverage(
        normalizeRunLeverage(
          leverage + tradeLeverage,
          TRADE_LEVERAGE_MIN,
          PRACTICE_RUN_LEVERAGE_MAX
        )
      );
    }
    setSelectedMode(mode);
  }, [leverage, selectedMode, tradeLeverage]);
  const dailyQuestActive = selectedMode === 'competitive';

  useEffect(() => {
    setLeverage((current) => {
      const normalized = normalizeRunLeverage(
        current,
        TRADE_LEVERAGE_MIN,
        runLeverageMax
      );
      return normalized === current ? current : normalized;
    });
  }, [runLeverageMax]);

  // Memoized callback for daily quest preview syncing
  const handleDailyQuestAttune = useCallback(
    (thresholdScore: number | null) => {
      if (thresholdScore === null) {
        setDailyQuestThresholdScore(null);
        return;
      }

      // Only update the threshold score for syncing
      setDailyQuestThresholdScore((prev) => {
        if (prev !== thresholdScore) {
          console.log(
            '[HomePage] Daily Quest Sync! thresholdScore:',
            thresholdScore
          );
        }
        return thresholdScore;
      });

    },
    []
  );

  // Persist leverage preference to localStorage
  useEffect(() => {
    saveLeveragePreference(leverage);
  }, [leverage]);

  useEffect(() => {
    saveTradeLeveragePreference(tradeLeverage);
  }, [tradeLeverage]);

  useEffect(() => {
    saveTradeTokenPreference(tradeToken);
  }, [tradeToken]);

  useEffect(() => {
    saveTradeDirectionPreference(tradeDirection);
  }, [tradeDirection]);

  // Persist auto-ascend floor preference to localStorage
  useEffect(() => {
    saveAutoAscendFloorPreference(autoAscendFloor);
  }, [autoAscendFloor]);

  useEffect(() => {
    saveSpeedRunMultiplierPreference(speedRunMultiplier);
  }, [speedRunMultiplier]);

  const [joinTarget, setJoinTarget] = useState<JoinTarget | null>(null);
  const [isJoinMetadataLoading, setIsJoinMetadataLoading] = useState(false);
  const previousDifficultyRef = useRef<string | null>(null);
  const roomIdFromQuery = searchParams.get('roomId');

  const isCharacterHydrated = canLoadPlayerData && arePreferencesHydrated;

  const fallbackCharacterId =
    preferenceDefaults.selectedCharacterId ?? getDefaultCharacter().id;
  const fallbackDifficultyTier =
    preferenceDefaults.selectedDifficultyTier ?? 'normal';

  const fallbackUnlockedCharacterId = useMemo(() => {
    return unlockedCharacters.length > 0 ? unlockedCharacters[0] : null;
  }, [unlockedCharacters]);

  const unlockedCharacterSet = useMemo(
    () => new Set(unlockedCharacters),
    [unlockedCharacters]
  );

  const resolvedCharacterId = useMemo(() => {
    const candidate =
      selectedCharacterId ??
      effectivePreferences.selectedCharacterId ??
      fallbackCharacterId;
    if (candidate) {
      if (candidate.startsWith('gotchi:')) {
        return candidate;
      }
      if (unlockedCharacterSet.has(candidate) || devModeEnabled) {
        return candidate;
      }
    }
    return fallbackUnlockedCharacterId;
  }, [
    selectedCharacterId,
    effectivePreferences.selectedCharacterId,
    fallbackCharacterId,
    fallbackUnlockedCharacterId,
    devModeEnabled,
    unlockedCharacterSet,
  ]);
  const resolvedDifficultyTier =
    joinTarget?.difficultyTier ??
    selectedDifficultyTier ??
    effectivePreferences.selectedDifficultyTier ??
    fallbackDifficultyTier;
  const normalizedDifficultyTier = normalizeTierId(resolvedDifficultyTier);
  const isDifficultyAccessible = isTierEligible(
    normalizedDifficultyTier,
    stakedUsdcBalance
  );
  const effectiveDifficultyTier = joinTarget
    ? normalizedDifficultyTier
    : isDifficultyAccessible
      ? normalizedDifficultyTier
      : 'normal';

  useEffect(() => {
    if (joinTarget) return;
    if (isDifficultyAccessible) return;
    if (normalizedDifficultyTier === 'normal') return;
    setSelectedDifficultyTier('normal');
    if (canLoadPlayerData) {
      void updatePlayerPreferences({ selectedDifficultyTier: 'normal' });
    }
  }, [
    canLoadPlayerData,
    isDifficultyAccessible,
    joinTarget,
    normalizedDifficultyTier,
    updatePlayerPreferences,
  ]);

  // Fetch join-room metadata when a roomId query param is present
  useEffect(() => {
    if (!roomIdFromQuery) {
      setJoinTarget(null);
      setIsJoinMetadataLoading(false);
      return;
    }

    let cancelled = false;
    setIsJoinMetadataLoading(true);

    const fetchMetadata = async () => {
      try {
        // US-only server
        const serverUrl = getServerUrlForRegion();
        const res = await fetch(`${serverUrl}/api/rooms/${roomIdFromQuery}`);

        if (!res.ok) {
          if (!cancelled) {
            setError('This room is no longer available.');
            setJoinTarget(null);
            setIsJoinMetadataLoading(false);
          }
          return;
        }

        const data = (await res.json()) as any;
        if (cancelled) return;

        const metadata = data.metadata ?? {};
        const metadataRoomId =
          typeof metadata.roomId === 'string'
            ? metadata.roomId
            : roomIdFromQuery;

        const metadataPlayerCount = Array.isArray(metadata.playerCount)
          ? metadata.playerCount.length
          : typeof metadata.playerCount === 'number'
            ? metadata.playerCount
            : 0;

        const playerCountValue =
          typeof data.clients === 'number'
            ? data.clients
            : Array.isArray(data.clients)
              ? data.clients.length
              : metadataPlayerCount;

        const maxPlayersValue = Number(
          typeof data.maxClients === 'number'
            ? data.maxClients
            : typeof metadata.maxPlayers === 'number'
              ? metadata.maxPlayers
              : GAME_CONFIG.MAX_PLAYERS
        );

        const target: JoinTarget = {
          roomId: metadataRoomId,
          colyseusRoomId:
            typeof data.roomId === 'string'
              ? data.roomId
              : metadata.colyseusRoomId,
          regionId: 'us-ashburn',
          regionName: 'United States',
          playerCount: playerCountValue,
          maxPlayers: maxPlayersValue,
          difficultyTier:
            typeof metadata.difficultyTier === 'string'
              ? metadata.difficultyTier
              : undefined,
          hostSessionId:
            typeof metadata.hostSessionId === 'string'
              ? metadata.hostSessionId
              : undefined,
          isFull: Boolean(data.isFull),
        };

        if (!target.colyseusRoomId) {
          setError('Unable to connect to this room at the moment.');
          setJoinTarget(null);
          setIsJoinMetadataLoading(false);
          return;
        }

        if (target.isFull) {
          setError('This room is currently full. Returning to the lobby.');
          setJoinTarget(null);
          setIsJoinMetadataLoading(false);
          router.replace(pathname);
          return;
        }

        setJoinTarget(target);
        setError(null);
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load room metadata', error);
          setError('Failed to load room details.');
          setJoinTarget(null);
        }
      } finally {
        if (!cancelled) {
          setIsJoinMetadataLoading(false);
        }
      }
    };

    fetchMetadata();

    return () => {
      cancelled = true;
    };
  }, [roomIdFromQuery, setError, router, pathname]);

  useEffect(() => {
    if (joinTarget?.difficultyTier) {
      if (previousDifficultyRef.current === null) {
        previousDifficultyRef.current =
          selectedDifficultyTier ?? fallbackDifficultyTier;
      }
      if (selectedDifficultyTier !== joinTarget.difficultyTier) {
        setSelectedDifficultyTier(joinTarget.difficultyTier);
      }
    } else if (previousDifficultyRef.current !== null) {
      if (selectedDifficultyTier !== previousDifficultyRef.current) {
        setSelectedDifficultyTier(previousDifficultyRef.current);
      }
      previousDifficultyRef.current = null;
    }
  }, [joinTarget, selectedDifficultyTier, fallbackDifficultyTier]);

  useEffect(() => {
    if (!canLoadPlayerData) {
      setSelectedCharacterId(fallbackCharacterId);
      return;
    }
    if (!arePreferencesHydrated) {
      return;
    }

    // Always sync from server when preferences are hydrated
    // The server is the source of truth for persisted character selection
    const nextCandidate =
      effectivePreferences.selectedCharacterId ?? fallbackCharacterId;
    if (
      nextCandidate &&
      (nextCandidate.startsWith('gotchi:') ||
        unlockedCharacterSet.has(nextCandidate) ||
        devModeEnabled)
    ) {
      setSelectedCharacterId(nextCandidate);
    } else {
      setSelectedCharacterId(fallbackUnlockedCharacterId ?? null);
    }
  }, [
    canLoadPlayerData,
    arePreferencesHydrated,
    effectivePreferences.selectedCharacterId,
    fallbackCharacterId,
    fallbackUnlockedCharacterId,
    selectedCharacterId,
    unlockedCharacterSet,
    devModeEnabled,
  ]);

  useEffect(() => {
    if (!canLoadPlayerData) {
      setSelectedDifficultyTier(fallbackDifficultyTier);
      return;
    }
    if (!arePreferencesHydrated) {
      return;
    }
    const nextDifficultyTier =
      effectivePreferences.selectedDifficultyTier ?? fallbackDifficultyTier;
    setSelectedDifficultyTier(nextDifficultyTier);
  }, [
    canLoadPlayerData,
    arePreferencesHydrated,
    effectivePreferences.selectedDifficultyTier,
    fallbackDifficultyTier,
  ]);

  // Load player's economy summary (USDC total) when in lobby
  useEffect(() => {
    if (!canLoadPlayerData || gameStarted) {
      return;
    }
    let cancelled = false;
    const loadEconomy = async () => {
      setIsEconomyLoading(true);
      setEconomyError(null);
      try {
        const baseUrl = getAppServerBaseUrl();
        const endpoint = baseUrl
          ? `${baseUrl}/api/player/economy?limit=200`
          : '/api/player/economy?limit=200';
        const res = await fetch(endpoint, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error(String(res.status));
        }
        const payload = (await res.json()) as {
          summary?: Record<string, number>;
        } | null;
        const total = Number(payload?.summary?.USDC) || 0;
        if (!cancelled) {
          setUsdcTotal(Math.max(0, total));
        }
      } catch {
        if (!cancelled) {
          setEconomyError('Failed to load earnings');
          setUsdcTotal(0);
        }
      } finally {
        if (!cancelled) {
          setIsEconomyLoading(false);
        }
      }
    };
    void loadEconomy();
    return () => {
      cancelled = true;
    };
  }, [canLoadPlayerData, gameStarted]);

  useEffect(() => {
    if (!canLoadPlayerData) {
      setPlayerAvatarIdState(null);
      return;
    }
    if (!arePreferencesHydrated) {
      return;
    }
    setPlayerAvatarIdState(effectivePreferences.avatarId ?? null);
  }, [
    canLoadPlayerData,
    arePreferencesHydrated,
    effectivePreferences.avatarId,
  ]);

  const activeDifficultyId = effectiveDifficultyTier;
  const activeDifficulty = useMemo(
    () => getDifficultyTier(activeDifficultyId),
    [activeDifficultyId]
  );

  const {
    data: dailyRuns,
    isLoading: isDailyRunsLoading,
    error: dailyRunsError,
    refresh: refreshDailyRuns,
  } = useDailyRuns(scopedPlayerId);
  const [dailyRunsExhausted, setDailyRunsExhausted] =
    useState<DailyRunsExhaustedPayload | null>(null);

  useEffect(() => {
    if (dailyRuns?.remainingRuns && dailyRuns.remainingRuns > 0) {
      setDailyRunsExhausted(null);
    }
  }, [dailyRuns?.remainingRuns]);

  useEffect(() => {
    if (selectedMode !== null) {
      setDailyRunsExhausted(null);
    }
  }, [selectedMode]);

  const shouldSkipDailyRuns = Boolean(
    devModeEnabled && devModeConfig.skipEntryFee
  );
  const shouldEnforceDailyRuns = !shouldSkipDailyRuns && selectedMode === null;
  const dailyRunsRemaining = dailyRuns?.remainingRuns ?? null;
  const hasDailyRunsRemaining =
    dailyRunsRemaining == null ? true : dailyRunsRemaining > 0;

  const ctaDisabledReason = useMemo(() => {
    const playEligibilityCta = getRunEligibilityCtaState(
      canPlayToday,
      playError,
      {
        acquiredAfterSnapshot,
        resetAtUtc: playResetAt,
      }
    );
    if (isJoinMetadataLoading) return 'Loading room details...';
    if (joinTarget?.isFull) return 'Room is currently full.';
    if (!devModeEnabled && !isSessionVerified)
      return 'Checking authentication...';
    if (!devModeEnabled && !hasActiveWallet)
      return 'Connect your wallet to continue.';
    if (!devModeEnabled && !hasValidSession)
      return sessionError || 'Please sign the login message to continue.';
    if (playEligibilityCta.ctaDisabledReason) {
      return playEligibilityCta.ctaDisabledReason;
    }
    if (shouldEnforceDailyRuns && dailyRuns && !hasDailyRunsRemaining) {
      return 'Daily runs exhausted';
    }
    const hasSelectableHero = devModeEnabled
      ? true
      : resolvedCharacterId &&
        (resolvedCharacterId.startsWith('gotchi:') ||
          unlockedCharacterSet.has(resolvedCharacterId));
    if (!hasSelectableHero) return 'Unlock a hero to continue.';
    if (!isTierEligible(effectiveDifficultyTier, stakedUsdcBalance)) {
      const tier = getDifficultyTier(effectiveDifficultyTier);
      return `Insufficient USDC/GHO staked for ${tier?.name ?? 'selected'} difficulty.`;
    }
    return null;
  }, [
    isJoinMetadataLoading,
    joinTarget,
    isSessionVerified,
    devModeEnabled,
    hasActiveWallet,
    hasValidSession,
    sessionError,
    canPlayToday,
    playError,
    acquiredAfterSnapshot,
    playResetAt,
    dailyRuns,
    hasDailyRunsRemaining,
    shouldEnforceDailyRuns,
    resolvedCharacterId,
    unlockedCharacterSet,
    effectiveDifficultyTier,
    stakedUsdcBalance,
  ]);

  const ctaDisabled = isJoinMetadataLoading || Boolean(ctaDisabledReason);
  const {
    ctaLabel: playEligibilityCtaLabel,
    ctaDisabledReasonLinkHref,
    ctaDisabledReasonLinkLabel,
  } = getRunEligibilityCtaState(canPlayToday, playError, {
    acquiredAfterSnapshot,
    resetAtUtc: playResetAt,
  });
  const ctaLabel =
    playEligibilityCtaLabel || (joinTarget ? 'Join Room' : 'Play Now');

  const joinInfo = useMemo(
    () =>
      joinTarget
        ? {
            roomId: joinTarget.roomId,
            regionName: joinTarget.regionName,
            playerCount: joinTarget.playerCount,
            maxPlayers: joinTarget.maxPlayers,
          }
        : null,
    [joinTarget]
  );

  // After hydration, if a dynamic gotchi is selected, apply the stored sprite override
  useEffect(() => {
    if (!isCharacterHydrated) return;
    if (!resolvedCharacterId || !resolvedCharacterId.startsWith('gotchi:'))
      return;

    const selectedId: string = resolvedCharacterId;
    const storedUrl = effectivePreferences.gotchiSpriteUrl;
    if (storedUrl) {
      setCharacterSpriteOverride(selectedId, {
        imagePath: storedUrl,
        frameWidth: 100,
        frameHeight: 100,
      });
      return;
    }

    const gotchiId = selectedId.split(':')[1];
    if (!gotchiId) return;

    const meta = gotchiSprites.entries.find(
      (m) => String(m.id) === String(gotchiId)
    );
    if (!meta || !meta.url) return;

    setCharacterSpriteOverride(selectedId, {
      imagePath: meta.url,
      frameWidth: 100,
      frameHeight: 100,
    });
    void updatePlayerPreferences({ gotchiSpriteUrl: meta.url });
  }, [
    effectivePreferences.gotchiSpriteUrl,
    isCharacterHydrated,
    resolvedCharacterId,
    updatePlayerPreferences,
    gotchiSprites.entries,
  ]);

  // Store player avatar ID for consistency across room transitions
  const [playerAvatarId, setPlayerAvatarIdState] = useState<string | null>(
    null
  );

  const persistPlayerAvatarId = useCallback(
    (nextValue: SetStateAction<string | null>) => {
      setPlayerAvatarIdState((current) => {
        const resolved =
          typeof nextValue === 'function'
            ? (nextValue as (prev: string | null) => string | null)(current)
            : nextValue;

        if (current === resolved) {
          return current;
        }

        if (canLoadPlayerData) {
          void updatePlayerPreferences({ avatarId: resolved ?? null });
        }
        return resolved ?? null;
      });
    },
    [canLoadPlayerData, updatePlayerPreferences]
  );

  // Use ref to access current avatar ID during room transitions
  const playerAvatarIdRef = useRef<string | null>(playerAvatarId);

  // Update ref when state changes
  useEffect(() => {
    playerAvatarIdRef.current = playerAvatarId;
  }, [playerAvatarId]);

  const handleCharacterSelect = useCallback(
    async (
      characterId: string,
      options?: {
        gotchiSpriteUrl?: string | null;
      }
    ) => {
      setSelectedCharacterId(characterId);

      // Clear gotchi sprites cache when selecting a gotchi character to ensure
      // fresh equipped wearables data is loaded
      if (characterId.startsWith('gotchi:')) {
        clearGotchiSpritesCache();
      }

      const payload: Partial<PlayerPreferencesSnapshot> = {
        selectedCharacterId: characterId,
      };
      if (options && 'gotchiSpriteUrl' in options) {
        payload.gotchiSpriteUrl = options.gotchiSpriteUrl ?? null;
      }
      if (canLoadPlayerData) {
        const success = await updatePlayerPreferences(payload);
        if (!success) {
          console.error('Failed to update character selection on server');
          setError('Failed to save character selection. Please try again.');
        }
      }
    },
    [canLoadPlayerData, updatePlayerPreferences]
  );

  const handleUnlockCharacter = useCallback(
    async (characterId: string) => {
      try {
        const result = await unlockCharacter(characterId);
        setSelectedCharacterId(result.selectedCharacterId ?? characterId);
        await refreshProgression().catch(() => undefined);
      } catch (error) {
        throw error;
      }
    },
    [unlockCharacter, refreshProgression]
  );

  const handleDifficultySelect = useCallback(
    (tierId: string) => {
      const normalized = normalizeTierId(tierId);
      if (!isTierEligible(normalized, stakedUsdcBalance)) {
        const tier = getDifficultyTier(normalized);
        setError(
          `Insufficient USDC/GHO staked for ${tier?.name ?? normalized} difficulty.`
        );
        return;
      }
      setError(null);
      setSelectedDifficultyTier(normalized);
      if (canLoadPlayerData) {
        void updatePlayerPreferences({ selectedDifficultyTier: normalized });
      }
    },
    [canLoadPlayerData, setError, stakedUsdcBalance, updatePlayerPreferences]
  );

  const handleAudioSettingsChange = useCallback(
    (settings: AudioSettings) => {
      if (canLoadPlayerData) {
        void updatePlayerPreferences({ audioSettings: settings });
      }
    },
    [canLoadPlayerData, updatePlayerPreferences]
  );

  // Mobile detection
  useEffect(() => {
    const checkMobileAndOrientation = () => {
      const isMobileDevice = () => {
        return (
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            navigator.userAgent
          ) || window.innerWidth <= 768
        );
      };

      const mobile = isMobileDevice();
      const landscape =
        window.innerHeight <= 768 && window.innerWidth > window.innerHeight;

      setIsMobile(mobile);
      setIsMobileLandscape(mobile && landscape);
    };

    checkMobileAndOrientation();

    const handleResize = () => {
      checkMobileAndOrientation();
    };

    const handleOrientationChange = () => {
      // Small delay to ensure dimensions are updated
      setTimeout(checkMobileAndOrientation, 100);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

  const handleServerProfileMessage = useCallback(
    (message: ProgressionProfileMessage) => {
      if (message?.profile) {
        applyServerProfile(message);
      }
    },
    [applyServerProfile]
  );

  const handleServerXpAward = useCallback(
    (message: ProgressionXpAwardMessage) => {
      applyServerXpAward(message);
    },
    [applyServerXpAward]
  );

  const handleServerLevelLoss = useCallback(
    (message: ProgressionLevelLostMessage) => {
      applyServerLevelLoss(message);
    },
    [applyServerLevelLoss]
  );

  const handleKillStreakProfile = useCallback(
    (message: KillStreakProfileMessage) => {
      if (message) {
        applyKillStreakProfile(message);
      }
    },
    [applyKillStreakProfile]
  );

  const handleKillStreakUpdate = useCallback(
    (message: KillStreakUpdatedMessage) => {
      if (message) {
        applyKillStreakUpdate(message);
      }
    },
    [applyKillStreakUpdate]
  );

  const handleKillStreakReset = useCallback(
    (message: KillStreakResetMessage) => {
      applyKillStreakReset(message);
    },
    [applyKillStreakReset]
  );

  const {
    units: killStreakUnits,
    archetypeId: killStreakArchetypeId,
    isActive: killStreakActive,
  } = killStreakState;

  const handleProfileCommit = useCallback(
    (nextProfile: ProgressionProfile) => {
      void (async () => {
        const copy = cloneProgressionProfile(nextProfile);
        await saveProgressionProfile(copy);
      })();
    },
    [saveProgressionProfile]
  );

  const handleAddXp = useCallback(
    (amount: number) => {
      const result = applyXpToProgression(progressionProfile, amount);
      const nextProfile = cloneProgressionProfile(result.profile);
      updateProgressionProfile(() => nextProfile);
    },
    [progressionProfile, updateProgressionProfile]
  );

  const handleResetProgression = useCallback(() => {
    void (async () => {
      const saved = await resetProgressionProfile();
      const next = saved ?? createDefaultProfile();
      updateProgressionProfile(() => next);
    })();
  }, [
    resetProgressionProfile,
    updateProgressionProfile,
  ]);

  const handleStartGame = async () => {
    if (isStarting) return;
    if (ctaDisabled) {
      if (
        ctaDisabledReason &&
        ctaDisabledReason !== 'Loading room details...'
      ) {
        setError(ctaDisabledReason);
      }
      return;
    }

    setIsStarting(true);
    setError(null);
    setHasVictory(false);
    setDailyRunsExhausted(null);

    try {
      const serverUrl = getServerUrlForRegion();
      const client = new ColyseusClient(serverUrl);

      // Get dev mode configuration from URL params
      const devModeConfig = getDevModeConfig();
      const devModeOptions = devModeToRoomOptions(devModeConfig);

      if (devModeConfig.enabled) {
        console.log('[DevMode] Joining with dev mode options:', devModeOptions);
      }

      // Build join options based on selected mode
      const isCompetitiveMode = selectedMode === 'competitive';
      const selectedGotchiMatch =
        typeof resolvedCharacterId === 'string'
          ? /^gotchi:(\d{1,32})$/i.exec(resolvedCharacterId)
          : null;

      const options: any = {
        playerName: playerName || placeholderName,
        difficultyTier: effectiveDifficultyTier,
        region: selectedRegionId,
        leverage: leverage,
        tradeLeverage,
        tradeToken,
        tradeDirection,
        autoAscendFloor: autoAscendFloor,
        isMobile: true,
        // Competitive Mode: auto-enable competition runs
        dailyQuestActive: isCompetitiveMode,
        // Dev mode options (only applied if allowed by server)
        ...devModeOptions,
      };
      if (selectedGotchiMatch) {
        options.gotchiId = selectedGotchiMatch[1];
      } else if (resolvedCharacterId) {
        options.selectedCharacterId = resolvedCharacterId;
      }

      // Log what we're sending to verify the value
      console.log('[Client] Sending join options', {
        autoAscendFloor,
        autoAscendFloorType: typeof autoAscendFloor,
        autoAscendFloorIsFinite: Number.isFinite(autoAscendFloor),
        optionsAutoAscendFloor: options.autoAscendFloor,
        devModeOptions,
        fullOptions: options,
      });

      let room: Room;
      if (joinTarget?.roomId) {
        room = await client.joinById(joinTarget.roomId, options);
      } else {
        room = await client.create('game_room', options);
      }

      const shouldEnableSpeedRun = speedRunMultiplier > 1;
      room.send('idle_set_speed_run', {
        enabled: shouldEnableSpeedRun,
        multiplier: speedRunMultiplier,
      });

      console.log('Joined room:', room.id);
      setActiveRoom(room as unknown as Room);
      setGameStarted(true);

      // Sync Room Management State (Important to prevent re-fetch loops)
      setCurrentRoomId(room.id);
      setHostSessionId(room.state.hostSessionId || '');
      setPlayerCount(room.state.players.size);

      room.onStateChange((state) => {
        setPlayerCount(state.players.size);
        setRoomPhase(state.phase as any);
        setCountdownEndsAt(state.countdownEndsAt);
        setAutoCloseAt(state.autoCloseAt);
        setRunStartedAt(state.runStartedAt);

        // IMMEDIATE CHECK: Detect idle run end here to beat the race condition
        // The server sends the state update (victory) and then immediately disconnects.
        // We need to capture this BEFORE onLeave fires.
        try {
          const sessionId = room.sessionId;
          const player = state.players.get(sessionId);
          if (player && player.idleRoom) {
            const status = player.idleRoom.runStatus;
            const hp = player.hp;

            if (status === 'dead' || status === 'victory' || hp <= 0) {
              // Only capture if we haven't already
              if (!runEndedNormallyRef.current) {
                console.log('[onStateChange] Detected idle run end:', status);
                runEndedNormallyRef.current = true;
                // IdleDungeonScreen handles its own summary view
              }
            }
          }
        } catch (e) {
          console.error('[onStateChange] Error checking idle state:', e);
        }
      });

      room.onLeave((code) => {
        console.log('Left room with code:', code);

        // Check specifically for idle mode disconnects
        try {
          const sessionId = room.sessionId;
          // Try to get player from current state, fallback to ref
          const player =
            room.state.players.get(sessionId) ||
            (lastKnownIdleStateRef.current?.idleRoom
              ? {
                  idleRoom: lastKnownIdleStateRef.current.idleRoom,
                  hp: lastKnownIdleStateRef.current.playerHp,
                  score: lastKnownIdleStateRef.current.score,
                }
              : null);

          console.log('[onLeave] Checking idle player state:', {
            foundPlayer: !!player,
            runStatus: player?.idleRoom?.runStatus,
            hp: player?.hp,
          });

          if (player && player.idleRoom) {
            const status = player.idleRoom.runStatus;
            const hp = player.hp;

            if (status === 'dead' || status === 'victory' || hp <= 0) {
              console.log('Captured idle run end state in onLeave');

              // For idle mode, we DO NOT show the generic RunSummary.
              // We rely on IdleDungeonScreen's internal summary.
              // We just set the flag to prevent gameStarted from being set to false.
              runEndedNormallyRef.current = true;

              // DO NOT clear activeRoom here! We need IdleDungeonScreen to stay mounted.
              // It will use the stale room object (which is fine since we have the final state).
              // Cleanup will happen when user clicks "Back to Lobby" -> performDisconnect.
              return;
            }

            // Fallback: treat abrupt disconnect as a defeat summary
            player.idleRoom.runStatus = 'dead';
            player.hp = 0;
            player.idleRoom.lastKillingEnemyName = 'Disconnected';
            player.idleRoom.lastKillingEnemyHpRemaining = -1;
            player.idleRoom.lastKillingEnemyHpMax = -1;
            player.idleRoom.lastKillingEnemyDamage = -1;
            player.idleRoom.lastKillingPlayerHpRemaining = 0;
            runEndedNormallyRef.current = true;
            return;
          }
        } catch (e) {
          console.error('Error capturing idle state in onLeave:', e);
        }

        // Normal leave logic
        // If the run ended normally, delay setting gameStarted to false
        // The run summary will handle the disconnect when user clicks "Exit Match"
        if (!runEndedNormallyRef.current) {
          setGameStarted(false);
        }
        setActiveRoom(null);
        setCurrentRoomId('');
      });
    } catch (err) {
      console.error('Failed to start game:', err);
      const dailyRunsInfo = parseDailyRunsError(err);
      if (dailyRunsInfo) {
        setDailyRunsExhausted(dailyRunsInfo);
        setError(null);
        void refreshDailyRuns();
      } else {
        setError(err instanceof Error ? err.message : 'Failed to start game');
      }
    } finally {
      setIsStarting(false);
    }
  };

  useEffect(() => {
    if (!devModeEnabled) return;
    if (!devAutoStart) return;
    if (gameStarted || isStarting) return;
    if (ctaDisabled) return;
    if (hasAutoStartedRef.current) return;
    if (devModeType === 'competitive' && selectedMode !== 'competitive') return;
    if (devModeType === 'practice' && selectedMode !== null) return;

    hasAutoStartedRef.current = true;
    handleStartGame();
  }, [
    devModeEnabled,
    devAutoStart,
    gameStarted,
    isStarting,
    ctaDisabled,
    devModeType,
    selectedMode,
    handleStartGame,
  ]);

  const handleDisconnect = () => {
    performDisconnect();
  };

  const performDisconnect = () => {
    runEndedNormallyRef.current = false;
    if (activeRoom) {
      try {
        activeRoom.leave();
      } catch (error) {
        console.warn('Failed to leave Colyseus room cleanly', error);
      }
    }
    setGameStarted(false);
    setError(null);
    setCurrentRoomId('');
    setHostSessionId('');
    setPlayerCount(0);
    setHasVictory(false);

    // Refresh inventory and daily runs from server after returning to lobby
    // (e.g. updated potion counts, runs remaining after a completed run).
    // Small delay to ensure server has finished persisting.
    setTimeout(() => {
      void refreshInventory();
      void refreshDailyRuns();
      dispatchOpenRunsRefresh();
    }, 500);
    setRunEndedAt(null);
    // Return to Play view
  };

  // Keyboard handler for Quick Join button (Enter key)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle Enter key when lobby is visible and Quick Join button is available
      if (
        event.key === 'Enter' &&
        !gameStarted &&
        !ctaDisabled &&
        !isStarting &&
        !event.repeat
      ) {
        // Prevent default to avoid form submission if any
        event.preventDefault();
        handleStartGame();
      }
    };

    // Add event listener when lobby is visible
    if (!gameStarted) {
      document.addEventListener('keydown', handleKeyDown);
    }

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [gameStarted, ctaDisabled, isStarting, handleStartGame]);

  const isPreferencesReady =
    isSessionVerified && (!canLoadPlayerData || arePreferencesHydrated);

  const handleDeallocateAll = useCallback(() => {
    void (async () => {
      const saved = await deallocateAllStats();
      if (!saved) {
        return;
      }
      updateProgressionProfile(() => saved);
    })();
  }, [deallocateAllStats, updateProgressionProfile]);

  if (!canLoadPlayerData) {
    const hasSessionError = Boolean(sessionError);
    const snapshotOutage = isSnapshotOutageCode(sessionErrorCode);
    const ownershipRequired = isOwnershipRequiredCode(sessionErrorCode);

    const landingMessage = () => {
      if (!isWalletConnected) {
        return 'Survive and earn yield.';
      }

      if (!isSessionVerified) {
        return 'Loading session...';
      }

      if (!isPreferencesReady) {
        return 'Loading player settings...';
      }
      return welcomeWalletLabel
        ? `Welcome back, ${welcomeWalletLabel}`
        : 'Survive and earn yield.';
    };

    return (
      <div
        className="min-h-screen bg-fixed bg-center bg-cover bg-no-repeat bg-[url('/images/splash-mobile.png')] sm:bg-[url('/images/splash-desktop.png')] flex flex-col items-center justify-center gap-6 text-white text-center px-6"
      >
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-4xl font-bold uppercase tracking-[0.4em]">
            DeFi Dungeon
          </h1>
          {landingMessage() ? (
            <p className="text-sm mt-2 text-white/70 uppercase tracking-[0.3em]">
              {landingMessage()}
            </p>
          ) : null}
        </div>
        {hasSessionError ? (
          <div
            className={`w-full max-w-md rounded-xl border px-4 py-3 text-left ${
              snapshotOutage
                ? 'border-amber-400/40 bg-amber-500/10 text-amber-100'
                : ownershipRequired
                  ? 'border-yellow-400/40 bg-yellow-500/10 text-yellow-100'
                  : 'border-red-400/40 bg-red-500/10 text-red-100'
            }`}
          >
            <p className="text-xs leading-relaxed">{sessionError}</p>
            {ownershipRequired ? (
              <p className="mt-2 text-[11px] text-yellow-100/80">
                Use a wallet that owns at least one Aavegotchi NFT, then try
                signing in again.
              </p>
            ) : null}
            {snapshotOutage ? (
              <p className="mt-2 text-[11px] text-amber-100/80">
                Gameplay and gotchi loading will resume once the ownership
                snapshot service recovers.
              </p>
            ) : null}
            {hasActiveWallet ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3 border-white/30 text-white hover:bg-white/10"
                disabled={isWalletConnecting}
                onClick={() => {
                  void connectWallet().catch(() => {});
                }}
              >
                {isWalletConnecting ? 'Retrying…' : 'Retry Sign-In'}
              </Button>
            ) : null}
          </div>
        ) : null}
        <WalletConnectControl variant="landing" />
      </div>
    );
  }

  if (!gameStarted) {
    // Calculate health potion counts by tier from inventory
    const getHealthPotionCountByTier = (tier: number): number => {
      const potionNames: Record<number, string[]> = {
        1: ['Health Potion', 'health_potion'],
        2: ['Greater Healing Potion', 'greater_health_potion'],
        3: ['Ultra Healing Potion', 'ultra_health_potion'],
      };
      const names = potionNames[tier] || [];

      return inventoryItems
        .filter((item) => {
          if (item.type !== 'potion') return false;
          const itemName = item.name?.toLowerCase() || '';
          const isHealthPotion =
            itemName.includes('health') || itemName.includes('healing');
          if (!isHealthPotion) return false;

          // Match by tier if available
          const itemTier = (item as any).potionTier;
          if (itemTier === tier) return true;

          // Fallback to name matching
          return names.some((name) => itemName === name.toLowerCase());
        })
        .reduce((total, item) => total + item.quantity, 0);
    };

    const healthPotionCounts = {
      tier1: getHealthPotionCountByTier(1),
      tier2: getHealthPotionCountByTier(2),
      tier3: getHealthPotionCountByTier(3),
    };

    const manaPotionCount = inventoryItems
      .filter(
        (item) =>
          item.type === 'potion' &&
          (item.name === 'Mana Potion' ||
            item.name.toLowerCase().includes('mana'))
      )
      .reduce((total, item) => total + item.quantity, 0);

    const lobbyProps: LobbyProps = {
      selectedCharacterId: resolvedCharacterId,
      isCharacterHydrated,
      onCharacterSelect: handleCharacterSelect,
      onUnlockCharacter: handleUnlockCharacter,
      unlockedCharacters,
      isDevMode: devModeEnabled,
      selectedDifficultyTier: effectiveDifficultyTier,
      onDifficultySelect: handleDifficultySelect,
      isWalletConnected,
      ctaLabel,
      ctaDisabled,
      ctaDisabledReason,
      ctaDisabledReasonLinkHref,
      ctaDisabledReasonLinkLabel,
      joinInfo,
      isDifficultyLocked: Boolean(joinTarget),
      isStarting,
      gameStarted,
      error,
      onStartGame: handleStartGame,
      onError: setError,
      lickTongueCount,
      stakedUsdcBalance,
      dailyRuns: dailyRuns,
      dailyRunsLoading: isDailyRunsLoading,
      dailyRunsError: dailyRunsError,
      dailyRunsExhausted,
      onDailyRunsDismiss: () => setDailyRunsExhausted(null),
      onStakeUsdc: handleNavigateToTopUp,
      progressionProfile,
      onAdjustStats: handleAdjustStats,
      leverage,
      onLeverageChange: handleLeverageChange,
      tradeLeverage,
      onTradeLeverageChange: handleTradeLeverageChange,
      tradeToken,
      onTradeTokenChange: handleTradeTokenChange,
      tradeDirection,
      onTradeDirectionChange: handleTradeDirectionChange,
      autoAscendFloor,
      onAutoAscendFloorChange: handleAutoAscendFloorChange,
      healthPotionCounts,
      manaPotionCount,
      onDailyQuestAttune: handleDailyQuestAttune,
      selectedMode,
      onModeChange: handleModeChange,
      speedRunMultiplier,
      onSpeedRunMultiplierChange: handleSpeedRunMultiplierChange,
    };

    return <Lobby {...lobbyProps} />;
  }

  // Render idle game container (current mode)
  if (gameStarted && activeRoom) {
    return (
      <IdleGameContainer
        room={activeRoom}
        characterId={resolvedCharacterId || undefined}
        onLeave={performDisconnect}
        dailyQuestActive={dailyQuestActive}
        dailyQuestRequiredScore={dailyQuestThresholdScore}
        inventoryItems={inventoryItems}
      />
    );
  }

  // Should never reach here, but return empty div as fallback
  return <div className="game-container" />;
}
