export function splitEquipmentSummary(
  summary: string | null | undefined
): string[] {
  if (!summary) {
    return [];
  }

  return summary
    .split(' • ')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function getEquipmentCardSummaryLayout(
  summary: string | null | undefined
): {
  primaryTrait: string | null;
  secondaryLabel: string | null;
} {
  const parts = splitEquipmentSummary(summary);

  return {
    primaryTrait: parts[0] ?? null,
    secondaryLabel:
      parts.length > 1 ? `+${parts.length - 1} more` : null,
  };
}
