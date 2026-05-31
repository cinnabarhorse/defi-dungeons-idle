import { validateMoveInput } from '../validation';
import { GAME_CONFIG } from '../constants';
import type { MoveInput } from '../../types';

describe('validateMoveInput', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects non-object input', () => {
    expect(validateMoveInput(null as any, 0, 0, 0)).toEqual({
      valid: false,
      error: 'Invalid input format',
    });

    expect(validateMoveInput('nope' as any, 0, 0, 0)).toEqual({
      valid: false,
      error: 'Invalid input format',
    });
  });

  it('rejects when target coordinates are missing', () => {
    const input = { seq: 1, ts: 0 } as any;

    expect(validateMoveInput(input, 0, 0, 0)).toEqual({
      valid: false,
      error: 'Missing target coordinates',
    });
  });

  it('rejects when target tile is out of bounds', () => {
    const input: MoveInput = {
      seq: 1,
      ts: 0,
      targetTileX: -1,
      targetTileY: 0,
    };

    expect(validateMoveInput(input, 0, 0, 0)).toEqual({
      valid: false,
      error: 'Target position out of bounds',
    });
  });

  it('rejects movement that is too far (teleport protection)', () => {
    const maxAllowed = GAME_CONFIG.MOVEMENT_SPEED * 2;

    const input: MoveInput = {
      seq: 1,
      ts: 0,
      targetTileX: maxAllowed + 1,
      targetTileY: 0,
    };

    expect(validateMoveInput(input, 0, 0, 0)).toEqual({
      valid: false,
      error: 'Movement distance too large',
    });
  });

  it('rejects moves that happen too quickly', () => {
    // make the timing check deterministic
    jest.spyOn(Date, 'now').mockReturnValue(1_000);

    const minMoveInterval = 1000 / GAME_CONFIG.MOVEMENT_SPEED;
    const lastMoveTime = 1_000 - (minMoveInterval * 0.5 - 1);

    const input: MoveInput = {
      seq: 1,
      ts: 0,
      targetTileX: 0,
      targetTileY: 0,
    };

    expect(validateMoveInput(input, 0, 0, lastMoveTime)).toEqual({
      valid: false,
      error: 'Moving too fast',
    });
  });

  it('accepts a valid move input', () => {
    jest.spyOn(Date, 'now').mockReturnValue(10_000);

    const input: MoveInput = {
      seq: 1,
      ts: 0,
      targetTileX: 1,
      targetTileY: 1,
    };

    // move from (0,0) to (1,1) => manhattan distance 2
    // make lastMoveTime far enough in the past to pass the rate limit check
    const lastMoveTime = 0;

    expect(validateMoveInput(input, 0, 0, lastMoveTime)).toEqual({ valid: true });
  });
});
