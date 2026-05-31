/** @jest-environment jsdom */

import { openTopup, TOPUP_ROUTE } from '../../lib/topup/routes';

describe('topup routes', () => {
  it('uses the canonical /me/topup route', () => {
    expect(TOPUP_ROUTE).toBe('/me/topup');
  });

  it('opens the canonical route in a new tab by default', () => {
    const openSpy = jest
      .spyOn(window, 'open')
      .mockImplementation(() => null);

    openTopup();

    expect(openSpy).toHaveBeenCalledWith(TOPUP_ROUTE, '_blank');
    openSpy.mockRestore();
  });
});
