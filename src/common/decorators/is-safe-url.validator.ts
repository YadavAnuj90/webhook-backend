import { registerDecorator, ValidationOptions, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { isPrivateIp } from '../../utils/safe-http';
import * as net from 'net';

@ValidatorConstraint({ name: 'IsSafeUrl', async: false })
export class IsSafeUrlConstraint implements ValidatorConstraintInterface {
  validate(value: any): boolean {
    if (typeof value !== 'string' || !value) return false;
    let u: URL;
    try { u = new URL(value); } catch { return false; }
    const protocol = u.protocol.replace(':', '').toLowerCase();
    if (protocol !== 'http' && protocol !== 'https') return false;
    const host = u.hostname.toLowerCase();
    if (!host) return false;
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return false;
    if (net.isIP(host) && isPrivateIp(host)) return false;

    if (!net.isIP(host) && !host.includes('.')) return false;
    return true;
  }
  defaultMessage(): string {
    return 'url must be a public http(s) URL with a TLD (private / internal hosts are not allowed)';
  }
}

export function IsSafeUrl(options?: ValidationOptions) {
  return (object: Object, propertyName: string) => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsSafeUrlConstraint,
    });
  };
}
