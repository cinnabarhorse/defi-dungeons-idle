jest.mock('siwe', () => ({
  SiweMessage: jest.fn(),
}));

import { SiweMessage } from 'siwe';
import { verifySiwePayload, SiweVerificationError } from './siwe-verify';

describe('verifySiwePayload', () => {
  const mockValidateNonce = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateNonce.mockReturnValue(true);

    (SiweMessage as unknown as jest.Mock).mockImplementation(() => ({
      address: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
      nonce: 'nonce-1',
      chainId: 8453,
      domain: 'aavegotchi.com',
      verify: jest.fn().mockResolvedValue({ success: true }),
    }));
  });

  it('returns normalized payload for valid EOA SIWE message', async () => {
    const result = await verifySiwePayload({
      message: 'valid-message',
      signature: '0xsig',
      expectedDomain: 'aavegotchi.com',
      baseChainId: 8453,
      validateNonce: mockValidateNonce,
      allowedDomains: [],
    });

    expect(result.address).toBe('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd');
    expect(result.nonce).toBe('nonce-1');
    expect(result.chainId).toBe(8453);
    expect(mockValidateNonce).toHaveBeenCalledWith('nonce-1');
  });

  it('rejects invalid nonce', async () => {
    mockValidateNonce.mockReturnValue(false);

    await expect(
      verifySiwePayload({
        message: 'valid-message',
        signature: '0xsig',
        expectedDomain: 'aavegotchi.com',
        baseChainId: 8453,
        validateNonce: mockValidateNonce,
      })
    ).rejects.toMatchObject({
      status: 400,
      code: 'invalid_nonce',
      message: 'Invalid or expired nonce',
    });
  });

  it('rejects unsupported chain id', async () => {
    (SiweMessage as unknown as jest.Mock).mockImplementation(() => ({
      address: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
      nonce: 'nonce-1',
      chainId: 1,
      domain: 'aavegotchi.com',
      verify: jest.fn().mockResolvedValue({ success: true }),
    }));

    await expect(
      verifySiwePayload({
        message: 'valid-message',
        signature: '0xsig',
        expectedDomain: 'aavegotchi.com',
        baseChainId: 8453,
        validateNonce: mockValidateNonce,
      })
    ).rejects.toMatchObject({
      status: 400,
      code: 'unsupported_chain',
    });
  });

  it('rejects disallowed domain', async () => {
    (SiweMessage as unknown as jest.Mock).mockImplementation(() => ({
      address: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
      nonce: 'nonce-1',
      chainId: 8453,
      domain: 'evil.example',
      verify: jest.fn().mockResolvedValue({ success: true }),
    }));

    await expect(
      verifySiwePayload({
        message: 'valid-message',
        signature: '0xsig',
        expectedDomain: 'aavegotchi.com',
        baseChainId: 8453,
        validateNonce: mockValidateNonce,
      })
    ).rejects.toMatchObject({
      status: 400,
      code: 'domain_not_allowed',
    });
  });

  it('rejects invalid signatures', async () => {
    (SiweMessage as unknown as jest.Mock).mockImplementation(() => ({
      address: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
      nonce: 'nonce-1',
      chainId: 8453,
      domain: 'aavegotchi.com',
      verify: jest.fn().mockResolvedValue({ success: false }),
    }));

    await expect(
      verifySiwePayload({
        message: 'valid-message',
        signature: '0xsig',
        expectedDomain: 'aavegotchi.com',
        baseChainId: 8453,
        validateNonce: mockValidateNonce,
      })
    ).rejects.toMatchObject({
      status: 401,
      code: 'invalid_signature',
    });
  });

  it('throws invalid message format for smart wallet payloads missing nonce/address', async () => {
    (SiweMessage as unknown as jest.Mock).mockImplementation(() => {
      throw new Error('cannot parse');
    });

    await expect(
      verifySiwePayload({
        message: 'bad message',
        signature: '0xsig',
        isSmartWallet: true,
        expectedDomain: 'aavegotchi.com',
        baseChainId: 8453,
        validateNonce: mockValidateNonce,
      })
    ).rejects.toMatchObject({
      status: 400,
      code: 'invalid_message_format',
    });
  });
});
