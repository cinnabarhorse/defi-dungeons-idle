export type HandKey = 'handLeft' | 'handRight';

export type HandDetails = {
  slug: string | null;
  damageRange: { min: number; max: number } | null;
  grenadeRange: { min: number; max: number } | null;
  attackSpeedMs: number | null;
  weaponType: string | null;
  baseTotalDamageScalar: number | null;
};

export type NumericModifier = {
  add?: number;
  multiply?: number;
  min?: number;
  max?: number;
};

export type EquipmentCombatModifiers = {
  damage?: NumericModifier;
  damageMin?: NumericModifier;
  damageMax?: NumericModifier;
  totalDamage?: NumericModifier;
  attackSpeed?: NumericModifier;
};

export function applyModifierValue(
  value: number,
  modifier: NumericModifier | undefined,
  clamp?: { min?: number; max?: number; invertMultiply?: boolean }
): number {
  if (!modifier) return value;
  let result = Number.isFinite(value) ? value : 0;
  const add = Number(modifier.add || 0);
  const multiply = Number(modifier.multiply || 1);
  result += add;
  if (clamp?.invertMultiply) {
    result = multiply > 0 ? result / multiply : result;
  } else {
    result *= multiply;
  }
  if (typeof modifier.min === 'number') result = Math.max(result, modifier.min);
  if (typeof modifier.max === 'number') result = Math.min(result, modifier.max);
  if (clamp?.min !== undefined) result = Math.max(result, clamp.min);
  if (clamp?.max !== undefined) result = Math.min(result, clamp.max);
  return result;
}

export function applyDamageModifiersToHand(
  hand: HandDetails,
  modifiers: EquipmentCombatModifiers
): HandDetails {
  let nextAttackSpeedMs = hand.attackSpeedMs;
  if (
    typeof hand.attackSpeedMs === 'number' &&
    Number.isFinite(hand.attackSpeedMs) &&
    hand.attackSpeedMs > 0
  ) {
    const adjustedAttackSpeed = applyModifierValue(
      hand.attackSpeedMs,
      modifiers.attackSpeed,
      { min: 50, invertMultiply: true }
    );
    if (Number.isFinite(adjustedAttackSpeed)) {
      nextAttackSpeedMs = Math.max(50, adjustedAttackSpeed);
    }
  }

  if (!hand.damageRange) {
    if (nextAttackSpeedMs === hand.attackSpeedMs) {
      return hand;
    }
    return {
      ...hand,
      attackSpeedMs: nextAttackSpeedMs,
    };
  }
  const baseMin = Number(hand.damageRange.min || 0);
  const baseMax = Number(hand.damageRange.max || 0);
  const modifiedMinBase = applyModifierValue(baseMin, modifiers.damage);
  const modifiedMaxBase = applyModifierValue(baseMax, modifiers.damage);
  const adjustedMin = applyModifierValue(modifiedMinBase, modifiers.damageMin);
  const adjustedMax = applyModifierValue(modifiedMaxBase, modifiers.damageMax);

  const baseScalar =
    typeof hand.baseTotalDamageScalar === 'number' &&
    Number.isFinite(hand.baseTotalDamageScalar)
      ? hand.baseTotalDamageScalar
      : 1;
  let scalarAdjusted = applyModifierValue(baseScalar, modifiers.totalDamage, {
    min: 0,
  });
  if (!Number.isFinite(scalarAdjusted)) scalarAdjusted = 0;
  scalarAdjusted = Math.max(0, scalarAdjusted);

  const minBeforeScale = Math.min(adjustedMin, adjustedMax);
  const maxBeforeScale = Math.max(adjustedMin, adjustedMax);
  const finalMin = Math.max(0, Math.round(minBeforeScale * scalarAdjusted));
  const finalMax = Math.max(finalMin, Math.round(maxBeforeScale * scalarAdjusted));

  return {
    ...hand,
    attackSpeedMs: nextAttackSpeedMs,
    damageRange: { min: finalMin, max: finalMax },
  };
}

export function enhanceHandsWithEquipmentModifiers(
  hands: Record<HandKey, HandDetails>,
  modifiers: EquipmentCombatModifiers
): Record<HandKey, HandDetails> {
  return {
    handLeft: applyDamageModifiersToHand(hands.handLeft, modifiers),
    handRight: applyDamageModifiersToHand(hands.handRight, modifiers),
  };
}

export function handAttackSpeedAps(
  hand: Pick<HandDetails, 'attackSpeedMs'>
): number {
  const ms = hand.attackSpeedMs;
  if (!ms || ms <= 0) return 0;
  return 1000 / ms;
}

export function classifyAttackSpeedDelta(leftDelta: number, rightDelta: number): {
  improved: boolean;
  worse: boolean;
} {
  const improved = leftDelta > 0 || rightDelta > 0;
  const worse = !improved && (leftDelta < 0 || rightDelta < 0);
  return { improved, worse };
}
