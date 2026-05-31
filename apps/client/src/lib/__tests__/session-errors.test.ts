import {
  isOwnershipRequiredCode,
  isSnapshotOutageCode,
  mapApiKeyCreateError,
  mapAuthVerifyError,
  mapGotchiLoadError,
} from '../session-errors';

describe('session error mapping', () => {
  it('maps auth ownership-required responses', () => {
    const mapped = mapAuthVerifyError(
      {
        code: 'WALLET_NOT_ELIGIBLE',
      },
      403
    );

    expect(mapped.code).toBe('WALLET_NOT_ELIGIBLE');
    expect(mapped.message).toContain('not eligible today');
    expect(isOwnershipRequiredCode(mapped.code)).toBe(true);
  });

  it('maps snapshot outage responses with date context', () => {
    const mapped = mapAuthVerifyError(
      {
        code: 'SNAPSHOT_MISSING',
        date: '2026-02-23',
      },
      503
    );

    expect(mapped.code).toBe('SNAPSHOT_MISSING');
    expect(mapped.message).toContain('temporarily unavailable');
    expect(mapped.message).toContain('2026-02-23');
    expect(isSnapshotOutageCode(mapped.code)).toBe(true);
  });

  it('maps gotchi load auth failures to sign-in guidance', () => {
    const mapped = mapGotchiLoadError({ error: 'Unauthorized' }, 401);

    expect(mapped.code).toBe('AUTH_REQUIRED');
    expect(mapped.message).toContain('Sign the wallet message');
  });

  it('maps API key ownership verification outages', () => {
    const mapped = mapApiKeyCreateError(
      {
        error: 'gotchi_ownership_verification_unavailable',
      },
      503
    );

    expect(mapped.code).toBe('GOTCHI_OWNERSHIP_VERIFICATION_UNAVAILABLE');
    expect(mapped.message).toContain('temporarily unavailable');
  });
});
