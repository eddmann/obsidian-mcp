import crypto from 'crypto';

export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url');
}

export function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: 'S256' | 'plain',
): boolean {
  if (method === 'plain') {
    return codeVerifier === codeChallenge;
  }

  const hash = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return hash === codeChallenge;
}
