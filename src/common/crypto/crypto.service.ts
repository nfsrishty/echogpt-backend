import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export interface EncryptedValue {
  ciphertext: string;
  iv: string;
  authTag: string;
}

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // the size GCM is designed for

/**
 * AES-256-GCM encryption for secrets we must be able to read back
 * (AI provider API keys). GCM also produces an auth tag, so any tampering
 * with the stored ciphertext is detected on decryption.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(configService: ConfigService) {
    this.key = Buffer.from(
      configService.getOrThrow<string>('ENCRYPTION_KEY'),
      'hex',
    );
  }

  encrypt(plainText: string): EncryptedValue {
    // A fresh random IV every time: encrypting the same key twice
    // gives different ciphertexts, so equal keys can't be spotted.
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);

    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  decrypt(value: EncryptedValue): string {
    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(value.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(value.authTag, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
