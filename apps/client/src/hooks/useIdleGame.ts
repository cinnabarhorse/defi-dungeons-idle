import { useState, useEffect, useRef } from 'react';
import { Room } from 'colyseus.js';
import { getWearableBySlug } from '../data/wearables';

export function useIdleGame(room: Room | null) {
  const [idleRoom, setIdleRoom] = useState<any>(null);
  const [playerHp, setPlayerHp] = useState(100);
  const [maxHp, setMaxHp] = useState(100);
  const [playerMana, setPlayerMana] = useState(0);
  const [maxMana, setMaxMana] = useState(0);
  const [playerLevel, setPlayerLevel] = useState(1);
  const [playerXp, setPlayerXp] = useState(0);
  const [playerXpIntoLevel, setPlayerXpIntoLevel] = useState(0);
  const [playerXpForNextLevel, setPlayerXpForNextLevel] = useState(100);
  const [isAutoExploring, setIsAutoExploring] = useState(true);
  const [activeWeapon, setActiveWeapon] = useState<any>(null);
  const [activeGrenade, setActiveGrenade] = useState<any>(null);
  const [leverage, setLeverage] = useState(1.0);
  const [difficultyTier, setDifficultyTier] = useState('normal');
  const [score, setScore] = useState(0);
  const [maxDepthReached, setMaxDepthReached] = useState(1);
  const [kills, setKills] = useState<Record<string, number>>({});
  const [lootsCollected, setLootsCollected] = useState<any[]>([]);
  const [tokenRewards, setTokenRewards] = useState<any[]>([]);
  const [targetFloor, setTargetFloor] = useState(3);
  const [healthPotionCount, setHealthPotionCount] = useState(0);
  const [manaPotionCount, setManaPotionCount] = useState(0);
  const [dailyQuestActive, setDailyQuestActive] = useState(false);
  const [dailyQuestThresholdScore, setDailyQuestThresholdScore] = useState<
    number | null
  >(null);
  const [usesRealGotchi, setUsesRealGotchi] = useState(false);
  const [competitionMultiplier, setCompetitionMultiplier] = useState(1.0);
  const [speedRun, setSpeedRun] = useState(false);
  const [speedRunMultiplier, setSpeedRunMultiplier] = useState(1);
  const [potionsCollected, setPotionsCollected] = useState({
    health: 0,
    mana: 0,
  });
  const [potionsUsed, setPotionsUsed] = useState({
    health: 0,
    mana: 0,
  });
  const [potionsUsedByTier, setPotionsUsedByTier] = useState({
    tier1: 0,
    tier2: 0,
    tier3: 0,
  });

  // Ref to track last stringified state to prevent redundant React updates
  const lastStateRef = useRef<string>('');

  useEffect(() => {
    if (!room) return;

    const sessionId = room.sessionId;

    const handleDailyQuestStatus = (data: any) => {
      console.log('[useIdleGame] Daily Quest Status Message:', data);
      setDailyQuestActive(data.active === true);
      if (data.thresholdScore != null) {
        setDailyQuestThresholdScore(Number(data.thresholdScore));
      }
    };

    const unsubscribeDailyQuest = room.onMessage('daily_quest:status', handleDailyQuestStatus);

    const updateState = () => {
      const p = room.state.players.get(sessionId);
      if (!p) return;

      // Create a snapshot of the current state we care about
      // Total available potions = persistent inventory + run-collected (not yet persisted)
      const totalHealthPotions =
        (p.healthPotionCount || 0) +
        (p.idleRoom?.runHealthPotionsCollected || 0);
      const totalManaPotions =
        (p.manaPotionCount || 0) +
        (p.idleRoom?.runManaPotionsCollected || 0);

      const stateSnapshot = {
        idleRoom: p.idleRoom,
        hp: p.hp,
        maxHp: p.maxHp,
        mana: p.mana,
        maxMana: p.maxMana,
        isAutoExploring: p.isAutoExploring,
        score: p.score,
        maxDepthReached: p.idleRoom.maxDepthReached,
        leverage: room.state.leverageTotal,
        difficulty: room.state.difficultyTier,
        killCount: p.idleRoom.killCount,
        lootsCollected: p.idleRoom.lootsCollected,
        tokenRewards: p.idleRoom.tokenRewards,
        autoAscendFloor: p.autoAscendFloor,
        healthPotionCount: totalHealthPotions,
        manaPotionCount: totalManaPotions,
        level: p.level,
        xp: p.xp,
        xpIntoLevel: p.xpIntoLevel,
        xpForNextLevel: p.xpForNextLevel,
        usesRealGotchi: p.usesRealGotchi === true,
        competitionMultiplier: p.idleRoom.competitionMultiplier,
        dailyQuestActive: p.dailyQuestActive,
        speedRun: p.idleRoom.speedRun,
        speedRunMultiplier: p.idleRoom.speedRunMultiplier,
        potionsCollected: p.idleRoom.lootsCollected,
        potionsUsed: {
          runHealth: p.idleRoom.runHealthPotionsUsed,
          runMana: p.idleRoom.runManaPotionsUsed,
          persistentHealth: p.idleRoom.persistentHealthPotionsUsed,
          persistentMana: p.idleRoom.persistentManaPotionsUsed,
        },
        potionsUsedByTier: {
          runTier1: p.idleRoom.runHealthPotionsUsedTier1,
          runTier2: p.idleRoom.runHealthPotionsUsedTier2,
          runTier3: p.idleRoom.runHealthPotionsUsedTier3,
          persistentTier1: p.idleRoom.persistentHealthPotionsUsedTier1,
          persistentTier2: p.idleRoom.persistentHealthPotionsUsedTier2,
          persistentTier3: p.idleRoom.persistentHealthPotionsUsedTier3,
        },
      };

      const stringified = JSON.stringify(stateSnapshot);
      if (stringified === lastStateRef.current) return;
      lastStateRef.current = stringified;

      // Data has changed, update React state
      setIdleRoom(JSON.parse(JSON.stringify(p.idleRoom)));
      setPlayerHp(p.hp);
      setMaxHp(p.maxHp);
      setPlayerMana(p.mana || 0);
      setMaxMana(p.maxMana || 0);
      setIsAutoExploring(p.isAutoExploring);
      setScore(p.score || 0);
      setMaxDepthReached(p.idleRoom.maxDepthReached || 1);
      setLeverage(room.state.leverageTotal || 1.0);
      setDifficultyTier(room.state.difficultyTier || 'normal');
      setTargetFloor(p.autoAscendFloor || 3);
      setHealthPotionCount(totalHealthPotions);
      setManaPotionCount(totalManaPotions);
      setPlayerLevel(p.level || 1);
      setPlayerXp(p.xp || 0);
      setPlayerXpIntoLevel(p.xpIntoLevel || 0);
      setPlayerXpForNextLevel(p.xpForNextLevel || 100);
      setUsesRealGotchi(p.usesRealGotchi === true);
      setCompetitionMultiplier(p.idleRoom.competitionMultiplier || 1.0);
      setDailyQuestActive(p.dailyQuestActive === true);
      setSpeedRun(p.idleRoom.speedRun === true);
      setSpeedRunMultiplier(
        Number.isFinite(p.idleRoom.speedRunMultiplier)
          ? p.idleRoom.speedRunMultiplier
          : 1
      );

      const collected = { health: 0, mana: 0 };
      p.idleRoom.lootsCollected.forEach((loot: any) => {
        const itemType = String(loot?.type ?? '').toLowerCase();
        const name = String(loot?.name ?? '').toLowerCase();
        if (itemType !== 'potion') return;
        const qty = Number(loot?.quantity) || 0;
        if (qty <= 0) return;
        if (name.includes('health')) collected.health += qty;
        if (name.includes('mana')) collected.mana += qty;
      });
      setPotionsCollected(collected);

      const usedHealth =
        (Number(p.idleRoom.runHealthPotionsUsed) || 0) +
        (Number(p.idleRoom.persistentHealthPotionsUsed) || 0);
      const usedMana =
        (Number(p.idleRoom.runManaPotionsUsed) || 0) +
        (Number(p.idleRoom.persistentManaPotionsUsed) || 0);
      setPotionsUsed({ health: usedHealth, mana: usedMana });
      setPotionsUsedByTier({
        tier1:
          (Number(p.idleRoom.runHealthPotionsUsedTier1) || 0) +
          (Number(p.idleRoom.persistentHealthPotionsUsedTier1) || 0),
        tier2:
          (Number(p.idleRoom.runHealthPotionsUsedTier2) || 0) +
          (Number(p.idleRoom.persistentHealthPotionsUsedTier2) || 0),
        tier3:
          (Number(p.idleRoom.runHealthPotionsUsedTier3) || 0) +
          (Number(p.idleRoom.persistentHealthPotionsUsedTier3) || 0),
      });

      // Sync Kills
      const killMap: Record<string, number> = {};
      p.idleRoom.killCount.forEach((count: number, name: string) => {
        killMap[name] = count;
      });
      setKills(killMap);

      // Sync Loots
      setLootsCollected(JSON.parse(JSON.stringify(p.idleRoom.lootsCollected)));
      
      // Sync Token Rewards
      setTokenRewards(JSON.parse(JSON.stringify(p.idleRoom.tokenRewards || [])));

      // Sync Icons (derivedStats)
      try {
        const derived = JSON.parse(p.derivedStats || '{}');
        const activeSlug = derived.activeWeaponSlug;
        if (activeSlug) {
          const wearable = getWearableBySlug(activeSlug);
          if (wearable) {
            setActiveWeapon({
              slug: activeSlug,
              svgId: wearable.svgId,
              name: wearable.name,
              weaponCategory: wearable.weapon?.weaponCategory,
            });
          }
        } else {
          setActiveWeapon(null);
        }

        const weapons = derived.weapons || [];
        const grenadeW = weapons.find((w: any) => w.weaponType === 'grenades');
        if (grenadeW) {
          const wearable = getWearableBySlug(grenadeW.slug);
          if (wearable) {
            setActiveGrenade({
              slug: grenadeW.slug,
              svgId: wearable.svgId,
              name: wearable.name,
            });
          }
        } else {
          setActiveGrenade(null);
        }
      } catch (e) {
        console.warn('[useIdleGame] Failed to parse derivedStats:', e);
      }
    };

    // Use a slightly slower interval for background sync
    const interval = setInterval(updateState, 200);
    updateState();

    return () => {
      clearInterval(interval);
      if (unsubscribeDailyQuest) {
        unsubscribeDailyQuest();
      }
    };
  }, [room]);

  return {
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
    dailyQuestActive,
    dailyQuestThresholdScore,
    usesRealGotchi,
    competitionMultiplier,
    speedRun,
    speedRunMultiplier,
    potionsCollected,
    potionsUsed,
      potionsUsedByTier,
  };
}
