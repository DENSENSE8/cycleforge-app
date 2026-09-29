/** tracking-format.ts ───────────────────────────────────────────────────────────────── Single source of truth for tracking number… */

// ─── Carrier type ────────────────────────────────────────────────────────────

export type Carrier =
  | 'UPS'
  | 'USPS'
  | 'FedEx'
  | 'FEDEX'
  | 'DHL'
  | 'AMAZON'
  | 'OnTrac'
  | 'LaserShip'
  | 'GSO'
  | 'Unknown';

// ─── Normalization ───────────────────────────────────────────────────────────

export function normalizeTrackingCanonical(input: string): string {
  return String(input || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** Null-safe alias of normalizeTrackingCanonical — used as a dedup/map key. */
export function normalizeTrackingKey(value: string | null | undefined): string {
  return normalizeTrackingCanonical(String(value || ''));
}

/** Strip the USPS IMpb routing prefix (420 + ZIP/ZIP+4) from barcode scans. */
function stripUspsRoutingPrefix(input: string): string {
  const clean = normalizeTrackingCanonical(input);
  if (!clean.startsWith('420') || clean.length < 28) return clean;

  // Try 5-digit ZIP prefix (420XXXXX = 8 chars)
  if (clean.length >= 28 && clean.length <= 30) {
    const after5 = clean.slice(8);
    if (/^9\d{19,21}$/.test(after5)) return after5;
  }

  // Try 9-digit ZIP+4 prefix (420XXXXXXXXX = 12 chars)
  if (clean.length >= 32 && clean.length <= 34) {
    const after9 = clean.slice(12);
    if (/^9\d{19,21}$/.test(after9)) return after9;
  }

  return clean;
}

/**
 * USPS IMpb barcode scans may prepend `420` + ZIP/ZIP+4. Return the carrier-
 * searchable 9x number only when that routing envelope is valid and present.
 * The raw scan remains the full-copy payload and audit identity.
 */
export function uspsSearchableTrackingNumber(input: string): string | null {
  const clean = normalizeTrackingCanonical(input);
  const searchable = stripUspsRoutingPrefix(clean);
  return searchable && searchable !== clean ? searchable : null;
}

/** Collapse a tracking value that is the *same* number repeated back-to-back. */
function collapseRepeatedTracking(input: string): string {
  const clean = normalizeTrackingCanonical(input);
  const len = clean.length;
  if (len < 24) return clean; // shortest doubled tracking is 2 × 12 chars
  for (const n of [2, 3]) {
    if (len % n !== 0) continue;
    const unit = len / n;
    if (unit < 12) continue;
    const first = clean.slice(0, unit);
    let allMatch = true;
    for (let i = 1; i < n; i++) {
      if (clean.slice(i * unit, (i + 1) * unit) !== first) { allMatch = false; break; }
    }
    if (allMatch) return first;
  }
  return clean;
}

/** FedEx GS1-128 / "96" concatenated-barcode envelope. */
const FEDEX_GS1_CONCAT_RE = /^96\d{31,32}$/;

/** Strip the FedEx GS1-128 / "96" concatenated-barcode envelope down to the human-readable carrier tracking number. */
export function stripFedexConcatPrefix(input: string): string {
  const clean = normalizeTrackingCanonical(input);
  // Only a 96-prefixed GS1 concat label is an envelope to unwrap. Everything
  // else — every USPS 92/93/94/95 number, every already-human FedEx number, any
  // shorter/longer string — is returned untouched.
  if (!FEDEX_GS1_CONCAT_RE.test(clean)) return clean;
  // FedEx human tracking lengths, longest-first. Accept the longest trailing
  // slice that (a) is shorter than the full label and (b) detects as FedEx.
  for (const n of [15, 12]) {
    if (clean.length <= n) continue;
    const tail = clean.slice(-n);
    if (detectCarrier(tail) === 'FedEx') return tail;
  }
  return clean;
}

/** Normalize tracking number, collapsing exact repeats and stripping USPS routing prefix. */
export const normalizeTrackingNumber = (input: string): string =>
  stripUspsRoutingPrefix(collapseRepeatedTracking(normalizeTrackingCanonical(input)));

/** Canonical match/display key for a tracking number — the single normalizer the receiving scan + paste boundaries should run every value… */
export function extractCanonicalTracking(input: string): string {
  return stripFedexConcatPrefix(normalizeTrackingNumber(input));
}

/**
 * Return a shorter carrier-searchable number only when the supplied value is
 * a real barcode/routing envelope. The caller keeps the original for audit
 * and “copy full”; this value powers the explicit “copy shortened” action.
 */
export function searchableTrackingNumber(input: string): string | null {
  const clean = normalizeTrackingCanonical(input);
  const canonical = extractCanonicalTracking(input);
  return canonical && canonical !== clean ? canonical : null;
}

export function normalizeTrackingKey18(input: string): string {
  const normalized = normalizeTrackingCanonical(input);
  if (!normalized) return '';
  return normalized.length > 18 ? normalized.slice(-18) : normalized;
}

export function normalizeTrackingLast8(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length >= 8) {
    return digitsOnly.slice(-8);
  }

  return trimmed;
}

/** Packing / outbound order-match ladder keys for a raw gun scan or paste. */
export function orderTrackingMatchKeys(rawScan: string): {
  exact: string;
  key18: string;
  last8: string;
} {
  const exact = extractCanonicalTracking(rawScan);
  return {
    exact,
    key18: normalizeTrackingKey18(exact),
    last8: normalizeTrackingLast8(exact),
  };
}

export function last8FromStoredTracking(input: string): string {
  const digitsOnly = String(input || '').replace(/\D/g, '');
  return digitsOnly.slice(-8);
}

// ─── Carrier detection ──────────────────────────────────────────────────────
//
// Delegates to the canonical pattern list in utils/carrier-patterns.ts.
// This keeps one set of patterns shared with scan-resolver.ts.

import { detectCarrierFromTracking, toDisplayCarrier } from '@/utils/carrier-patterns';

/**
 * Detect carrier from a tracking number string.
 * Returns a display-friendly carrier name (UPS, FedEx, USPS, DHL, Amazon,
 * OnTrac, LaserShip, GSO, Unknown).
 */
export function detectCarrier(tracking: string): Carrier {
  const code = detectCarrierFromTracking(tracking);
  if (!code) return 'Unknown';
  const display = toDisplayCarrier(code);
  // Map display names back to the Carrier union for backward compatibility
  switch (display) {
    case 'UPS':       return 'UPS';
    case 'FedEx':     return 'FedEx';
    case 'USPS':      return 'USPS';
    case 'DHL':       return 'DHL';
    case 'Amazon':    return 'AMAZON';
    case 'OnTrac':    return 'OnTrac';
    case 'LaserShip': return 'LaserShip';
    case 'GSO':       return 'GSO';
    default:          return 'Unknown';
  }
}

/** Convenience alias matching the old utils/tracking.ts API name. */
export const getCarrier = detectCarrier;

// ─── Tracking URL builders ──────────────────────────────────────────────────

function isBlankTracking(tracking: string): boolean {
  const t = String(tracking || '').trim();
  return !t || t === 'Not available' || t === 'N/A'; // ds-allow-na: tracking empty-vocab reader
}

/**
 * Build a carrier tracking URL when the carrier is already known.
 * Returns null for empty tracking or unrecognized carriers (never Google —
 * callers that want a search URL must opt in explicitly).
 */
export function getTrackingUrlByCarrier(tracking: string, carrier: string): string | null {
  if (isBlankTracking(tracking)) return null;
  const t = String(tracking).trim();
  const c = String(carrier || '').toUpperCase().trim();
  if (!c) return null;
  if (c.includes('UPS'))    return `https://www.ups.com/track?tracknum=${t}`;
  if (c.includes('FEDEX'))  return `https://www.fedex.com/apps/fedextrack/?tracknumbers=${t}`;
  if (c.includes('USPS'))   return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}`;
  if (c.includes('DHL'))    return `https://www.dhl.com/en/express/tracking.html?AWB=${t}`;
  if (c.includes('AMAZON')) return `https://www.amazon.com/progress-tracker/package/ref=pt_redirect_from_gp?trackingId=${t}`;
  if (c.includes('ONTRAC')) return `https://www.ontrac.com/trackingresults.asp?tracking_number=${t}`;
  if (c.includes('LASERSHIP') || c.includes('LASER SHIP')) {
    return `https://www.lasership.com/track/${t}`;
  }
  // GSO was acquired by GLS US — official track host is gls-us.
  if (c.includes('GSO') || (c.includes('GLS') && c.includes('US'))) {
    return `https://www.gls-us.com/trackshipment?TrackingNumber=${t}`;
  }
  return null;
}

