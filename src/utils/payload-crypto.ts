import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';

export class PayloadCrypto {
  private static getKey(): Buffer | null {
    const key = process.env.PAYLOAD_ENCRYPTION_KEY || '';
    if (!key) return null;
    return Buffer.from(key.padEnd(32, '0').slice(0, 32));
  }

  static isEnabled(): boolean {
    return !!process.env.PAYLOAD_ENCRYPTION_KEY;
  }

  static encrypt(plaintext: string): string {
    const key = this.getKey();
    if (!key) return plaintext;
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString(
      'hex',
    )}`;
  }

  static decrypt(ciphertext: string): string {
    if (!ciphertext.startsWith('enc:')) return ciphertext;
    const key = this.getKey();
    if (!key) return ciphertext;
    const [, ivHex, tagHex, dataHex] = ciphertext.split(':');
    const decipher = createDecipheriv(
      ALGO,
      key,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return (
      decipher.update(Buffer.from(dataHex, 'hex')).toString('utf8') +
      decipher.final('utf8')
    );
  }
}
