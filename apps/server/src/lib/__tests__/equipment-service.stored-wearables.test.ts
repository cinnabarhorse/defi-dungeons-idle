/*
 * NOTE:
 * equipment-service.ts imports ./aavegotchi which depends on graphql-request (ESM).
 * Jest in this repo is configured for CJS/ts-jest, so we mock the ESM dependency
 * and the aavegotchi module before requiring equipment-service.
 */

jest.mock('graphql-request', () => ({
  gql: () => undefined,
  request: async () => undefined,
}));

jest.mock('../aavegotchi', () => ({
  fetchAavegotchiById: async () => undefined,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const equipment = require('../equipment-service') as typeof import('../equipment-service');

describe('equipment-service stored wearable helpers', () => {
  const {
    deserializeStoredWearable,
    extractStoredWearableValues,
    normalizeStoredWearableList,
    resolveRuntimeEquipmentSnapshotForJoin,
    serializeStoredWearable,
  } = equipment;

  describe('extractStoredWearableValues', () => {
    it('parses a JSON array string', () => {
      expect(extractStoredWearableValues('["a", {"slug":"b"}]')).toEqual([
        'a',
        { slug: 'b' },
      ]);
    });

    it('treats invalid JSON strings as a single value', () => {
      expect(extractStoredWearableValues('["a"')).toEqual(['["a"']);
    });

    it('returns [] for blank strings', () => {
      expect(extractStoredWearableValues('   ')).toEqual([]);
    });
  });

  describe('deserializeStoredWearable + serializeStoredWearable', () => {
    it('round-trips slot + slug + quality (non-default quality is preserved)', () => {
      const parsed = deserializeStoredWearable('head::test-hat::excellent');
      expect(parsed).toEqual({
        slot: 'head',
        slug: 'test-hat',
        quality: 'excellent',
        durabilityScore: null,
      });

      const serialized = serializeStoredWearable({
        slot: 'head',
        slug: 'test-hat',
        quality: 'excellent',
      });
      expect(serialized).toEqual({
        slot: 'head',
        slug: 'test-hat',
        quality: 'excellent',
      });
    });

    it('stores default quality explicitly in object form', () => {
      expect(
        serializeStoredWearable({
          slot: 'head',
          slug: 'test-hat',
          quality: 'average',
        })
      ).toEqual({
        slot: 'head',
        slug: 'test-hat',
        quality: 'average',
      });
    });

    it('handles object input and normalizes unknown quality to default', () => {
      const parsed = deserializeStoredWearable({
        slot: 'body',
        slug: 'test-shirt',
        quality: 'not-a-real-tier',
      });

      expect(parsed).toEqual({
        slot: 'body',
        slug: 'test-shirt',
        quality: 'average',
        durabilityScore: null,
      });
    });

    it('round-trips object input with durability metadata', () => {
      const parsed = deserializeStoredWearable({
        slot: 'head',
        slug: 'durable-hat',
        quality: 'excellent',
        durabilityScore: 612,
      });

      expect(parsed).toEqual({
        slot: 'head',
        slug: 'durable-hat',
        quality: 'excellent',
        durabilityScore: 612,
      });

      expect(
        serializeStoredWearable({
          slot: 'head',
          slug: 'durable-hat',
          quality: 'excellent',
          durabilityScore: 612,
        } as any)
      ).toEqual({
        slot: 'head',
        slug: 'durable-hat',
        quality: 'excellent',
        durabilityScore: 612,
      });
    });
  });

  describe('normalizeStoredWearableList', () => {
    const fallback: import('../equipment-service').StoredWearableEntry[] = [
      { slot: 'head', slug: 'fallback-hat', quality: 'budget' },
      { slot: 'handLeft', slug: 'fallback-sword', quality: 'flawless' },
    ];

    it('uses fallback assignments when slot is missing (slug match)', () => {
      const raw = JSON.stringify([
        // explicit slot + quality
        'head::explicit-hat::excellent',
        // no slot; should pick slot+quality from fallback-sword
        { slug: 'fallback-sword' },
      ]);

      expect(normalizeStoredWearableList(raw, fallback)).toEqual([
        {
          slot: 'head',
          slug: 'explicit-hat',
          quality: 'excellent',
        },
        {
          slot: 'handLeft',
          slug: 'fallback-sword',
          quality: 'flawless',
        },
      ]);
    });

    it('warns and defaults to handRight when fallback is exhausted', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      const raw = JSON.stringify([{ slug: 'one' }, { slug: 'two' }, { slug: 'three' }]);

      const normalized = normalizeStoredWearableList(raw, fallback);
      expect(normalized).toHaveLength(3);

      // First two entries should consume fallback slots (in order)
      expect(normalized[0]).toEqual({
        slot: 'head',
        slug: 'one',
        quality: 'budget',
      });
      expect(normalized[1]).toEqual({
        slot: 'handLeft',
        slug: 'two',
        quality: 'flawless',
      });

      // Third entry has no fallback slot; should warn and default
      expect(normalized[2]).toEqual({
        slot: 'handRight',
        slug: 'three',
        quality: 'average',
      });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Unable to resolve slot for three')
      );

      warn.mockRestore();
    });
  });

  describe('resolveRuntimeEquipmentSnapshotForJoin', () => {
    const equipmentState = {
      equipment: [
        {
          slot: 'handRight',
          slug: 'fresh-sword',
          source: 'base',
          inventoryItemId: null,
          quality: 'average',
        },
      ],
      derivedStats: {
        damage: 42,
        equipment: {
          slugs: ['fresh-sword'],
          items: [{ slug: 'fresh-sword', slot: 'handRight', quality: 'average' }],
          modifiers: {},
        },
      },
    } as any;

    it('prefers fresh equipment state for verified real gotchis', () => {
      const result = resolveRuntimeEquipmentSnapshotForJoin({
        equipmentState,
        progressionWearables: ['handRight::stale-staff'],
        progressionDerivedStats: { damage: 7 },
        preferFreshState: true,
      });

      expect(result.runtimeWearables).toEqual([
        {
          slot: 'handRight',
          slug: 'fresh-sword',
          quality: 'average',
        },
      ]);
      expect(result.runtimeDerivedStats).toBe(equipmentState.derivedStats);
    });

    it('keeps the progression snapshot for non-gotchi joins', () => {
      const progressionDerivedStats = { damage: 7 };
      const result = resolveRuntimeEquipmentSnapshotForJoin({
        equipmentState,
        progressionWearables: ['handRight::stale-staff::excellent'],
        progressionDerivedStats,
        preferFreshState: false,
      });

      expect(result.runtimeWearables).toEqual([
        {
          slot: 'handRight',
          slug: 'stale-staff',
          quality: 'excellent',
        },
      ]);
      expect(result.runtimeDerivedStats).toBe(progressionDerivedStats);
    });
  });
});