/**
 * Build a carrier tracking URL by auto-detecting the carrier.
 * Returns null for empty/invalid tracking numbers or unrecognized patterns.
 */
export function getTrackingUrl(tracking: string): string | null {
  if (isBlankTracking(tracking)) return null;
  const t = String(tracking).trim();
  const carrier = detectCarrier(t);
  switch (carrier) {
    case 'UPS':
      return `https://www.ups.com/track?track=yes&trackNums=${t}&loc=en_US&requester=ST/trackdetails`;
    case 'USPS':
      return `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${t}`;
    case 'FedEx':
    case 'FEDEX':
      return `https://www.fedex.com/fedextrack/?trknbr=${t}`;
    case 'DHL':
      return `https://www.dhl.com/en/express/tracking.html?AWB=${t}`;
    case 'AMAZON':
      return `https://www.amazon.com/progress-tracker/package/ref=pt_redirect_from_gp?trackingId=${t}`;
    case 'OnTrac':
      return `https://www.ontrac.com/trackingresults.asp?tracking_number=${t}`;
    case 'LaserShip':
      return `https://www.lasership.com/track/${t}`;
    case 'GSO':
      return `https://www.gls-us.com/trackshipment?TrackingNumber=${t}`;
    default:
      return null;
  }
}

/**
 * Open-href SoT for filled tracking chips / rows.
 *
 * Ladder: stored/label `knownCarrier` → local pattern detect → official carrier
 * deep link. Never returns a Google search URL; unknown → null (Open disabled).
 */
export function resolveTrackingOpenUrl(
  tracking: string,
  knownCarrier?: string | null,
): string | null {
  if (isBlankTracking(tracking)) return null;
  const t = String(tracking).trim();
  const hint = String(knownCarrier || '').trim();
  if (hint) {
    const byCarrier = getTrackingUrlByCarrier(t, hint);
    if (byCarrier) return byCarrier;
  }
  return getTrackingUrl(t);
}
