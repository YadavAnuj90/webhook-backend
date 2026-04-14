import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGO = 'aes-256-gcm';

export class PayloadCrypto {
  private static cachedKey: Buffer | null | undefined = undefined;
  private static cachedPrevKey: Buffer | null | undefined = undefined;

  private static parseKey(raw: string | undefined | null): Buffer | null {
    if (!raw) return null;

    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');

    try {
      const b = Buffer.from(raw, 'base64');
      if (b.length === 32 && b.toString('base64').replace(/=+$/, '') === raw.replace(/=+$/, '')) {
        return b;
      }
    } catch {  }

    if (raw.length >= 32) return createHash('sha256').update(raw, 'utf8').digest();

    throw new Error(
      'Encryption key is set but too weak. Provide 64 hex chars (32 bytes), ' +
      'a base64 string that decodes to 32 bytes, or ≥32 chars of high-entropy secret.',
    );
  }

  private static resolveKey(): Buffer | null {
    if (this.cachedKey !== undefined) return this.cachedKey;
    this.cachedKey = this.parseKey(process.env.PAYLOAD_ENCRYPTION_KEY) ?? null;
    return this.cachedKey;
  }

  private static resolvePrevKey(): Buffer | null {
    if (this.cachedPrevKey !== undefined) return this.cachedPrevKey;
    this.cachedPrevKey = this.parseKey(process.env.PAYLOAD_ENCRYPTION_KEY_PREVIOUS) ?? null;
    return this.cachedPrevKey;
  }

  private static currentVersion(): string {
    return process.env.PAYLOAD_ENCRYPTION_KEY_VERSION || 'v1';
  }

  private static previousVersion(): string {
    return process.env.PAYLOAD_ENCRYPTION_KEY_PREVIOUS_VERSION || 'v0';
  }

  static resetKeyCache(): void {
    this.cachedKey = undefined;
    this.cachedPrevKey = undefined;
  }

  static isEnabled(): boolean {
    return !!process.env.PAYLOAD_ENCRYPTION_KEY;
  }

  static encrypt(plaintext: string): string {
    const key = this.resolveKey();
    if (!key) return plaintext;
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `enc:${this.currentVersion()}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  static decrypt(ciphertext: string): string {
    if (!ciphertext || !ciphertext.startsWith('enc:')) return ciphertext;
    const parts = ciphertext.split(':');

    let version: string | null = null;
    let ivHex: string | undefined, tagHex: string | undefined, dataHex: string | undefined;

    if (parts.length === 5) {
      [, version, ivHex, tagHex, dataHex] = parts;
    } else if (parts.length === 4) {
      [, ivHex, tagHex, dataHex] = parts;
    } else {
      return ciphertext;
    }
    if (!ivHex || !tagHex || !dataHex) return ciphertext;

    const currentKey = this.resolveKey();
    const prevKey    = this.resolvePrevKey();

    const pickKey = (): Buffer | null => {
      if (!version) return prevKey ?? currentKey;
      if (version === this.currentVersion()) return currentKey;
      if (prevKey && version === this.previousVersion()) return prevKey;

      return currentKey ?? prevKey ?? null;
    };

    const primary = pickKey();
    if (!primary) return ciphertext;

    const tryDecrypt = (key: Buffer): string | null => {
      try {
        const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex!, 'hex'));
        decipher.setAuthTag(Buffer.from(tagHex!, 'hex'));
        return decipher.update(Buffer.from(dataHex!, 'hex')).toString('utf8') + decipher.final('utf8');
      } catch {
        return null;
      }
    };

    const first = tryDecrypt(primary);
    if (first !== null) return first;

    const secondary = primary === currentKey ? prevKey : currentKey;
    if (secondary) {
      const second = tryDecrypt(secondary);
      if (second !== null) return second;
    }

    throw new Error('payload decryption failed: no configured key could decrypt this ciphertext');
  }

  static isCurrent(ciphertext: string): boolean {
    if (!ciphertext || !ciphertext.startsWith('enc:')) return true;
    const parts = ciphertext.split(':');
    if (parts.length === 4) return false;
    if (parts.length === 5) return parts[1] === this.currentVersion();
    return false;
  }

  static encryptMaybe(v: string | null | undefined): string | null {
    if (v === null || v === undefined || v === '') return (v as any) ?? null;
    return this.encrypt(v);
  }
  static decryptMaybe(v: string | null | undefined): string | null {
    if (v === null || v === undefined || v === '') return (v as any) ?? null;
    return this.decrypt(v);
  }
}
