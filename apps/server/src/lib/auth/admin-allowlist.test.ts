import { DEFAULT_ADMIN_ADDRESS } from '../constants';
import { isAdminWalletAddress } from './admin-allowlist';

describe('admin allowlist helper', () => {
  const originalAllowlist = process.env.ADMIN_WALLET_ALLOWLIST;

  beforeEach(() => {
    if (originalAllowlist === undefined) {
      delete process.env.ADMIN_WALLET_ALLOWLIST;
    } else {
      process.env.ADMIN_WALLET_ALLOWLIST = originalAllowlist;
    }
  });

  afterAll(() => {
    if (originalAllowlist === undefined) {
      delete process.env.ADMIN_WALLET_ALLOWLIST;
    } else {
      process.env.ADMIN_WALLET_ALLOWLIST = originalAllowlist;
    }
  });

  it('accepts default admin address when env allowlist is unset', () => {
    expect(isAdminWalletAddress(DEFAULT_ADMIN_ADDRESS)).toBe(true);
    expect(isAdminWalletAddress(DEFAULT_ADMIN_ADDRESS.toUpperCase())).toBe(true);
  });

  it('uses ADMIN_WALLET_ALLOWLIST when provided', () => {
    process.env.ADMIN_WALLET_ALLOWLIST = '0xabc,0xdef';
    expect(isAdminWalletAddress('0xABC')).toBe(true);
    expect(isAdminWalletAddress('0xdef')).toBe(true);
    expect(isAdminWalletAddress('0x123')).toBe(false);
  });
});
