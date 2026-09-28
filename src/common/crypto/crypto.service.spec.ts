import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { CryptoService } from './crypto.service';

const serviceWithKey = (hexKey: string) =>
  new CryptoService({
    getOrThrow: () => hexKey,
  } as unknown as ConfigService);

describe('CryptoService (AES-256-GCM)', () => {
  const key = randomBytes(32).toString('hex');
  const crypto = serviceWithKey(key);

  it('decrypts what it encrypted', () => {
    const secret = 'sk-proj-abc123-very-secret';
    expect(crypto.decrypt(crypto.encrypt(secret))).toBe(secret);
  });

  it('never produces the same ciphertext twice (random IV)', () => {
    const a = crypto.encrypt('same-key');
    const b = crypto.encrypt('same-key');
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it('does not leak the plaintext into any stored field', () => {
    const stored = JSON.stringify(crypto.encrypt('sk-plaintext-marker'));
    expect(stored).not.toContain('plaintext-marker');
  });

  it('detects tampering via the auth tag', () => {
    const value = crypto.encrypt('sk-original');
    const bytes = Buffer.from(value.ciphertext, 'base64');
    bytes[0] ^= 0xff; // flip bits in the stored ciphertext
    expect(() =>
      crypto.decrypt({ ...value, ciphertext: bytes.toString('base64') }),
    ).toThrow();
  });

  it('cannot be decrypted with a different key', () => {
    const value = crypto.encrypt('sk-original');
    const other = serviceWithKey(randomBytes(32).toString('hex'));
    expect(() => other.decrypt(value)).toThrow();
  });
});
