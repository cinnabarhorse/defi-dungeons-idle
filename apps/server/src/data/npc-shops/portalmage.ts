import type { InventoryItemPayload } from '../../lib/db';

export type ShopCurrency = {
  type: string;
  name: string;
};

export type ShopItemGrant = InventoryItemPayload & {
  quantity: number;
};

export type ShopItemDefinition = {
  id: string;
  label: string;
  description: string;
  price: number;
  currency: ShopCurrency;
  grant: ShopItemGrant;
};

const GOLD_CURRENCY: ShopCurrency = {
  type: 'coin',
  name: 'Gold',
};

export const PORTAL_MAGE_SHOP: ShopItemDefinition[] = [
  {
    id: 'health_potion',
    label: 'Health Potion',
    description: 'Restores 50 HP when consumed.',
    price: 5,
    currency: GOLD_CURRENCY,
    grant: {
      id: 'potion_Health Potion',
      type: 'potion',
      itemType: 'potion',
      name: 'Health Potion',
      quantity: 1,
      color: '#ff6b6b',
      description: 'Restores 50 HP when consumed.',
      rarity: 'common',
      spriteId: 126,
    },
  },
  {
    id: 'mana_potion',
    label: 'Mana Potion',
    description: 'Restores 30 MP when consumed.',
    price: 5,
    currency: GOLD_CURRENCY,
    grant: {
      id: 'potion_Mana Potion',
      type: 'potion',
      itemType: 'potion',
      name: 'Mana Potion',
      quantity: 1,
      color: '#6b9cff',
      description: 'Restores 30 MP when consumed.',
      rarity: 'common',
      spriteId: 127,
    },
  },
];

export const PORTAL_MAGE_SHOP_BY_ID: Map<string, ShopItemDefinition> = new Map(
  PORTAL_MAGE_SHOP.map((item) => [item.id, item])
);
