/** Barcode routing helpers — used by the mobile scan flow and by anywhere the app needs to classify an inbound scan or paste. */

import { inventoryLocationsHref, LOCATIONS_BAY_CODE_RE } from '@/lib/inventory/locations-path';
import { scannedFnsku } from '@/lib/scan-resolver';
import { supportHref } from '@/lib/nav/route-tree';
import {
  detectCarrierFromTracking,
  toDisplayCarrier,
  type DisplayCarrier,
} from '@/utils/carrier-patterns';

export type ScanType =
  | 'sku'
  | 'bin'
  | 'receiving'        // R-class — carton handle
  | 'receiving-line'   // L-class — single line within a carton
  | 'serial-unit'      // U-class — one physical unit
  | 'handling-unit'    // H-class — a license-plated box/tray (LPN)
  | 'manifest'         // KIT-class — a preboxed kit master label (label_manifests)
  | 'support-ticket'   // T-class — provider ticket id → Tasks › Support Find
  | 'carrier-tracking'
  | 'sscc'
  | 'bin-paired-order'
  | 'fnsku';           // Amazon FBA unit label (X00…) — the phone opens /m/fnsku/{fnsku}

export interface ScanRoute {
  type: ScanType;
  value: string;
  /** When set, callers should navigate here (relative path within the app). */
  redirect?: string;
  carrier?: DisplayCarrier;
  orderRef?: string;
}

// The one shared answer to "is this GLN real?" — see the note where
// DEFAULT_GLN used to live. Pure + client-safe, so this stays a client module.
import { isLicensedGln } from '@/lib/interop/gs1-keys';
import { canonicalRackCode } from '@/lib/locations/rack-code';

