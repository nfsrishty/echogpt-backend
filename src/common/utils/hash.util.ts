import { createHash, timingSafeEqual } from 'crypto';

/**
 * SHA-256 for high-entropy secrets (refresh tokens, verification tokens).
 * Not for passwords: passwords are low-entropy and need a slow hash (bcrypt).
 */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Constant-time comparison, so response timing leaks nothing. */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}
