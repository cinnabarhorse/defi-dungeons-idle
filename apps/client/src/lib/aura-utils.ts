export function toAuraAbilityShortLabel(id: string): string {
  switch (id) {
    case 'attack-speed':
      return 'Haste';
    case 'move-speed':
      return 'Speed';
    case 'damage-multiplier':
      return 'Damage';
    case 'damage-reduction':
      return 'Armor';
    case 'regen':
      return 'Regen';
    case 'life-steal':
      return 'Vampirism';
    case 'critical-strike':
      return 'Crit';
    case 'evade':
      return 'Evade';
    default:
      return String(id || '').replace(/[-_]/g, ' ');
  }
}

function normalizeVisualTags(input: unknown): string[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.filter((tag) => typeof tag === 'string');
  }

  const result: string[] = [];
  const maybeForEach = (input as any)?.forEach;
  if (typeof maybeForEach === 'function') {
    maybeForEach.call(input, (value: unknown) => {
      if (typeof value === 'string') {
        result.push(value);
      }
    });
    if (result.length > 0) return result;
  }

  const length = Number((input as any)?.length);
  if (Number.isFinite(length) && length > 0) {
    for (let i = 0; i < length; i++) {
      const value = (input as any)[i];
      if (typeof value === 'string') {
        result.push(value);
      }
    }
    if (result.length > 0) return result;
  }

  const iterator = (input as any)?.values;
  if (typeof iterator === 'function') {
    for (const value of iterator.call(input)) {
      if (typeof value === 'string') {
        result.push(value);
      }
    }
  }

  return result;
}

export function getAuraAbilityLabelsFromTags(
  visualTagsInput: unknown
): string[] {
  const tags = normalizeVisualTags(visualTagsInput);
  const abilityIds = tags
    .filter(
      (t) => typeof t === 'string' && (t as string).startsWith('aura:ability:')
    )
    .map((t) => (t as string).split(':')[2])
    .filter((id) => typeof id === 'string' && id.length > 0);
  if (abilityIds.length === 0) return [];
  const labels = abilityIds.map(toAuraAbilityShortLabel);
  // Ensure uniqueness while preserving order
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const label of labels) {
    if (!seen.has(label)) {
      seen.add(label);
      deduped.push(label);
    }
  }
  return deduped;
}
