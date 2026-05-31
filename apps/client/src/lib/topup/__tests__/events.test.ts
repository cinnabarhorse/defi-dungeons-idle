import {
  TOPUP_DEPOSIT_CREDITED_EVENT,
  dispatchTopupDepositCredited,
} from '../events';

describe('topup credited event dispatch', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      });
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  });

  it('dispatches the credited event once per transaction hash', () => {
    const eventTarget = new EventTarget();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: eventTarget,
    });

    const received: string[] = [];
    window.addEventListener(TOPUP_DEPOSIT_CREDITED_EVENT, (event) => {
      const detail = (event as CustomEvent<{ txHash: string }>).detail;
      received.push(detail.txHash);
    });

    dispatchTopupDepositCredited({
      txHash:
        '0xABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234',
      token: 'GHST',
    });
    dispatchTopupDepositCredited({
      txHash:
        '0xabcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
      token: 'GHST',
    });

    expect(received).toEqual([
      '0xabcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
    ]);
  });
});