const MOBILE_PATH_RE = /\/m\/(r|l|u|h)\/([^/?#\s]+)/i;
const SKU_STOCK_LOCATION_RE = /\/sku-stock\/location\/([^/?#\s]+)/i;
// GS1 Digital Link — capture gtin and optional serial after /21/.
// Exported so the GS1 resolver (src/lib/gs1/parser.ts) can reuse the
// same fast-path regex without re-declaring it.
export const GS1_PATH_RE = /\/01\/(\d{8,14})(?:\/21\/([^/?#\s]+))?/i;
// GS1 Digital Link for a warehouse location:
export const GS1_LOCATION_RE = /\/414\/(\d+)\/254\/([^/?#\s]+)/i;

// Raw GS1 AI string emitted by industrial DataMatrix scanners.
const GS1_AI_LOCATION_FNC1_RE = /414(\d{13})(?:\x1D|\x1E)?254([^\x1D\x1E]+)/i;
const GS1_AI_LOCATION_PARENS_RE = /\(414\)(\d{13})\(254\)([^()]+)/i;

// Unit/serial product label — `(01)gtin(21)serial[(10)batch]`.
const GS1_AI_UNIT_FNC1_RE = /01(\d{14})(?:\x1D)?21([^\x1D]+?)(?:\x1D10([^\x1D]+))?$/i;
const GS1_AI_UNIT_PARENS_RE = /\(01\)(\d{14})\(21\)([^()]+)(?:\(10\)([^()]+))?/i;

// Human-readable dashed location code — `A-01-01-1` / `A-01-01-1-01`.
const DASHED_LOCATION_RE = /^([A-Z])-(\d{2})-(\d{2})-(\d{1,2})(?:-(\d{2}))?$/i;

// Flat location code — the undashed form `locationCodeFlat()` emits and `locations.barcode` stores:
const LOCATION_FLAT_RE = /^[A-Z]\d{7,8}$/i;

// Punctuation-stripped platform Digital Link — see the RECOVERY branch in
// `routeScan`. Right-anchored so a tenant slug containing `m` ("mycompany")
// cannot be mistaken for the `/m/` path segment. The optional `qc` tail is the
// carton label's `/m/r/{id}/qc` (it opens the carton's quality control).
const FLATTENED_MOBILE_LINK_RE = /^https?.*m([rluh])(\d+)(?:qc)?$/i;

function normalizeForeignLabel(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

const SSCC_PARENS_RE = /^\(00\)(\d{18})$/;
const SSCC_FNC1_RE = /^\x1D00(\d{18})$/;
const SSCC_BARE_RE = /^(\d{18})$/;

/** The single-label shapes the fixed-length arm has always taken, routed with `detectCarrierFromTracking`. */
const CARRIER_TRACKING_SHAPES: ReadonlyArray<RegExp> = [
  /^\d{10}$/,
  /^\d{12}$/,
  /^\d{15}$/,
  /^\d{20}$/,
  /^\d{22}$/,
];

/**
 * Marketplace order numbers — eBay `NN-NNNNN-NNNNN`, Amazon `NNN-NNNNNNN-NNNNNNN`,
 * and Amazon's 17-digit form with the dashes dropped (`11[1-4]…`). They are
 * printed on pack slips next to the carrier label and are never tracking —
 * stripped of dashes an eBay order number is 12 digits and used to route as
 * FedEx.
 */
const MARKETPLACE_ORDER_NUMBER_RE = /^(?:\d{2}-\d{5}-\d{5}|\d{3}-\d{7}-\d{7}|11[1-4]\d{14})$/;

export function isMarketplaceOrderNumber(raw: string): boolean {
  return MARKETPLACE_ORDER_NUMBER_RE.test(String(raw ?? '').trim());
}

/**
 * FedEx 2D (PDF417 / MaxiCode) payload — `[)>01…` or the bare `0102…` read: the
 * 12-digit tracking sits immediately before the `FDEG` service field. Some
 * wedges render each GS separator as the literal digits `029`.
 */
const FEDEX_2D_TRACKING_RE = /(\d{12})\x1D?FDEG/i;
const FEDEX_2D_RENDERED_GS_RE = /029840029/;
const FEDEX_2D_RENDERED_TRACKING_RE = /(\d{12})029FDEG/i;

/**
 * USPS AI 420 routing envelope: `420` + ZIP5 or ZIP9, an optional separator
 * (GS, `]` as some wedges show GS, or the literal `029`), then the IMpb
 * (`9` + 20/21/22/26 digits total).
 */
const USPS_420_ENVELOPE_RE = /^420(?:\d{5}|\d{9})(?:\x1D|\]|029)?(9(?:\d{19}|\d{20}|\d{21}|\d{25}))$/;
/** USPS IMpb lengths the fixed 20/22 shapes do not take — 21 and 26 digits. */
const USPS_IMPB_21_26_RE = /^9[1-5](?:\d{19}|\d{24})$/;
/** UPS — `1Z` + alphanumerics, including the short / mistyped reads. */
const UPS_1Z_RE = /^1Z[A-Z0-9]{6,}$/;
/** Two UPS labels read as one: the first 18-character `1Z` number, then another `1Z`. */
const UPS_1Z_GLUED_RE = /^(1Z[A-Z0-9]{16})1Z[A-Z0-9]+$/;
const AMAZON_TBA_RE = /^TBA\d{10,13}$/;
/** UPU S10 international postal item — `LM221449617CA`. */
const UPU_S10_RE = /^[A-Z]{2}\d{9}[A-Z]{2}$/;

/** Regional / 3PL shapes seen at the door (Phase 0 scan corpus). */
const REGIONAL_TRACKING_SHAPES: ReadonlyArray<{ re: RegExp; carrier: DisplayCarrier }> = [
  { re: /^(?:UUSC?|USC)[A-Z0-9]{10,}$/, carrier: 'Unknown' }, // UniUni
  { re: /^YT\d{16}$/, carrier: 'Unknown' },                   // YunExpress
  { re: /^GFUS\d{10,}$/, carrier: 'Unknown' },                // GoFo
  { re: /^JJD\d{18}$/, carrier: 'Unknown' },                  // J&T
  { re: /^SWX\d{10,}$/, carrier: 'Unknown' },                 // SpeedX
  { re: /^ALS\d{10,}$/, carrier: 'Unknown' },
  { re: /^BBY01\d{12}$/, carrier: 'Unknown' },
  { re: /^E[MSX]\d{13}[A-Z0-9]{13}$/, carrier: 'Unknown' },   // Cainiao-style
  { re: /^D\d{14}$/, carrier: 'OnTrac' },
];

/** FedEx 34-digit barcode, any prefix — the tracking is the last 12 digits. */
const FEDEX_34_RE = /^\d{34}$/;

/**
 * Glued double scan — the first known envelope at the head of a longer digit
 * run. `(?=\d)` keeps these to runs that continue past the envelope.
 */
const GLUED_USPS_420_RE = /^420(?:\d{5}|\d{9})(?:029)?(9\d{21})(?=\d)/;
const GLUED_USPS_IMPB_RE = /^(9[1-5]\d{20})(?=9[1-5]\d{20}|420)/;
const GLUED_FEDEX_34_RE = /^(96\d{32})(?=\d)/;

/** A bare GS1 GTIN element string (`01` + GTIN-14) — a product label, not tracking. */
const GS1_GTIN_ELEMENT_RE = /^01\d{14}$/;

type CarrierTrackingHit = { tracking: string; carrier: DisplayCarrier };

function fedex2dTracking(line: string): string | null {
  if (!/FDEG/i.test(line)) return null;
  const re = FEDEX_2D_RENDERED_GS_RE.test(line) ? FEDEX_2D_RENDERED_TRACKING_RE : FEDEX_2D_TRACKING_RE;
  return re.exec(line)?.[1] ?? null;
}

/** One line of a scan → the carrier tracking it carries, unwrapped, or null. */
function carrierTrackingInLine(line: string): CarrierTrackingHit | null {
  if (MARKETPLACE_ORDER_NUMBER_RE.test(line)) return null;

  const fedex2d = fedex2dTracking(line);
  if (fedex2d) return { tracking: fedex2d, carrier: 'FedEx' };

  const v = normalizeForeignLabel(line);
  if (!v) return null;

  const usps = USPS_420_ENVELOPE_RE.exec(v);
  if (usps) return { tracking: usps[1], carrier: 'USPS' };

  const upsGlued = UPS_1Z_GLUED_RE.exec(v);
  if (upsGlued) return { tracking: upsGlued[1], carrier: 'UPS' };
  if (UPS_1Z_RE.test(v)) return { tracking: v, carrier: 'UPS' };

  if (AMAZON_TBA_RE.test(v)) return { tracking: v, carrier: 'Amazon' };
  if (UPU_S10_RE.test(v)) {
    return { tracking: v, carrier: toDisplayCarrier(detectCarrierFromTracking(v)) };
  }
  const regional = REGIONAL_TRACKING_SHAPES.find((shape) => shape.re.test(v));
  if (regional) return { tracking: v, carrier: regional.carrier };

  if (!/^\d+$/.test(v)) return null;

  if (CARRIER_TRACKING_SHAPES.some((re) => re.test(v))) {
    return { tracking: v, carrier: toDisplayCarrier(detectCarrierFromTracking(v)) };
  }
  if (USPS_IMPB_21_26_RE.test(v)) return { tracking: v, carrier: 'USPS' };
  if (FEDEX_34_RE.test(v)) return { tracking: v.slice(-12), carrier: 'FedEx' };

  const gluedUsps = GLUED_USPS_420_RE.exec(v) ?? GLUED_USPS_IMPB_RE.exec(v);
  if (gluedUsps) return { tracking: gluedUsps[1], carrier: 'USPS' };
  const gluedFedex = GLUED_FEDEX_34_RE.exec(v);
  if (gluedFedex) return { tracking: gluedFedex[1].slice(-12), carrier: 'FedEx' };

  // Any other long digit run (truncated / unknown envelope) is still a carrier
  // read — the server's last-8 resolver decides. 18 digits is an SSCC.
  if (v.length >= 16 && v.length !== 18 && !GS1_GTIN_ELEMENT_RE.test(v)) {
    return { tracking: v, carrier: toDisplayCarrier(detectCarrierFromTracking(v)) };
  }
  return null;
}

export function scannedSscc(raw: string): string | null {
  const v = normalizeForeignLabel(String(raw ?? '').trim());
  if (!v) return null;
  const m = SSCC_PARENS_RE.exec(v) ?? SSCC_FNC1_RE.exec(v) ?? SSCC_BARE_RE.exec(v);
  return m ? m[1] : null;
}

/**
 * The carrier tracking a scan carries, unwrapped from its envelope (USPS 420 +
 * ZIP, FedEx 34 / 2D, glued double scans). A multi-line read (pack slip) takes
 * the first line that is a tracking number.
 */
export function scannedCarrierTracking(raw: string): CarrierTrackingHit | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const lines = text.split(/\r\n|\r|\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const hit = carrierTrackingInLine(line);
    if (hit) return hit;
  }
  return null;
}

function pathToRoute(path: string, value: string): ScanRoute | null {
  const m = MOBILE_PATH_RE.exec(path);
  if (m) {
    const [, classKey, idRaw] = m;
    const id = decodeURIComponent(idRaw);
    switch (classKey.toLowerCase()) {
      case 'r':
        return { type: 'receiving',      value, redirect: `/m/r/${id}` };
      case 'l':
        return { type: 'receiving-line', value, redirect: `/m/l/${id}` };
      case 'u':
        return { type: 'serial-unit',    value, redirect: `/m/u/${id}` };
      case 'h':
        return { type: 'handling-unit',  value, redirect: `/m/h/${id}` };
      default:
        return null;
    }
  }
  const binMatch = SKU_STOCK_LOCATION_RE.exec(path);
  if (binMatch) {
    const barcode = decodeURIComponent(binMatch[1]);
    return { type: 'bin', value, redirect: `/inventory?bin=${barcode}` };
  }
  // GS1 location label printed by the Location Label Printer.
  const gs1Loc = GS1_LOCATION_RE.exec(path);
  if (gs1Loc) {
    const code = decodeURIComponent(gs1Loc[2]).toUpperCase();
    const rack = canonicalRackCode(code);
    if (rack) return { type: 'bin', value: rack, redirect: `/inventory?bin=${rack}` };
    // position=00 means this label identifies a whole rack (zone/aisle/
    // bay/level), not a single bin slot. Route to the rack-detail view.
    if (isRackCode(code)) {
      return {
        type: 'bin',
        value: code,
        redirect: inventoryLocationsHref({ tab: 'bays', extra: { code } }),
      };
    }
    return { type: 'bin', value: code, redirect: `/inventory?bin=${code}` };
  }
  // GS1 Digital Link form. Page-side resolvers translate gtin → sku and
  // serial → unit at runtime, so we just dispatch to the catch-all paths.
  const gs1 = GS1_PATH_RE.exec(path);
  if (gs1) {
    const [, gtin, serial] = gs1;
    if (serial) {
      return { type: 'serial-unit', value, redirect: `/01/${gtin}/21/${decodeURIComponent(serial)}` };
    }
    return { type: 'sku', value, redirect: `/01/${gtin}` };
  }
  return null;
}

/** Route a raw GS1 location code (the flat A0101101 form) to the right view. */
function routeLocationCode(value: string, code: string): ScanRoute {
  // A movable-rack code (`RK12-3`) carried in a GS1 AI 254 payload.
  const rack = canonicalRackCode(code);
  if (rack) return { type: 'bin', value: rack, redirect: `/inventory?bin=${rack}` };
  const normalized = code.toUpperCase();
  // position=00 means this label identifies a whole rack (zone/aisle/bay/
  // level), not a single bin slot. Route to the rack-detail view.
  if (isRackCode(normalized)) {
    return {
      type: 'bin',
      value: normalized,
      redirect: inventoryLocationsHref({ tab: 'bays', extra: { code: normalized } }),
    };
  }
  return { type: 'bin', value: normalized, redirect: `/inventory?bin=${normalized}` };
}

/**
 * Classify a scanned / typed value. Returns null for empty input.
 */
export function routeScan(raw: string): ScanRoute | null {
  const value = raw.trim();
  if (!value) return null;

  // 1. URL form (printed QR payloads) — accept absolute http(s) and bare paths.
  if (/^https?:\/\//i.test(value)) {
    try {
      const u = new URL(value);
      const matched = pathToRoute(u.pathname, value);
      if (matched) return matched;
    } catch {
      /* fall through */
    }
  }
  if (value.startsWith('/')) {
    const matched = pathToRoute(value, value);
    if (matched) return matched;
  }

  // 1b. RECOVERY — a punctuation-stripped Digital Link.
  const flattened = FLATTENED_MOBILE_LINK_RE.exec(value.replace(/[^A-Za-z0-9]/g, ''));
  if (flattened) {
    const [, classKey, id] = flattened;
    const matched = pathToRoute(`/m/${classKey.toLowerCase()}/${id}`, value);
    if (matched) return matched;
  }

  // 2. Raw GS1 AI string from a DataMatrix scan — parens or FNC1 form.
  //    Industrial scanners emit one of these for our location labels.
  const aiParens = GS1_AI_LOCATION_PARENS_RE.exec(value);
  if (aiParens) return routeLocationCode(value, aiParens[2]);
  const aiFnc1 = GS1_AI_LOCATION_FNC1_RE.exec(value);
  if (aiFnc1) return routeLocationCode(value, aiFnc1[2]);

  // 2b. Unit/serial product label — `(01)gtin(21)serial[(10)batch]`.
  //     Routes to the unit detail page; the resolver translates gtin →
  //     sku and serial → unit at runtime.
  const unitParens = GS1_AI_UNIT_PARENS_RE.exec(value);
  if (unitParens) {
    const [, gtin, serial] = unitParens;
    return { type: 'serial-unit', value, redirect: `/01/${gtin}/21/${encodeURIComponent(serial)}` };
  }
  //     The element string starts at its `01` AI: an `01` in the middle of a
  //     longer digit run (a USPS 420 envelope) is not one.
  const unitFnc1 = GS1_AI_UNIT_FNC1_RE.exec(value);
  if (unitFnc1 && !/\d$/.test(value.slice(0, unitFnc1.index))) {
    const [, gtin, serial] = unitFnc1;
    return { type: 'serial-unit', value, redirect: `/01/${gtin}/21/${encodeURIComponent(serial)}` };
  }

  // 3. Bare-handle DataMatrix payloads — these are what receiving carton, receiving line, serial-unit, and repair labels carry now that…
  const rcvShort = /^R[-/](\d+)$/i.exec(value);
  if (rcvShort) return { type: 'receiving',      value, redirect: `/m/r/${rcvShort[1]}` };
  const lineShort = /^L-(\d+)$/i.exec(value);
  if (lineShort) return { type: 'receiving-line', value, redirect: `/m/l/${lineShort[1]}` };
  // U-class unit handle — accepts a numeric serial_units.id OR an alphanumeric physical serial / minted unit_uid suffix.
  const unitShort = /^U-([A-Za-z0-9][A-Za-z0-9-]*)$/i.exec(value);
  if (unitShort && !DASHED_LOCATION_RE.test(value)) {
    return { type: 'serial-unit', value, redirect: `/m/u/${encodeURIComponent(unitShort[1])}` };
  }
  // H-class — a license-plated box/tray (handling unit / LPN).
  const huShort = /^H-(\d+)$/i.exec(value);
  if (huShort) return { type: 'handling-unit',   value, redirect: `/m/h/${huShort[1]}` };

  // T-class — support / claim ticket sticker. Provider ticket id (Zendesk today)
  // opens the desktop Support queue deep-link. Anchored with the other bare
  // handles so "T-9395" isn't swallowed by the letter→bin fallback.
  const ticketShort = /^T-(\d+)$/i.exec(value);
  if (ticketShort) {
    return {
      type: 'support-ticket',
      value,
      redirect: supportHref({ q: ticketShort[1] }),
    };
  }

  // KIT-class — a preboxed kit master label (label_manifests).
  if (/^KIT-/i.test(value)) return { type: 'manifest', value };
  // REP-class repair label.
  const repairShort = /^REP-(\d+)$/i.exec(value);
  if (repairShort) {
    return { type: 'receiving', value, redirect: `/m/rs/${repairShort[1]}` };
  }
  // Legacy RCV-{id} carton string — kept for back-compat with any
  // pre-DataMatrix labels still in the wild.
  const rcv = /^RCV-(\d+)$/i.exec(value);
  if (rcv) {
    return { type: 'receiving', value, redirect: `/m/r/${rcv[1]}` };
  }

  // 3b. Bare minted unit id ({SKU_SHORT}-{YYWW}-{SEQ6}) — what the products label QR now encodes (no GS1).
  if (/^[A-Z0-9][A-Z0-9-]*-\d{4}-\d{6}$/i.test(value)) {
    return { type: 'serial-unit', value, redirect: `/m/u/${encodeURIComponent(value)}` };
  }

  // 3c. Amazon FNSKU — the FBA unit label (`X00` + 7).
  const fnsku = scannedFnsku(value);
  if (fnsku) return { type: 'fnsku', value: fnsku };

  // 4. Static SKU: digit prefix + contains ":".
  if (/^\d/.test(value) && value.includes(':')) return { type: 'sku', value };

  // 5. Bin / rack:
  const dashed = DASHED_LOCATION_RE.exec(value);
  if (dashed) {
    // A sticker without a position (`C-02-09-4`) is the rack-level address `…00`.
    const [, zone, aisle, bay, level, position] = dashed;
    return routeLocationCode(value, `${zone}${aisle}${bay}${level}${position ?? '00'}`.toUpperCase());
  }

  // 5b. FLAT location code — `A0101101`, a zone letter then 7–8 digits.
  if (LOCATION_FLAT_RE.test(value)) {
    return routeLocationCode(value, value.toUpperCase());
  }

  // 5c. Movable rack / shelf / position — `RK12`, `RK12-3`, `RK12-3-2`.
  //     Canonicalized here so every location field (`unwrapScannedLocation`)
  //     and arrival-shelf match sees one spelling. Must stay above step 6.
  const rack = canonicalRackCode(value);
  if (rack) return { type: 'bin', value: rack, redirect: `/inventory?bin=${rack}` };

  // 5d. Foreign labels — an SSCC, then a carrier tracking number (unwrapped
  //     from its envelope). Above step 6 so a letter-led tracking (`TBA…`,
  //     UPU S10, regional) is not swallowed as a bin.
  const sscc = scannedSscc(value);
  if (sscc) return { type: 'sscc', value: sscc };
  const tracking = scannedCarrierTracking(value);
  if (tracking) {
    return { type: 'carrier-tracking', value: tracking.tracking, carrier: tracking.carrier };
  }

  // 6. Bin (legacy fallback): starts with a letter.
  if (/^[A-Za-z]/.test(value)) return { type: 'bin', value };

  // 7. Default fallback → SKU.
  return { type: 'sku', value };
}

/** Back-compat shim for callers that only need the type. */
function detectScanType(raw: string): ScanType {
  return routeScan(raw)?.type ?? 'sku';
}

interface BinPairingLookup {
  (binCode: string): string | null | undefined;
}

export function routeScanPaired(
  raw: string,
  lookup: BinPairingLookup,
): ScanRoute | null {
  const route = routeScan(raw);
  if (!route || route.type !== 'bin') return route;
  const orderRef = lookup(route.value);
  if (!orderRef) return route;
  return { ...route, type: 'bin-paired-order', orderRef };
}

/** For a scan of a **printed unit label**, return the resolvable unit key — the bare serial (`U-{serial}` handle / GS1 `(01)(21)` serial)… */
export function scannedUnitKey(raw: string): string | null {
  const route = routeScan(raw);
  if (!route || route.type !== 'serial-unit') return null;
  const redirect = route.redirect || '';
  const mu = /^\/m\/u\/(.+)$/.exec(redirect);
  if (mu) return decodeURIComponent(mu[1]).trim() || null;
  const gs1 = /^\/01\/\d+\/21\/(.+)$/.exec(redirect);
  if (gs1) return decodeURIComponent(gs1[1]).trim() || null;
  return null;
}

/** Unwrap a value typed or scanned into a **serial** field. */
export function unwrapScannedSerial(raw: string): string {
  return scannedUnitKey(raw) ?? String(raw ?? '').trim();
}

/**
 * For a scan of a **printed location label** (flat `A0101101`, dashed
 * `A-01-01-1`, GS1, URL, rack `RK12-3`), the flat code `locations.barcode`
 * stores; null for anything else — a loose typed spelling (`c02094`) or an item
 * barcode is not a label, so it must never mint a location.
 */
export function printedLocationCode(raw: string): string | null {
  const route = routeScan(raw);
  if (!route || route.type !== 'bin') return null;
  const redirect = route.redirect || '';
  // Extract from the REDIRECT, not `value` — the `/sku-stock/location/{code}`
  // arm returns the whole scanned URL as `value` and only the redirect carries
  // the barcode.
  const bin = /^\/inventory\?bin=(.+)$/.exec(redirect);
  if (bin) return decodeURIComponent(bin[1]).trim() || null;
  const bay = LOCATIONS_BAY_CODE_RE.exec(redirect);
  if (bay) return decodeURIComponent(bay[1]).trim() || null;
  return null;
}

/** Unwrap a value typed or scanned into a **bin / location** field. */
export function unwrapScannedLocation(raw: string): string {
  const decoded = printedLocationCode(raw);
  if (decoded) return decoded;
  // A hand-typed address in a loose spelling (`c02094`, `C 2 9 4`, `C02-09-4`)
  // that reads ONE way is that address; an ambiguous one stays as typed for
  // the server's lookup to settle against the locations that exist.
  const candidates = locationCodeCandidates(raw);
  return candidates.length === 1 ? candidates[0]! : String(raw ?? '').trim();
}

/** A zone letter, then digits with any separators (space . _ / -) between them. */
const LOOSE_LOCATION_RE = /^([A-Z])[\s._/-]*(\d(?:[\d\s._/-]*\d)?)$/i;

/**
 * Every flat address (`C0209400`) a hand-typed location could mean, most
 * likely first. Separators and case are free and segments may be unpadded
 * (`C-2-9-4`); a dashless run reads by length — 5 digits `AABBL`, 6 `AABBLL`
 * then `AABBLP`, 7 `AABBLPP`, 8 `AABBLLPP` — and a missing position is `00`
 * (the rack-level sticker). Empty when the text is not an address.
 */
export function locationCodeCandidates(raw: string): string[] {
  const m = LOOSE_LOCATION_RE.exec(String(raw ?? '').trim());
  // Another label class (a tote `H-12345`, a carton `R-…`) is never an address.
  if (!m || routeScan(raw)?.type !== 'bin') return [];
  const zone = m[1]!.toUpperCase();
  const out: string[] = [];
  const add = (aisle: string, bay: string, level: string, position = '0') => {
    const segs = parseLocationCodeFlat(`${zone}${pad2(aisle)}${pad2(bay)}${noPad(level)}${pad2(position)}`);
    if (!segs) return;
    const flat = locationCodeFlat(segs);
    if (!out.includes(flat)) out.push(flat);
  };
  let parts = m[2]!.split(/[\s._/-]+/);
  // `C0209-4`: an `AABB` block, then the level (and position).
  if (parts.length > 1 && parts[0]!.length === 4) parts = [parts[0]!.slice(0, 2), parts[0]!.slice(2), ...parts.slice(1)];
  if (parts.length === 3 || parts.length === 4) {
    if (parts.every((part) => part.length <= 2)) add(parts[0]!, parts[1]!, parts[2]!, parts[3]);
    return out;
  }
  const d = parts.join('');
  if (d.length === 5) add(d.slice(0, 2), d.slice(2, 4), d.slice(4));
  else if (d.length === 6) {
    add(d.slice(0, 2), d.slice(2, 4), d.slice(4));
    add(d.slice(0, 2), d.slice(2, 4), d.slice(4, 5), d.slice(5));
  } else if (d.length === 7) add(d.slice(0, 2), d.slice(2, 4), d.slice(4, 5), d.slice(5));
  else if (d.length === 8) add(d.slice(0, 2), d.slice(2, 4), d.slice(4, 6), d.slice(6));
  return out;
}

/**
 * One label, every spelling: dashed `A-01-01-1-01` and flat `A0101101`
 * compare equal; a rack code in any spelling (`rk0012-03`, GS1) is `RK12-3`.
 */
export function normalizeShelfCode(raw: string): string {
  const upper = unwrapScannedLocation(raw).trim().toUpperCase();
  const rack = canonicalRackCode(upper);
  if (rack) return rack;
  const segments = parseLocationCodeFlat(upper.replace(/-/g, ''));
  return segments ? locationCodeFlat(segments) : upper;
}

/** The route ONLY when the value genuinely DECODED — never when it was guessed. */
export function decodedHandle(raw: string): ScanRoute | null {
  const route = routeScan(raw);
  return route?.redirect ? route : null;
}

/** For a scan of a **printed carton label**, return the numeric `receiving_id`. */
export function scannedReceivingId(raw: string): number | null {
  const route = routeScan(raw);
  if (!route || route.type !== 'receiving') return null;
  const m = /^\/m\/r\/(\d+)$/.exec(route.redirect || '');
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

// ─── Print-side helpers ─────────────────────────────────────────────────────

/** Public-facing base URL embedded in every printed QR — internal handles (receiving carton, receiving line, repair label, sign-in / staff… */
export const QR_BASE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://usavshop.com'
).replace(/\/$/, '');

/** Public domain encoded in the *unit-level* GS1 Digital Link QR (the QR on a serialized product label). */
const PUBLIC_UNIT_QR_BASE_URL = (
  process.env.NEXT_PUBLIC_LABEL_QR_BASE_URL ?? 'https://usavshop.com'
).replace(/\/$/, '');

/** Build the absolute URL embedded in a printed QR. */
export function mobileQrUrl(
  // `k` was dropped — it minted `/m/k/{id}`, which `routeScan` has no branch for
  // and no page exists; a generator with no scan-back resolver. r/l/u/b all
  // route (l/u via the proxy rewrite + MOBILE_PATH_RE, b to inventory).
  kind: 'r' | 'l' | 'u' | 'b',
  id: string | number,
  opts?: { baseUrl?: string },
): string {
  const encoded = encodeURIComponent(String(id));
  const path =
    kind === 'b'
      ? `/inventory?bin=${encoded}`
      : `/m/${kind}/${encoded}`;
  const base = (opts?.baseUrl || QR_BASE_URL).replace(/\/$/, '');
  try {
    return new URL(path, base).toString();
  } catch {
    return `${base}${path}`;
  }
}

/** GS1 Digital Link URL. */
export function gs1DigitalLinkUrl(opts: {
  gtin: string;
  serial?: string | null;
  batch?: string | null;
  /** Override host (e.g. `staffOriginForSlug` for multi-tenant SaaS minting). */
  baseUrl?: string;
}): string {
  const base = (opts.baseUrl || QR_BASE_URL).replace(/\/$/, '');
  const gtin = encodeURIComponent(String(opts.gtin || '').trim());
  if (!gtin) return base;
  let path = `/01/${gtin}`;
  if (opts.serial && opts.serial.trim()) {
    path += `/21/${encodeURIComponent(opts.serial.trim())}`;
  }
  if (opts.batch && opts.batch.trim()) {
    path += `/10/${encodeURIComponent(opts.batch.trim())}`;
  }
  try {
    return new URL(path, base).toString();
  } catch {
    return `${base}${path}`;
  }
}

// ─── Warehouse-location helpers (Zone / Aisle / Bay / Level / Position) ────

/** There is deliberately NO default GLN. */

/** Pad a numeric segment to 2 digits — 01, 02, 03 … */
export function pad2(n: number | string): string {
  const num = typeof n === 'string' ? parseInt(n, 10) : n;
  if (!Number.isFinite(num)) return String(n).padStart(2, '0');
  return String(Math.max(0, Math.floor(num))).padStart(2, '0');
}

/** No padding — used for the Level tier (1, 2, …, 10). */
export function noPad(n: number | string): string {
  const num = typeof n === 'string' ? parseInt(n, 10) : n;
  if (!Number.isFinite(num)) return String(n);
  return String(Math.max(0, Math.floor(num)));
}

export interface LocationSegments {
  /** Single uppercase letter A–Z. Tied to a named room (e.g. "Cage 4" → "C"). */
  zone: string;
  aisle: number | string;
  bay: number | string;
  level: number | string;
  position: number | string;
}

/** Normalize zone input to a single uppercase letter; fallback to 'X' if invalid. */
function zoneLetter(z: string | number | undefined | null): string {
  const c = String(z ?? '').trim().toUpperCase().charAt(0);
  return /[A-Z]/.test(c) ? c : 'X';
}

/**
 * Compact dash-separated location code — A-01-01-1-01.
 *   zone letter · 2-digit aisle · 2-digit bay · unpadded level · 2-digit position.
 */
export function locationCode(s: LocationSegments): string {
  return `${zoneLetter(s.zone)}-${pad2(s.aisle)}-${pad2(s.bay)}-${noPad(s.level)}-${pad2(s.position)}`;
}

/** Tight all-caps code (no dashes) used inside the GS1 URI. */
export function locationCodeFlat(s: LocationSegments): string {
  return `${zoneLetter(s.zone)}${pad2(s.aisle)}${pad2(s.bay)}${noPad(s.level)}${pad2(s.position)}`;
}

/** Rack-level segments — identifies a whole rack column on a single level (no individual position slot). */
export type RackSegments = Omit<LocationSegments, 'position'>;

/** Convert rack segments to the position=0 LocationSegments form. */
export function rackToLocation(r: RackSegments): LocationSegments {
  return { zone: r.zone, aisle: r.aisle, bay: r.bay, level: r.level, position: 0 };
}

/**
 * 4-segment dashed rack code — `A-01-01-1`. Drops the position segment
 * for display; the underlying QR / DB row still uses the position=0
 * sentinel (see {@link locationCodeFlat}, which would emit `A0101100`).
 */
export function rackCode(r: RackSegments): string {
  return `${zoneLetter(r.zone)}-${pad2(r.aisle)}-${pad2(r.bay)}-${noPad(r.level)}`;
}

/** A printed location code (flat form) identifies a rack — not an individual bin — when the position segment is 00. */
function isRackCode(flat: string): boolean {
  const m = /^([A-Z])(\d{2})(\d{2})(\d{1,2})(\d{2})$/i.exec(flat.trim());
  if (!m) return false;
  return parseInt(m[5], 10) === 0;
}

/** Parse a flat location code (`A0101100` / `A010111`) back into segments. */
export function parseLocationCodeFlat(flat: string): LocationSegments | null {
  const v = flat.trim().toUpperCase();
  // Z + AA + BB + L(1-2) + PP — 8 or 9 chars total.
  const m = /^([A-Z])(\d{2})(\d{2})(\d{1,2})(\d{2})$/i.exec(v);
  if (!m) return null;
  const zone = m[1];
  const aisle = parseInt(m[2], 10);
  const bay = parseInt(m[3], 10);
  const level = parseInt(m[4], 10);
  const position = parseInt(m[5], 10);
  if (!/^[A-Z]$/.test(zone)) return null;
  if (![aisle, bay, level].every((n) => Number.isFinite(n) && n >= 1 && n <= 99)) return null;
  if (!Number.isFinite(position) || position < 0 || position > 99) return null;
  return { zone, aisle, bay, level, position };
}

/**
 * Bays alternate sides of the aisle: odd → Left, even → Right.
 * Used as a guide label on printed stickers so staff know which way to face.
 */
export function bayHand(bay: number | string): 'Left' | 'Right' {
  const n = typeof bay === 'string' ? parseInt(bay, 10) : bay;
  return Number.isFinite(n) && n % 2 === 0 ? 'Right' : 'Left';
}

/**
 * The two sides of an aisle as the operator reads them (owner 2026-10-03):
 * pick a side first, then that side's bays — the side is never repeated as
 * `(Left)` / `(Right)` on every bay.
 */
export const BAY_SIDE_FACE = {
  left: { bays: 'Odd bays', side: 'Left side', short: 'Odd · left' },
  right: { bays: 'Even bays', side: 'Right side', short: 'Even · right' },
} as const;

/**
 * Operator face for the bay segment (internal UI + printed stickers).
 * The address field stays `bay`; the floor word is Bay.
 */
export const LOCATION_BAY_LABEL = 'Bay';
export const LOCATION_BAY_LABEL_PLURAL = 'Bays';

export function formatLocationBayFace(bay: number | string): string {
  return `${LOCATION_BAY_LABEL} ${pad2(bay)} (${bayHand(bay)})`;
}

/**
 * GS1 Digital Link URI for a warehouse location.
 * @deprecated for new prints — location labels emit a DataMatrix via
 */
export function gs1LocationUrl(
  s: LocationSegments,
  opts: { gln: string; baseUrl?: string },
): string {
  const gln = opts.gln.trim();
  const baseUrl = (opts.baseUrl || QR_BASE_URL).replace(/\/$/, '');
  const code = locationCodeFlat(s);
  const path = `/414/${encodeURIComponent(gln)}/254/${encodeURIComponent(code)}`;
  try {
    return new URL(path, baseUrl).toString();
  } catch {
    return `${baseUrl}${path}`;
  }
}

/** Raw GS1 AI string in human-readable parens form — `(414)gln(254)code`. */
function gs1LocationAi(s: LocationSegments, opts: { gln: string }): string {
  return `(414)${opts.gln.trim()}(254)${locationCodeFlat(s)}`;
}

/** The licensed-GLN decision for a printed location label. */
interface LocationLabelPayload {
  /** Symbology to hand the DataMatrix renderer. */
  symbology: 'gs1datamatrix' | 'datamatrix';
  /** The payload string to encode. */
  value: string;
  /** The licensed GLN this label asserts, or `null` when it asserts none. */
  gln: string | null;
  /** The flat location code, always — useful for the human-readable line. */
  code: string;
}

export function locationLabelPayload(
  s: LocationSegments,
  opts?: { gln?: string | null },
): LocationLabelPayload {
  const code = locationCodeFlat(s);
  const gln = (opts?.gln ?? '').replace(/\D/g, '');

  if (isLicensedGln(gln)) {
    return { symbology: 'gs1datamatrix', value: gs1LocationAi(s, { gln }), gln, code };
  }

  return { symbology: 'datamatrix', value: code, gln: null, code };
}

// ─── Unit / serial product label ──────────────────────────────────────────

/** GS1 AI string for a unit/serial product label — `(01)gtin(21)serial`, optionally with `(10)batch`. */
export function gs1UnitAi(opts: {
  gtin: string;
  serial?: string | null;
  batch?: string | null;
}): string {
  const gtin = String(opts.gtin || '').trim();
  if (!gtin) return '';
  let payload = `(01)${gtin}`;
  if (opts.serial && opts.serial.trim()) payload += `(21)${opts.serial.trim()}`;
  if (opts.batch && opts.batch.trim()) payload += `(10)${opts.batch.trim()}`;
  return payload;
}

// ─── Internal handles ───────────────────────────────────────────────────── Plain `datamatrix` payloads — no GS1 AIs, just the prefixed…

export function receivingHandle(id: string | number): string {
  return `R-${id}`;
}
export function receivingLineHandle(id: string | number): string {
  return `L-${id}`;
}
export function serialUnitHandle(id: string | number): string {
  return `U-${id}`;
}
export function handlingUnitHandle(id: string | number): string {
  return `H-${id}`;
}
export function repairHandle(id: string | number): string {
  return `REP-${id}`;
}
/** Provider ticket id (Zendesk) — ticket-minimal label DataMatrix. */
export function ticketHandle(id: string | number): string {
  return `T-${id}`;
}
