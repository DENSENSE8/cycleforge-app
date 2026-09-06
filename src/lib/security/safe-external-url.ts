import 'server-only';

import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

/**
 * SSRF guard for any URL that arrives in a request body / webhook payload and
 * is later fetched or redirected to by the server.
 *
 * Two layers, because they run at different times:
 *   - `assertSafeExternalUrl` — synchronous, structural. Safe to call on a
 *     write path (upsert/assign) where a DNS round-trip would be both slow and
 *     pointless: DNS at write time says nothing about DNS at fetch time.
 *   - `assertSafeExternalUrlResolved` / `fetchSafeExternal` — the structural
 *     checks *plus* an actual `dns.lookup`, applied to every redirect hop. This
 *     is the layer that stops DNS-rebinding and `http://x.oastify.com` →
 *     `169.254.169.254` style redirects.
 *
 * Everything is https-only and public-unicast-only. There is no allowlist knob:
 * a caller that legitimately needs an internal host should not be routed
 * through user-supplied URLs at all.
 */

export class UnsafeExternalUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeExternalUrlError';
  }
}

/** Hostnames that never resolve to a routable public target. */
const BLOCKED_HOSTNAMES: Record<string, true> = {
  localhost: true,
  'localhost.localdomain': true,
  'ip6-localhost': true,
  'ip6-loopback': true,
  metadata: true,
  'metadata.google.internal': true,
  'instance-data': true,
};

/** Suffixes reserved for LAN / service-mesh names (RFC 6762, RFC 8375, k8s). */
const BLOCKED_SUFFIXES = [
  '.localhost',
  '.local',
  '.localdomain',
  '.internal',
  '.intranet',
  '.home.arpa',
  '.cluster.local',
];

function parseIPv4(host: string): number[] | null {
  if (isIP(host) !== 4) return null;
  return host.split('.').map((part) => Number(part));
}

/**
 * True when an IPv4 address is loopback, link-local, RFC1918, CGNAT, "this
 * network", benchmark, multicast, or reserved — i.e. anything that is not
 * globally routable unicast.
 */
function isBlockedIPv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8 — includes 0.0.0.0 itself
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 + 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmark
  if (a === 198 && b === 51) return true; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0) return true; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + 255.255.255.255
  return false;
}

/** Expand an IPv6 literal to its 8 groups, or null when unparseable. */
function expandIPv6(host: string): number[] | null {
  if (isIP(host) !== 6) return null;
  const [headRaw, tailRaw] = host.split('::');
  const split = host.includes('::');
  const head = headRaw ? headRaw.split(':').filter(Boolean) : [];
  const tail = split && tailRaw ? tailRaw.split(':').filter(Boolean) : [];
  const parts = split ? [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail] : head;

  // Trailing dotted-quad form (::ffff:127.0.0.1, 64:ff9b::8.8.8.8).
  const last = parts[parts.length - 1];
  if (last && last.includes('.')) {
    const v4 = parseIPv4(last);
    if (!v4) return null;
    parts.splice(parts.length - 1, 1,
      ((v4[0] << 8) | v4[1]).toString(16),
      ((v4[2] << 8) | v4[3]).toString(16));
  }
  if (parts.length !== 8) return null;
  return parts.map((p) => parseInt(p || '0', 16));
}

/**
 * True when an IPv6 address is unspecified, loopback, link-local, ULA,
 * multicast, or embeds a blocked IPv4 (v4-mapped, NAT64, 6to4, Teredo).
 */
function isBlockedIPv6(groups: number[]): boolean {
  const [g0, g1] = groups;

  // ::/128 unspecified and ::1/128 loopback.
  if (groups.slice(0, 7).every((g) => g === 0) && (groups[7] === 0 || groups[7] === 1)) return true;

  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((g0 & 0xff00) === 0xff00) return true; // ff00::/8 multicast

  const embeddedV4 = (hi: number, lo: number): number[] => [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];

  // ::ffff:a.b.c.d — IPv4-mapped.
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return isBlockedIPv4(embeddedV4(groups[6], groups[7]));
  }
  // 64:ff9b::/96 NAT64.
  if (g0 === 0x0064 && g1 === 0xff9b) {
    return isBlockedIPv4(embeddedV4(groups[6], groups[7]));
  }
  // 2002::/16 6to4 carries the v4 in groups 1-2.
  if (g0 === 0x2002) {
    return isBlockedIPv4(embeddedV4(groups[1], groups[2]));
  }
  // 2001:0::/32 Teredo carries the (obfuscated) server v4 in groups 2-3.
  if (g0 === 0x2001 && g1 === 0x0000) return true;

  return false;
}

