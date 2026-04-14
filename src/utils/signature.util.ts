import {
  createHmac,
  generateKeyPairSync,
  sign,
  verify,
  createPrivateKey,
  createPublicKey,
  timingSafeEqual,
} from 'crypto';

/** Constant-time compare of two hex signatures. Returns false on any length mismatch. */
function safeEqHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ba.length === 0 || ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export class SignatureUtil {
  /** HMAC-SHA256 (default) */
  static generate(payload: string, secret: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${payload}`;
    const signature = createHmac('sha256', secret).update(signedPayload).digest('hex');
    return `t=${timestamp},v1=${signature}`;
  }

  static verify(payload: string, secret: string, signatureHeader: string, toleranceSeconds = 300): boolean {
    try {
      const parts = signatureHeader.split(',');
      const timestamp = parseInt(parts.find(p => p.startsWith('t='))?.split('=')[1] || '0', 10);
      const receivedSig = parts.find(p => p.startsWith('v1='))?.split('=')[1];
      if (!receivedSig || !timestamp) return false;
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - timestamp) > toleranceSeconds) return false;
      const expectedSig = createHmac('sha256', secret)
        .update(`${timestamp}.${payload}`).digest('hex');
      return safeEqHex(expectedSig, receivedSig);
    } catch { return false; }
  }

  /** Generate an Ed25519 key pair. privateKey is stored in the endpoint, publicKey is shared with consumers. */
  static generateEd25519KeyPair(): { privateKey: string; publicKey: string } {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    return { privateKey, publicKey };
  }

  /** Sign payload with Ed25519 private key. Returns base64 signature. */
  static generateEd25519(payload: string, privateKeyPem: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${payload}`;
    const privateKey = createPrivateKey(privateKeyPem);
    const sig = sign(null, Buffer.from(signedPayload), privateKey).toString('base64');
    return `t=${timestamp},v2=${sig}`;
  }

  /** Verify Ed25519 signature using public key PEM. */
  static verifyEd25519(payload: string, publicKeyPem: string, signatureHeader: string, toleranceSeconds = 300): boolean {
    try {
      const parts = signatureHeader.split(',');
      const timestamp = parseInt(parts.find(p => p.startsWith('t='))?.split('=')[1] || '0', 10);
      const sigB64 = parts.find(p => p.startsWith('v2='))?.split('=')[1];
      if (!sigB64 || !timestamp) return false;
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - timestamp) > toleranceSeconds) return false;
      const signedPayload = `${timestamp}.${payload}`;
      const publicKey = createPublicKey(publicKeyPem);
      // verify() is itself constant-time at the EVP level.
      return verify(null, Buffer.from(signedPayload), publicKey, Buffer.from(sigB64, 'base64'));
    } catch { return false; }
  }
}
