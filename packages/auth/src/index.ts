import jwt from 'jsonwebtoken';

export const SESSION_COOKIE_NAME = 'dd-session';
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 1 week

export interface SessionTokenPayload {
  address: string;
  exp: number;
  iat: number;
}

export interface SignSessionOptions {
  expirationSeconds?: number;
}

export function signSessionToken(
  address: string,
  secret: string,
  options?: SignSessionOptions
) {
  const expiresIn = options?.expirationSeconds ?? SESSION_DURATION_SECONDS;

  return jwt.sign(
    { address },
    secret,
    {
      expiresIn,
    }
  );
}

export function verifySessionToken(token: string, secret: string) {
  return jwt.verify(token, secret) as SessionTokenPayload;
}

