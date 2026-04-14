export class PiiScrubber {

  static scrub(
    payload: Record<string, any>,
    fields: string[],
    mask = '[REDACTED]',
  ): Record<string, any> {
    const clone = JSON.parse(JSON.stringify(payload));
    for (const field of fields) {
      const parts = field.split('.');
      let obj = clone;
      for (let i = 0; i < parts.length - 1; i++) {
        if (obj && typeof obj === 'object') {
          obj = obj[parts[i]];
        } else {
          obj = null;
          break;
        }
      }
      if (obj && typeof obj === 'object' && parts[parts.length - 1] in obj) {
        obj[parts[parts.length - 1]] = mask;
      }
    }
    return clone;
  }
}
