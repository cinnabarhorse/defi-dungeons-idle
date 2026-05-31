function formatResetCountdown(resetAt: string, nowMs: number): string | null {
  const targetMs = Date.parse(resetAt);
  if (!Number.isFinite(targetMs)) {
    return null;
  }

  const remainingMs = Math.max(0, targetMs - nowMs);
  const totalMinutes = Math.floor(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);

  if (hours <= 0) {
    return `${totalMinutes}m`;
  }
  return `${hours}h`;
}

export function getRunEligibilityCtaState(
  canPlayToday: boolean | null | undefined,
  playError: string | null | undefined,
  options?: {
    acquiredAfterSnapshot?: boolean | null;
    resetAtUtc?: string | null;
  },
  nowMs: number = Date.now()
) {
  if (canPlayToday === false) {
    if (options?.acquiredAfterSnapshot && options.resetAtUtc) {
      const countdown = formatResetCountdown(options.resetAtUtc, nowMs);
      return {
        ctaLabel: 'Not Authorized',
        ctaDisabledReason: countdown
          ? `Aavegotchi secured. Daily Ownership snapshot will reset in ${countdown}.`
          : 'Daily Ownership snapshot will reset soon.',
        ctaDisabledReasonLinkHref: null,
        ctaDisabledReasonLinkLabel: null,
      };
    }

    return {
      ctaLabel: 'Not Authorized',
      ctaDisabledReason: 'Aavegotchi ownership is required to play.',
      ctaDisabledReasonLinkHref:
        'https://aavegotchi.com/baazaar/aavegotchis',
      ctaDisabledReasonLinkLabel: 'Get an Aavegotchi',
    };
  }

  return {
    ctaLabel: null,
    ctaDisabledReason: null,
    ctaDisabledReasonLinkHref: null,
    ctaDisabledReasonLinkLabel: null,
  };
}
