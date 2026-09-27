import * as bcrypt from 'bcryptjs';

/** Cost factor 12 ≈ 250 ms per hash: cheap for one login, ruinous for brute force. */
export const BCRYPT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
