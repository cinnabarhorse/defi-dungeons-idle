import { subtractCurrencyTotalsSeries } from '../stats';

describe('stats forge helpers', () => {
  it('subtracts forge gold spend from the running total gold series', () => {
    const result = subtractCurrencyTotalsSeries(
      [
        { day: '2026-03-22', total: 1000 },
        { day: '2026-03-23', total: 1200 },
        { day: '2026-03-24', total: 1500 },
      ],
      [
        { day: '2026-03-22', total: 0 },
        { day: '2026-03-23', total: 100 },
        { day: '2026-03-24', total: 300 },
      ]
    );

    expect(result).toEqual([
      { day: '2026-03-22', total: 1000 },
      { day: '2026-03-23', total: 1100 },
      { day: '2026-03-24', total: 1200 },
    ]);
  });
});
