
import * as net from 'net';
import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

export class SsrfBlocked extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlocked';
  }
}

const PRIVATE_V4_CIDRS: Array<[number, number]> = [

  [ipToInt('10.0.0.0'),       8],
  [ipToInt('127.0.0.0'),      8],
  [ipToInt('169.254.0.0'),   16],
  [ipToInt('172.16.0.0'),    12],
  [ipToInt('192.168.0.0'),   16],
  [ipToInt('100.64.0.0'),    10],
  [ipToInt('0.0.0.0'),        8],
  [ipToInt('192.0.0.0'),     24],
  [ipToInt('192.0.2.0'),     24],
  [ipToInt('198.18.0.0'),    15],
  [ipToInt('198.51.100.0'),  24],
  [ipToInt('203.0.113.0'),   24],
  [ipToInt('224.0.0.0'),      4],
  [ipToInt('240.0.0.0'),      4],
  [ipToInt('255.255.255.255'), 32],
];

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
}

export function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  const family = net.isIP(ip);
  if (family === 4) {
    const int = ipToInt(ip);
    return PRIVATE_V4_CIDRS.some(([net_, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (int & mask) === (net_ & mask);
    });
  }
  if (family === 6) {
    const lower = ip.toLowerCase();

    const v4Mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4Mapped) return isPrivateIp(v4Mapped[1]);
    if (lower === '::1' || lower === '::') return true;

    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;

    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;

    if (lower.startsWith('ff')) return true;
    return false;
  }
  return true;
}

export async function assertSafeUrl(
  rawUrl: string,
  opts: { allowHttp?: boolean } = {},
): Promise<{ url: URL; ip: string; family: 4 | 6 }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlocked(`Invalid URL: ${rawUrl}`);
  }
  const protocol = url.protocol.replace(':', '').toLowerCase();
  if (protocol !== 'https' && !(protocol === 'http' && (opts.allowHttp ?? process.env.NODE_ENV !== 'production'))) {
    throw new SsrfBlocked(`Blocked protocol: ${protocol}`);
  }
  const host = url.hostname;
  if (!host) throw new SsrfBlocked('Missing host');

  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new SsrfBlocked(`Private IP blocked: ${host}`);
    return { url, ip: host, family: net.isIP(host) as 4 | 6 };
  }

  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.internal') || lower.endsWith('.local')) {
    throw new SsrfBlocked(`Blocked hostname: ${host}`);
  }
  const { address, family } = await dnsLookup(host);
  if (isPrivateIp(address)) throw new SsrfBlocked(`Host ${host} resolved to private IP ${address}`);
  return { url, ip: address, family: family as 4 | 6 };
}

export function buildPinnedAgent(
  protocol: 'http:' | 'https:',
  pinnedIp: string,
  family: 4 | 6,
  extra: https.AgentOptions = {},
): http.Agent | https.Agent {

  const lookup = ((_hostname: string, _options: any, callback: any) => {

    callback(null, pinnedIp, family);
  }) as any;
  const opts: https.AgentOptions = {
    keepAlive: true,
    keepAliveMsecs: 10_000,
    timeout: 5_000,
    lookup,
    ...extra,
  };
  return protocol === 'https:'
    ? new https.Agent(opts)
    : new http.Agent(opts);
}
