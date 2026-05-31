import { describe, expect, it } from '@jest/globals';
import { runIdleModeReplay } from '../idle-sim';
import { assertSnapshot } from '../snapshot-utils';

describe('idle replay simulation', () => {
  it('returns identical replay hashes for repeated runs with the same seed', () => {
    const first = runIdleModeReplay({
      seed: 424242,
      ticks: 12,
      tickMs: 800,
      leverageTotal: 3,
      difficultyTier: 'nightmare_1',
    });
    const second = runIdleModeReplay({
      seed: 424242,
      ticks: 12,
      tickMs: 800,
      leverageTotal: 3,
      difficultyTier: 'nightmare_1',
    });

    expect(first.finalStateHash).toBe(second.finalStateHash);
    expect(first.frames.map((frame) => frame.stateHash)).toEqual(
      second.frames.map((frame) => frame.stateHash)
    );
  });

  it('changes replay state hash when tick count differs', () => {
    const first = runIdleModeReplay({
      seed: 111111,
      ticks: 8,
      tickMs: 800,
      leverageTotal: 3,
      difficultyTier: 'nightmare_1',
    });
    const second = runIdleModeReplay({
      seed: 111111,
      ticks: 12,
      tickMs: 800,
      leverageTotal: 3,
      difficultyTier: 'nightmare_1',
    });

    expect(first.finalStateHash).not.toBe(second.finalStateHash);
  });

  it('matches deterministic replay snapshot', () => {
    const replay = runIdleModeReplay({
      seed: 90210,
      ticks: 16,
      tickMs: 1000,
      leverageTotal: 5,
      difficultyTier: 'hell_1',
    });

    const compactReplay = {
      seed: replay.seed,
      ticks: replay.ticks,
      tickMs: replay.tickMs,
      difficultyTier: replay.difficultyTier,
      leverageTotal: replay.leverageTotal,
      finalStateHash: replay.finalStateHash,
      frames: replay.frames.map((frame) => ({
        tick: frame.tick,
        now: frame.now,
        playerHp: frame.playerHp,
        playerMana: frame.playerMana,
        enemyHp: frame.enemyHp,
        runStatus: frame.runStatus,
        encounterCompleted: frame.encounterCompleted,
        stateHash: frame.stateHash,
      })),
    };

    assertSnapshot(
      'idle-replay-golden',
      compactReplay as unknown as Record<string, unknown>
    );
  });
});
