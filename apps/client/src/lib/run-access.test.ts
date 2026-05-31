import { getRunEligibilityCtaState } from './run-access';

describe('run access CTA state', () => {
  it('returns not-authorized CTA when play is disabled', () => {
    expect(
      getRunEligibilityCtaState(false, 'Wallet is not eligible for today')
    ).toEqual({
      ctaLabel: 'Not Authorized',
      ctaDisabledReason: 'Aavegotchi ownership is required to play.',
      ctaDisabledReasonLinkHref:
        'https://aavegotchi.com/baazaar/aavegotchis',
      ctaDisabledReasonLinkLabel: 'Get an Aavegotchi',
    });
  });

  it('returns no CTA override when play is allowed', () => {
    expect(getRunEligibilityCtaState(true, null)).toEqual({
      ctaLabel: null,
      ctaDisabledReason: null,
      ctaDisabledReasonLinkHref: null,
      ctaDisabledReasonLinkLabel: null,
    });
  });

  it('shows the snapshot reset countdown when the wallet owns a gotchi now but missed the snapshot', () => {
    expect(
      getRunEligibilityCtaState(
        false,
        'Wallet is not eligible for today',
        {
          acquiredAfterSnapshot: true,
          resetAtUtc: '2026-03-23T00:00:00.000Z',
        },
        Date.parse('2026-03-22T06:35:00.000Z')
      )
    ).toEqual({
      ctaLabel: 'Not Authorized',
      ctaDisabledReason:
        'Aavegotchi secured. Daily Ownership snapshot will reset in 17h.',
      ctaDisabledReasonLinkHref: null,
      ctaDisabledReasonLinkLabel: null,
    });
  });
});
