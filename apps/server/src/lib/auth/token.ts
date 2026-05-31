import jwt from 'jsonwebtoken';

export const SESSION_COOKIE_NAME = 'dd-session';
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

export interface SessionTokenPayload {
  address: string;
  sessionId: string;
  exp: number;
  iat: number;
}

export interface SignSessionOptions {
  expirationSeconds?: number;
}

export function signSessionToken(
  payload: { address: string; sessionId: string },
  secret: string,
  options?: SignSessionOptions
) {
  const expiresIn = options?.expirationSeconds ?? SESSION_DURATION_SECONDS;

  const body = {
    address: payload.address,
    sessionId: payload.sessionId,
  };

  return jwt.sign(body, secret, {
    expiresIn,
  });
}

export function verifySessionToken(token: string, secret: string) {
  return jwt.verify(token, secret) as SessionTokenPayload;
}
