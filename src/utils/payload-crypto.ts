import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGO = 'aes-256-gcm';

/**
 * AES-256-GCM envelope for sensitive fields at rest.
 *
 * Key resolution (PAYLOAD_ENCRYPTION_KEY, in order):
 *   1. 64 hex chars  → 32 raw bytes
 *   2. base64 that decodes to exactly 32 bytes → use as-is
 *   3. any other string ≥ 32 chars            → SHA-256 derive (stable, idempotent)
 *   4. string < 32 chars                      → HARD FAIL (don't silently zero-pad)
 *
 * If the env var is unset, encryption is transparently disabled
 * (encrypt/decrypt act as identity) so dev environments still work.
 */
export class PayloadCrypto {
  private static cachedKey: Buffer | null | undefined = undefined; // tri-state

  private static resolveKey(): Buffer | null {
    if (this.cachedKey !== undefined) return this.cachedKey;
    const raw = process.env.PAYLOAD_ENCRYPTION_KEY;
    if (!raw) { this.cachedKey = null; return null; }

    // 1. hex (64 chars)
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      this.cachedKey = Buffer.from(raw, 'hex');
      return this.cachedKey;
    }
    // 2. base64 decoding to 32 bytes
    try {
      const b = Buffer.from(raw, 'base64');
      if (b.length === 32 && b.toString('base64').replace(/=+$/, '') === raw.replace(/=+$/, '')) {
        this.cachedKey = b;
        return b;
      }
    } catch { /* ignore */ }
    // 3. derive from high-entropy long secret
    if (raw.length >= 32) {
      this.cachedKey = createHash('sha256').update(raw, 'utf8').digest();
      return this.cachedKey;
    }
    // 4. refuse weak keys outright
    throw new Error(
      'PAYLOAD_ENCRYPTION_KEY is set but too weak. Provide 64 hex chars (32 bytes), ' +
      'a base64 string that decodes to 32 bytes, or ≥32 chars of high-entropy secret.',
    );
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
    return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  static decrypt(ciphertext: string): string {
    if (!ciphertext || !ciphertext.startsWith('enc:')) return ciphertext;
    const key = this.resolveKey();
    if (!key) return ciphertext;
    const [, ivHex, tagHex, dataHex] = ciphertext.split(':');
    if (!ivHex || !tagHex || !dataHex) return ciphertext;
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(dataHex, 'hex')).toString('utf8') + decipher.final('utf8');
  }

  /** Convenience for optional fields. */
  static encryptMaybe(v: string | null | undefined): string | null {
    if (v === null || v === undefined || v === '') return (v as any) ?? null;
    return this.encrypt(v);
  }
  static decryptMaybe(v: string | null | undefined): string | null {
    if (v === null || v === undefined || v === '') return (v as any) ?? null;
    return this.decrypt(v);
  }
}