/** True when a literal IP string points at a non-public target. */
function isBlockedAddress(address: string): boolean {
  const v4 = parseIPv4(address);
  if (v4) return isBlockedIPv4(v4);
  const v6 = expandIPv6(address);
  if (v6) return isBlockedIPv6(v6);
  return true; // not parseable as either family → refuse
}

function stripBrackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

/**
 * Structural SSRF gate: parses `raw`, requires `https:`, rejects embedded
 * credentials, and refuses any hostname that is (or literally is) a loopback /
 * link-local / RFC1918 / CGNAT / ULA / multicast / reserved / IPv4-mapped-IPv6
 * target. Throws `UnsafeExternalUrlError`; returns the parsed `URL` on success.
 */
export function assertSafeExternalUrl(raw: string): URL {
  const value = String(raw || '').trim();
  if (!value) throw new UnsafeExternalUrlError('URL is required');

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UnsafeExternalUrlError('URL is not valid');
  }

  if (url.protocol !== 'https:') {
    throw new UnsafeExternalUrlError(`URL is not valid: only https: is allowed (got ${url.protocol})`);
  }
  if (url.username || url.password) {
    throw new UnsafeExternalUrlError('URL is not valid: credentials in the URL are not allowed');
  }

  const hostname = stripBrackets(url.hostname).toLowerCase();
  if (!hostname) throw new UnsafeExternalUrlError('URL is not valid: missing host');
  if (BLOCKED_HOSTNAMES[hostname] || BLOCKED_SUFFIXES.some((s) => hostname.endsWith(s))) {
    throw new UnsafeExternalUrlError(`URL is not valid: ${hostname} is an internal host`);
  }
  if (isIP(hostname) !== 0 && isBlockedAddress(hostname)) {
    throw new UnsafeExternalUrlError(`URL is not valid: ${hostname} is not a public address`);
  }

  return url;
}

/** Non-throwing form of `assertSafeExternalUrl` — for redirect/link sinks. */
export function isSafeExternalUrl(raw: string | null | undefined): boolean {
  try {
    assertSafeExternalUrl(String(raw || ''));
    return true;
  } catch {
    return false;
  }
}

/**
 * `assertSafeExternalUrl` plus a real DNS lookup: every A/AAAA record the
 * hostname resolves to must be public unicast, so a public name pointing at
 * 169.254.169.254 (or a rebind) is refused before any socket is opened.
 */
export async function assertSafeExternalUrlResolved(raw: string): Promise<URL> {
  const url = assertSafeExternalUrl(raw);
  const hostname = stripBrackets(url.hostname).toLowerCase();
  if (isIP(hostname) !== 0) return url; // literal already validated

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeExternalUrlError(`URL is not valid: ${hostname} does not resolve`);
  }
  if (addresses.length === 0) {
    throw new UnsafeExternalUrlError(`URL is not valid: ${hostname} does not resolve`);
  }
  for (const { address } of addresses) {
    if (isBlockedAddress(address)) {
      throw new UnsafeExternalUrlError(
        `URL is not valid: ${hostname} resolves to a non-public address (${address})`,
      );
    }
  }
  return url;
}

export interface SafeExternalFetchOptions extends Omit<RequestInit, 'redirect' | 'signal'> {
  /** Redirect hops to follow; each hop is re-validated. Default 3. */
  maxRedirects?: number;
  /** Whole-request budget in ms (spread across hops). Default 15000. */
  timeoutMs?: number;
}

/**
 * Fetch a caller-supplied URL with the SSRF guard applied to the initial target
 * AND to every redirect hop (`redirect: 'manual'`, bounded to `maxRedirects`),
 * under an abort timeout. Never follows a redirect the guard rejects.
 */
export async function fetchSafeExternal(
  raw: string,
  init: SafeExternalFetchOptions = {},
): Promise<Response> {
  const { maxRedirects = 3, timeoutMs = 15_000, ...rest } = init;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = (await assertSafeExternalUrlResolved(raw)).toString();

    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      const res = await fetch(current, {
        ...rest,
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
      });

      if (res.status < 300 || res.status > 399) return res;

      const location = res.headers.get('location');
      if (!location) return res;

      // Drain so the socket is released before we chase the next hop.
      await res.arrayBuffer().catch(() => undefined);

      const next = new URL(location, current).toString();
      current = (await assertSafeExternalUrlResolved(next)).toString();
    }

    throw new UnsafeExternalUrlError(`URL is not valid: too many redirects (> ${maxRedirects})`);
  } finally {
    clearTimeout(timer);
  }
}
