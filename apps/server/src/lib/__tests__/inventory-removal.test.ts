// The functions we test here are pure, but the module imports DB helpers.
// Mock them to avoid side effects / env requirements.
jest.mock('../db', () => ({
  runTransaction: jest.fn(),
  inventoryRepo: {},
  inventoryEventsRepo: {},
}));

jest.mock('../equipment-service', () => ({
  getEquippedInventoryItemIds: jest.fn(async () => new Set()),
}));

// Use require() so the mocks are applied before module evaluation.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  isDestroyFungibleRequest,
  isDestroyInstanceRequest,
  normalizeRemoveRequests,
  MAX_REMOVE_OPERATIONS,
} = require('../inventory-removal');

describe('inventory-removal request parsing', () => {
  test('isDestroyFungibleRequest accepts numeric quantities (including numeric strings) and rejects invalid shapes', () => {
    expect(
      isDestroyFungibleRequest({ itemType: 'consumable', itemName: 'Potion', quantity: 3 })
    ).toBe(true);

    // numeric strings are accepted (normalizeRemoveRequests will later floor/coerce)
    expect(
      isDestroyFungibleRequest({ itemType: 'consumable', itemName: 'Potion', quantity: '3' })
    ).toBe(true);

    // empty / whitespace strings are rejected
    expect(
      isDestroyFungibleRequest({ itemType: ' ', itemName: 'Potion', quantity: 1 })
    ).toBe(false);
    expect(
      isDestroyFungibleRequest({ itemType: 'consumable', itemName: ' ', quantity: 1 })
    ).toBe(false);

    // non-finite is rejected
    expect(
      isDestroyFungibleRequest({ itemType: 'consumable', itemName: 'Potion', quantity: 'Infinity' })
    ).toBe(false);

    // wrong shape is rejected
    expect(isDestroyFungibleRequest(null)).toBe(false);
    expect(isDestroyFungibleRequest(['not', 'an', 'object'])).toBe(false);
    expect(isDestroyFungibleRequest({ itemType: 'consumable' })).toBe(false);
  });

  test('isDestroyInstanceRequest requires a non-empty inventoryItemId string', () => {
    expect(isDestroyInstanceRequest({ inventoryItemId: 'abc-123' })).toBe(true);
    expect(isDestroyInstanceRequest({ inventoryItemId: '   ' })).toBe(false);
    expect(isDestroyInstanceRequest({})).toBe(false);
    expect(isDestroyInstanceRequest(null)).toBe(false);
  });

  test('normalizeRemoveRequests supports array form, {items: [...]}, single object, and filters invalid entries', () => {
    const validFungible = { itemType: 'consumable', itemName: 'Potion', quantity: 2 };
    const validInstance = { inventoryItemId: 'wearable-1' };

    expect(
      normalizeRemoveRequests([validFungible, { nope: true }, validInstance])
    ).toEqual([validFungible, validInstance]);

    expect(
      normalizeRemoveRequests({ items: [validInstance, { itemType: '', itemName: 'x', quantity: 1 }] })
    ).toEqual([validInstance]);

    expect(normalizeRemoveRequests(validFungible)).toEqual([validFungible]);

    expect(normalizeRemoveRequests({})).toEqual([]);
    expect(normalizeRemoveRequests({ items: 'not-an-array' })).toEqual([]);
  });

  test('MAX_REMOVE_OPERATIONS is a reasonable bound (sanity check)', () => {
    // Guard against accidental regression to an unsafe value.
    expect(MAX_REMOVE_OPERATIONS).toBeGreaterThanOrEqual(1);
    expect(MAX_REMOVE_OPERATIONS).toBeLessThanOrEqual(1000);
  });
});
