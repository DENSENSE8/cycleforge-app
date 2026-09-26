/** Barcode routing helpers — used by the mobile scan flow and by anywhere the app needs to classify an inbound scan or paste. */

import { inventoryLocationsHref, LOCATIONS_BAY_CODE_RE } from '@/lib/inventory/locations-path';
import { scannedFnsku } from '@/lib/scan-resolver';
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
  | 'support-ticket'   // T-class — provider ticket id → /support?ticket=
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

const MOBILE_PATH_RE = /\/m\/(r|l|u|h)\/([^/?#\s]+)/i;
const SKU_STOCK_LOCATION_RE = /\/sku-stock\/location\/([^/?#\s]+)/i;
// GS1 Digital Link — capture gtin and optional serial after /21/.
// Exported so the GS1 resolver (src/lib/gs1/parser.ts) can reuse the
// same fast-path regex without re-declaring it.
export const GS1_PATH_RE = /\/01\/(\d{8,14})(?:\/21\/([^/?#\s]+))?/i;
// GS1 Digital Link for a warehouse location:
export const GS1_LOCATION_RE = /\/414\/(\d+)\/254\/([^/?#\s]+)/i;

// Raw GS1 AI string emitted by industrial DataMatrix scanners.
const GS1_AI_LOCATION_FNC1_RE = /414(\d{13})(?:\x1D|)?254([^\x1D]+)/i;
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
// cannot be mistaken for the `/m/` path segment.
const FLATTENED_MOBILE_LINK_RE = /^https?.*m([rluh])(\d+)$/i;

function normalizeForeignLabel(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

const SSCC_PARENS_RE = /^\(00\)(\d{18})$/;
const SSCC_FNC1_RE = /^\x1D00(\d{18})$/;
const SSCC_BARE_RE = /^(\d{18})$/;

const CARRIER_TRACKING_SHAPES: ReadonlyArray<RegExp> = [
  /^1Z[A-Z0-9]{16}$/,
  /^\d{10}$/,
  /^\d{12}$/,
  /^\d{15}$/,
  /^\d{20}$/,
  /^\d{22}$/,
];

export function scannedSscc(raw: string): string | null {
  const v = normalizeForeignLabel(String(raw ?? '').trim());
  if (!v) return null;
  const m = SSCC_PARENS_RE.exec(v) ?? SSCC_FNC1_RE.exec(v) ?? SSCC_BARE_RE.exec(v);
  return m ? m[1] : null;
}

export function scannedCarrierTracking(
  raw: string,
): { tracking: string; carrier: DisplayCarrier } | null {
  const v = normalizeForeignLabel(String(raw ?? '').trim());
  if (!v) return null;
  if (!CARRIER_TRACKING_SHAPES.some((re) => re.test(v))) return null;
  return { tracking: v, carrier: toDisplayCarrier(detectCarrierFromTracking(v)) };
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
  const unitFnc1 = GS1_AI_UNIT_FNC1_RE.exec(value);
  if (unitFnc1) {
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
      redirect: `/support?ticket=${ticketShort[1]}`,
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
    const flat = dashed.slice(1, 6).filter(Boolean).join('').toUpperCase();
    return routeLocationCode(value, flat);
  }

  // 5b. FLAT location code — `A0101101`, a zone letter then 7–8 digits.
  if (LOCATION_FLAT_RE.test(value)) {
    return routeLocationCode(value, value.toUpperCase());
  }

  // 6. Bin (legacy fallback): starts with a letter.
  if (/^[A-Za-z]/.test(value)) return { type: 'bin', value };

  const sscc = scannedSscc(value);
  if (sscc) return { type: 'sscc', value: sscc };
  const tracking = scannedCarrierTracking(value);
  if (tracking) {
    return { type: 'carrier-tracking', value: tracking.tracking, carrier: tracking.carrier };
  }

  // 7. Default fallback → SKU.
  return { type: 'sku', value };
}

/** Back-compat shim for callers that only need the type. */
export function detectScanType(raw: string): ScanType {
  return routeScan(raw)?.type ?? 'sku';
}

export interface BinPairingLookup {
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

/** For a scan of a **printed location label**, return the flat location code (`A0101101`) — the exact string `locations.barcode` stores. */
function scannedLocationCode(raw: string): string | null {
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
  return scannedLocationCode(raw) ?? String(raw ?? '').trim();
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
export const PUBLIC_UNIT_QR_BASE_URL = (
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
export function isRackCode(flat: string): boolean {
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
