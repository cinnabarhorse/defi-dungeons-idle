export interface ApiErrorPayload {
  error?: string;
  message?: string;
  code?: string;
  details?: string;
  date?: string;
}

export interface MappedClientError {
  message: string;
  code: string | null;
}

const SNAPSHOT_OUTAGE_CODES = new Set([
  'SNAPSHOT_MISSING',
  'SNAPSHOT_VERIFICATION_UNAVAILABLE',
  'GOTCHI_OWNERSHIP_VERIFICATION_UNAVAILABLE',
]);

const OWNERSHIP_REQUIRED_CODES = new Set([
  'WALLET_NOT_ELIGIBLE',
  'GOTCHI_OWNERSHIP_REQUIRED',
]);

function stringOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeCode(raw: string | undefined): string | null {
  if (!raw) return null;
  return raw.trim().replace(/[-\s]+/g, '_').toUpperCase();
}

export function parseApiErrorPayload(payload: unknown): ApiErrorPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }

  const record = payload as Record<string, unknown>;
  return {
    error: stringOrUndefined(record.error),
    message: stringOrUndefined(record.message),
    code: stringOrUndefined(record.code),
    details: stringOrUndefined(record.details),
    date: stringOrUndefined(record.date),
  };
}

function resolveErrorCode(parsed: ApiErrorPayload): string | null {
  const direct = normalizeCode(parsed.code);
  if (direct) return direct;

  const fromError = normalizeCode(parsed.error);
  if (fromError && (SNAPSHOT_OUTAGE_CODES.has(fromError) || OWNERSHIP_REQUIRED_CODES.has(fromError))) {
    return fromError;
  }

  return null;
}

function mapSnapshotOutageMessage(date: string | undefined): string {
  if (date) {
    return `Aavegotchi ownership verification is temporarily unavailable for ${date}. Please try again in a few minutes.`;
  }
  return 'Aavegotchi ownership verification is temporarily unavailable. Please try again in a few minutes.';
}

export function isSnapshotOutageCode(code: string | null | undefined): boolean {
  return Boolean(code && SNAPSHOT_OUTAGE_CODES.has(normalizeCode(code) || ''));
}

export function isOwnershipRequiredCode(
  code: string | null | undefined
): boolean {
  return Boolean(code && OWNERSHIP_REQUIRED_CODES.has(normalizeCode(code) || ''));
}

export function mapAuthVerifyError(
  payload: unknown,
  status: number
): MappedClientError {
  const parsed = parseApiErrorPayload(payload);
  const code = resolveErrorCode(parsed);

  if (isSnapshotOutageCode(code)) {
    return {
      code,
      message: mapSnapshotOutageMessage(parsed.date),
    };
  }

  if (isOwnershipRequiredCode(code)) {
    return {
      code,
      message:
        'This wallet is not eligible today. Own at least one Aavegotchi NFT and sign in again.',
    };
  }

  const details = parsed.details?.toLowerCase() ?? '';
  const message = parsed.message?.toLowerCase() ?? '';
  const error = parsed.error?.toLowerCase() ?? '';
  if (
    details.includes('invalid signature') ||
    message.includes('invalid signature') ||
    error.includes('invalid signature')
  ) {
    return {
      code: 'SIGNATURE_INVALID',
      message: 'Signature verification failed. Please sign the message again.',
    };
  }

  if (status === 401 || status === 403) {
    return {
      code: 'AUTH_REQUIRED',
      message: 'Authentication required. Sign the wallet message to continue.',
    };
  }

  if (status >= 500) {
    return {
      code: 'AUTH_SERVICE_UNAVAILABLE',
      message: 'Authentication service is temporarily unavailable. Please try again shortly.',
    };
  }

  return {
    code,
    message:
      parsed.details ||
      parsed.message ||
      parsed.error ||
      'Failed to verify wallet signature.',
  };
}

export function mapGotchiLoadError(
  payload: unknown,
  status: number
): MappedClientError {
  const parsed = parseApiErrorPayload(payload);
  const code = resolveErrorCode(parsed);

  if (isSnapshotOutageCode(code)) {
    return {
      code,
      message: mapSnapshotOutageMessage(parsed.date),
    };
  }

  if (isOwnershipRequiredCode(code)) {
    return {
      code,
      message:
        'This wallet does not meet today\'s Aavegotchi ownership requirement.',
    };
  }

  if (status === 401) {
    return {
      code: 'AUTH_REQUIRED',
      message:
        'Authentication required. Sign the wallet message to load your Aavegotchis.',
    };
  }

  if (status === 403) {
    return {
      code: 'AUTH_FORBIDDEN',
      message:
        'Access denied for this wallet session. Please reconnect and try again.',
    };
  }

  if (status >= 500) {
    return {
      code: 'GOTCHI_SERVICE_UNAVAILABLE',
      message: 'Unable to load Aavegotchis right now. Please try again shortly.',
    };
  }

  return {
    code,
    message:
      parsed.message ||
      parsed.error ||
      'Failed to load Aavegotchi data.',
  };
}

export function mapApiKeyCreateError(
  payload: unknown,
  status: number
): MappedClientError {
  const parsed = parseApiErrorPayload(payload);
  const code = resolveErrorCode(parsed);

  if (isSnapshotOutageCode(code)) {
    return {
      code,
      message: mapSnapshotOutageMessage(parsed.date),
    };
  }

  if (isOwnershipRequiredCode(code)) {
    return {
      code,
      message:
        'At least one owned Aavegotchi NFT is required to create an API key.',
    };
  }

  if (status === 401) {
    return {
      code: 'AUTH_REQUIRED',
      message: 'Sign in with your wallet to manage API keys.',
    };
  }

  if (status >= 500) {
    return {
      code: 'API_KEYS_UNAVAILABLE',
      message: 'API key service is temporarily unavailable. Please try again shortly.',
    };
  }

  return {
    code,
    message:
      parsed.message ||
      parsed.error ||
      'Failed to create API key.',
  };
}
