import { SiweMessage } from 'siwe';

export class SiweVerificationError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = 'siwe_verification_failed') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface VerifySiwePayloadInput {
  message: string;
  signature: string;
  isSmartWallet?: boolean;
  expectedDomain: string;
  baseChainId: number;
  validateNonce: (nonce: string) => boolean;
  allowedDomains?: string[];
}

export interface VerifiedSiwePayload {
  address: string;
  nonce: string;
  chainId: number;
  domain: string | null;
}

function parseAddressNonceAndChainFromRawMessage(message: string): {
  address: string | null;
  nonce: string | null;
  chainId: number | null;
} {
  const addressMatch = message.match(/0x[a-fA-F0-9]{40}/);
  const nonceMatch = message.match(/Nonce:\s*([a-fA-F0-9]+)/i);
  const chainIdMatch = message.match(/Chain ID:\s*(\d+)/i);

  return {
    address: addressMatch ? addressMatch[0] : null,
    nonce: nonceMatch ? nonceMatch[1].trim() : null,
    chainId: chainIdMatch ? Number(chainIdMatch[1]) : null,
  };
}

function buildAllowedDomainSet(
  expectedDomain: string,
  extraAllowedDomains: string[] = []
): Set<string> {
  const allowedDomains = new Set<string>([
    expectedDomain,
    ...extraAllowedDomains,
  ]);

  if (process.env.NODE_ENV !== 'production') {
    allowedDomains.add('localhost');
    allowedDomains.add('127.0.0.1');
  }

  return allowedDomains;
}

async function verifySmartWalletSignature(
  address: string,
  message: string,
  signature: string
): Promise<boolean> {
  try {
    const { createPublicClient, http } = await import('viem');
    const { base } = await import('viem/chains');
    const { getAddress } = await import('viem');

    const primaryUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
    const client = createPublicClient({
      chain: base,
      transport: http(primaryUrl),
    });

    const checksummedAddress = getAddress(address as `0x${string}`);
    return await client.verifyMessage({
      address: checksummedAddress,
      message,
      signature: signature as `0x${string}`,
    });
  } catch {
    return false;
  }
}

export async function verifySiwePayload(
  input: VerifySiwePayloadInput
): Promise<VerifiedSiwePayload> {
  const isSmartWallet = input.isSmartWallet === true;

  let siweMessage: SiweMessage | null = null;
  let parsedAddress: string | null = null;
  let parsedNonce: string | null = null;
  let parsedChainId: number | null = null;

  try {
    siweMessage = new SiweMessage(input.message);
    parsedAddress = siweMessage.address || null;
    parsedNonce = siweMessage.nonce || null;
    parsedChainId = siweMessage.chainId || null;
  } catch (parseError) {
    if (!isSmartWallet) {
      throw new SiweVerificationError('Invalid SIWE message', 400, 'invalid_message');
    }
    const parsed = parseAddressNonceAndChainFromRawMessage(input.message);
    parsedAddress = parsed.address;
    parsedNonce = parsed.nonce;
    parsedChainId = parsed.chainId;
    if (!parsedAddress || !parsedNonce) {
      throw new SiweVerificationError(
        'Invalid SIWE message format',
        400,
        'invalid_message_format'
      );
    }
  }

  const address = (parsedAddress || siweMessage?.address || '').trim();
  const nonce = (parsedNonce || siweMessage?.nonce || '').trim();
  const chainId = Number(parsedChainId ?? siweMessage?.chainId ?? NaN);

  if (!address || !nonce) {
    throw new SiweVerificationError(
      'Missing address or nonce in message',
      400,
      'missing_fields'
    );
  }

  if (!input.validateNonce(nonce)) {
    throw new SiweVerificationError('Invalid or expired nonce', 400, 'invalid_nonce');
  }

  if (chainId !== input.baseChainId) {
    throw new SiweVerificationError('Unsupported chain', 400, 'unsupported_chain');
  }

  if (siweMessage) {
    const allowedDomains = buildAllowedDomainSet(
      input.expectedDomain,
      input.allowedDomains ?? []
    );
    if (!allowedDomains.has(siweMessage.domain)) {
      throw new SiweVerificationError(
        'SIWE domain not allowed',
        400,
        'domain_not_allowed'
      );
    }
  }

  const verified = isSmartWallet
    ? await verifySmartWalletSignature(address, input.message, input.signature)
    : await siweMessage!
        .verify({
          signature: input.signature,
          domain: siweMessage!.domain,
          nonce: siweMessage!.nonce,
        })
        .then((result) => result.success)
        .catch(() => false);

  if (!verified) {
    throw new SiweVerificationError(
      'Signature verification failed',
      401,
      'invalid_signature'
    );
  }

  return {
    address: address.toLowerCase(),
    nonce,
    chainId,
    domain: siweMessage?.domain ?? null,
  };
}
