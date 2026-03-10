// signature.util.ts
import { createHmac } from 'crypto';

export class SignatureUtil {
  static generate(payload: string, secret: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${payload}`;
    const signature = createHmac('sha256', secret).update(signedPayload).digest('hex');
    return `t=${timestamp},v1=${signature}`;
  }

  static verify(payload: string, secret: string, signatureHeader: string, toleranceSeconds = 300): boolean {
    try {
      const parts = signatureHeader.split(',');
      const timestamp = parseInt(parts.find(p => p.startsWith('t='))?.split('=')[1] || '0');
      const receivedSig = parts.find(p => p.startsWith('v1='))?.split('=')[1];
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - timestamp) > toleranceSeconds) return false;
      const expectedSig = createHmac('sha256', secret)
        .update(`${timestamp}.${payload}`).digest('hex');
      return expectedSig === receivedSig;
    } catch { return false; }
  }
}
