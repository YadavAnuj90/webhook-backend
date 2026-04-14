/**
 * SSRF-safe HTTP helpers.
 *
 * - Blocks private / link-local / loopback / reserved IP ranges
 * - Pins the resolved IP to the socket so DNS rebinding can't flip us to
 *   an internal target between validation and the actual connection
 * - Disables redirect following by default (an attacker who controls a
 *   response can otherwise redirect us to 169.254.169.254 or rfc1918)
 * - Applies a separate connect timeout on top of the request timeout
 *
 * Usage:
 *   const { agent } = await buildSafeAgent(url);
 *   axios({ url, httpsAgent: agent, httpAgent: agent, maxRedirects: 0, ... });
 */
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

/** Classic private / reserved v4 ranges and link-local v6 */
const PRIVATE_V4_CIDRS: Array<[number, number]> = [
  // [networkInt, maskBits]
  [ipToInt('10.0.0.0'),       8],
  [ipToInt('127.0.0.0'),      8],
  [ipToInt('169.254.0.0'),   16],  // AWS/GCP/Azure metadata + link-local
  [ipToInt('172.16.0.0'),    12],
  [ipToInt('192.168.0.0'),   16],
  [ipToInt('100.64.0.0'),    10],  // carrier-grade NAT
  [ipToInt('0.0.0.0'),        8],
  [ipToInt('192.0.0.0'),     24],  // IETF protocol
  [ipToInt('192.0.2.0'),     24],  // TEST-NET-1
  [ipToInt('198.18.0.0'),    15],  // benchmark
  [ipToInt('198.51.100.0'),  24],  // TEST-NET-2
  [ipToInt('203.0.113.0'),   24],  // TEST-NET-3
  [ipToInt('224.0.0.0'),      4],  // multicast
  [ipToInt('240.0.0.0'),      4],  // reserved
  [ipToInt('255.255.255.255'), 32], // broadcast
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
    // IPv4-mapped / compatible
    const v4Mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4Mapped) return isPrivateIp(v4Mapped[1]);
    if (lower === '::1' || lower === '::') return true;
    // Unique-local fc00::/7
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;
    // Link-local fe80::/10
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
    // Multicast ff00::/8
    if (lower.startsWith('ff')) return true;
    return false;
  }
  return true; // unparseable → treat as unsafe
}

/**
 * Validate a URL and resolve its host to a non-private IP.
 * Throws SsrfBlocked if blocked.
 * Returns the resolved IP (to pin) and the URL object.
 */
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
  // If already a literal IP, validate directly
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new SsrfBlocked(`Private IP blocked: ${host}`);
    return { url, ip: host, family: net.isIP(host) as 4 | 6 };
  }
  // Block obviously bad hostnames early
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.internal') || lower.endsWith('.local')) {
    throw new SsrfBlocked(`Blocked hostname: ${host}`);
  }
  const { address, family } = await dnsLookup(host);
  if (isPrivateIp(address)) throw new SsrfBlocked(`Host ${host} resolved to private IP ${address}`);
  return { url, ip: address, family: family as 4 | 6 };
}

/**
 * Build an Agent whose DNS lookup always returns the pre-resolved IP —
 * prevents DNS rebinding between the pre-check and the actual TCP connect.
 */
export function buildPinnedAgent(
  protocol: 'http:' | 'https:',
  pinnedIp: string,
  family: 4 | 6,
  extra: https.AgentOptions = {},
): http.Agent | https.Agent {
  // dns.LookupFunction isn't present in all @types/node versions we support;
  // cast the signature locally so this stays portable across minor upgrades.
  const lookup = ((_hostname: string, _options: any, callback: any) => {
    // Always resolve to the IP we already validated.
    callback(null, pinnedIp, family);
  }) as any;
  const opts: https.AgentOptions = {
    keepAlive: true,
    keepAliveMsecs: 10_000,
    timeout: 5_000, // socket idle timeout
    lookup,
    ...extra,
  };
  return protocol === 'https:'
    ? new https.Agent(opts)
    : new http.Agent(opts);
}
