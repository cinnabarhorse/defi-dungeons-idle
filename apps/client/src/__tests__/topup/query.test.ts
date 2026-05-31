import {
  buildInitialTopupQueryUpdate,
  buildStakeQueryState,
  resolveTopupTokenFromQuery,
} from '../../lib/topup/query';

describe('topup query helpers', () => {
  it('prefills GHST token + amount when token query is empty', () => {
    const update = buildInitialTopupQueryUpdate({
      initialToken: 'GHST',
      initialAmount: 90,
      tokenParam: '',
      amountParam: null,
    });

    expect(update).toEqual({
      token: 'GHST',
      amount: '90',
    });
  });

  it('maps GHST mode to a GHST token query value', () => {
    const query = buildStakeQueryState({
      mode: 'GHST',
      selectedStakeThreshold: 100,
      normalizedGhstStaked: 10,
      totalStaked: 0,
    });

    expect(query).toEqual({
      token: 'GHST',
      amount: '90',
    });
  });

  it('maps unknown token params to USDC', () => {
    expect(resolveTopupTokenFromQuery(null)).toBe('USDC');
    expect(resolveTopupTokenFromQuery('')).toBe('USDC');
    expect(resolveTopupTokenFromQuery('invalid')).toBe('USDC');
  });
});
