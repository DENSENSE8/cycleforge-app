/**
 * Identify's pure front half: split a paste into lines, then classify every
 * token BEFORE any search. A token may carry several kinds (a 12-digit number
 * is a FedEx tracking shape, a UPC-A and an order number); each kind becomes
 * an exact probe with a prior, and all probes for the whole paste run as one
 * statement. Nothing here touches the database.
 *
 * Grammar reuse, not re-implementation: printed handles via
 * `parseInternalIdQuery`/`decodedHandle`, Digital Link via `parseScannedUrl`,
 * GS1 element strings via the strict `parseGs1AiPayload`, carriers via
 * `TRACKING_PATTERNS` (`classifyInput`), FNSKU via `scannedFnsku`.
 */

import { decodedHandle, scannedUnitKey } from '@/lib/barcode-routing';
import { CONDITION_GRADES, resolveConditionGrade, type ConditionGrade } from '@/lib/conditions';
import { hasValidGs1CheckDigit } from '@/lib/interop/gs1-keys';
import { classifyInput, parseGs1AiPayload, parseScannedUrl, scannedFnsku } from '@/lib/scan-resolver';
import { parseInternalIdQuery } from '@/lib/search/internal-id';
import { looksLikeMarketplaceOrderNumber } from '@/lib/search/looks-like-marketplace-order-number';
import { extractCanonicalTracking } from '@/lib/tracking-format';
import {
  IDENTIFY_MAX_LINE_CHARS,
  IDENTIFY_MAX_LINES,
  type IdentifyMatchField,
  type IdentifyTokenKind,
} from './schema';

/** One exact-equality lookup the probe statement runs. */
export const PROBE_KINDS = [
  'order_id',
  'order_item',
  'tracking',
  'serial',
  'sku',
  'gtin',
  'fnsku',
  'asin',
  'po',
  'receiving_id',
  'receiving_line_id',
  'unit_id',
  'unit_key',
  'repair_id',
  'location_code',
  'ticket',
] as const;
export type ProbeKind = (typeof PROBE_KINDS)[number];

export interface ExactProbe {
  kind: ProbeKind;
  /** The exact value the column is compared with. */
  value: string;
  /** The token as the operator wrote it — the "why" line quotes this. */
  token: string;
  field: IdentifyMatchField;
  /** Confidence an exact hit on this probe earns (0–1). */
  prior: number;
}

export interface ClassifiedToken {
  text: string;
  kinds: IdentifyTokenKind[];
}

export interface ClassifiedLine {
  input: string;
  tokens: ClassifiedToken[];
  probes: ExactProbe[];
  /** Lower-cased words for the free-text arms (grade words removed). */
  words: string[];
  /** Condition filter from grade words (`used` → USED_A/B/C). */
  conditions: ConditionGrade[];
  /**
   * The line is ONE machine identifier (handle, Digital Link, GS1, tracking,
   * FNSKU, check-digit GTIN): a miss is a miss, no free-text fallback.
   */
  machineIdentifier: boolean;
}

/**
 * One identifier per line: trim, collapse inner whitespace, drop blanks, drop
 * case-insensitive repeats (first wins), clip over-long lines, cap the count.
 */
export function splitIdentifyBatch(input: string): { lines: string[]; truncated: boolean } {
  const seen = new Set<string>();
  const lines: string[] = [];
  let truncated = false;
  for (const rawLine of String(input ?? '').split(/\r\n|\r|\n/)) {
    // `\s` does not match the GS1 FNC1 separator (\x1D), so element strings survive.
    const line = rawLine.trim().replace(/\s+/g, ' ').slice(0, IDENTIFY_MAX_LINE_CHARS).trim();
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    if (lines.length === IDENTIFY_MAX_LINES) {
      truncated = true;
      break;
    }
    seen.add(key);
    lines.push(line);
  }
  return { lines, truncated };
}

const TYPO_ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

/**
 * Every string one edit (delete, adjacent transpose, replace, insert) away
 * from a letters-only word of 4–10 characters. pg_trgm cannot see a
 * transposition in a short word (`similarity('bose','bsoe')` = 0.11), and
 * `fuzzystrmatch` is not installed, so the candidates are generated here and
 * matched by equality against the catalog's title vocabulary.
 */
export function typoVariants(word: string): string[] {
  if (!/^[a-z]{4,10}$/.test(word)) return [];
  const out = new Set<string>();
  for (let i = 0; i <= word.length; i++) {
    const head = word.slice(0, i);
    const tail = word.slice(i);
    if (tail) out.add(head + tail.slice(1));
    if (tail.length > 1) out.add(head + tail[1] + tail[0] + tail.slice(2));
    for (const ch of TYPO_ALPHABET) {
      if (tail) out.add(head + ch + tail.slice(1));
      out.add(head + ch + tail);
    }
  }
  out.delete(word);
  return [...out];
}

// ── Grade words ─────────────────────────────────────────────────────────────

const USED_GRADES: ConditionGrade[] = ['USED_A', 'USED_B', 'USED_C'];

/** Single words that are grades on their own. Single letters (A/B/C) only count after `used`/`grade`. */
const GRADE_UNIGRAMS: Record<string, ConditionGrade[]> = {
  new: ['BRAND_NEW'],
  brandnew: ['BRAND_NEW'],
  likenew: ['LIKE_NEW'],
  refurb: ['REFURBISHED'],
  refurbished: ['REFURBISHED'],
  used: USED_GRADES,
  parts: ['PARTS'],
};

function gradeOf(phrase: string): ConditionGrade | null {
  const resolved = resolveConditionGrade(phrase);
  return (CONDITION_GRADES as readonly string[]).includes(resolved) ? (resolved as ConditionGrade) : null;
}

// ── Token shapes ────────────────────────────────────────────────────────────

const ASIN_RE = /^B0[A-Z0-9]{8}$/;
const PO_RE = /^[A-Z0-9][A-Z0-9_-]{2,}$/i;
const SERIAL_RE = /^[A-Z0-9][A-Z0-9._/-]{3,}$/i;
const MODEL_RE = /^(?=.*\d)[a-z0-9][a-z0-9-]{0,15}$/i;

/** Stored GTIN forms a scanned GTIN-8/12/13/14 may sit under (gtin is 14, upc 12, ean 13). */
function gtinVariants(digits: string): string[] {
  const core = digits.replace(/^0+/, '');
  const out = new Set<string>([digits]);
  for (const len of [8, 12, 13, 14]) {
    if (core.length <= len) out.add(core.padStart(len, '0'));
  }
  return [...out];
}

/** Probes for one identifier-shaped token, strongest shapes first. */
function tokenProbes(token: string, kinds: Set<IdentifyTokenKind>, strongOnly: boolean): ExactProbe[] {
  const probes: ExactProbe[] = [];
  const upper = token.toUpperCase();
  const hasDigit = /\d/.test(token);
  const add = (kind: ProbeKind, value: string, field: IdentifyMatchField, prior: number) =>
    probes.push({ kind, value, token, field, prior });

  const fnsku = scannedFnsku(token);
  if (fnsku) {
    kinds.add('fnsku');
    add('fnsku', fnsku, 'fnsku', 1);
  }
  const compact = upper.replace(/[^A-Z0-9]/g, '');
  if (ASIN_RE.test(compact)) {
    kinds.add('asin');
    add('asin', compact, 'asin', 0.9);
  }

  const classified = classifyInput(token);
  if (classified.type === 'tracking') {
    kinds.add('tracking');
    // Pure 10–15 digit carrier shapes collide with order numbers and UPCs.
    const ambiguous = /^\d{10,15}$/.test(classified.normalized);
    add('tracking', extractCanonicalTracking(token), 'tracking', ambiguous ? 0.85 : 0.98);
    // A carrier-unique shape (1Z…, TBA…, 9400…) is nothing else: skip the weak arms.
    if (!ambiguous) return probes;
  }

  if (/^\d+$/.test(token) && [8, 12, 13, 14].includes(token.length) && hasValidGs1CheckDigit(token)) {
    kinds.add('gtin');
    for (const v of gtinVariants(token)) add('gtin', v, 'gtin', 0.97);
  }

  const marketplace = looksLikeMarketplaceOrderNumber(token);
  if (marketplace) kinds.add('order_number');
  if (strongOnly && !marketplace) return probes;

  if (hasDigit && token.length >= 3) {
    const bare = token.replace(/^#+/, '');
    kinds.add('order_number');
    add('order_id', bare, 'order_id', marketplace ? 0.97 : 0.9);
    if (bare !== token) add('order_id', token, 'order_id', marketplace ? 0.97 : 0.9);
  }
  if (strongOnly) return probes;

  if (hasDigit && token.length >= 6) {
    kinds.add('marketplace_item');
    add('order_item', token, 'item_number', 0.85);
  }
  if (hasDigit && PO_RE.test(token)) {
    kinds.add('po');
    add('po', token, 'po', 0.93);
  }
  if (SERIAL_RE.test(token) && (hasDigit || token.length >= 8)) {
    kinds.add('serial');
    add('serial', upper, 'serial', 0.95);
  }
  if (hasDigit || token.includes(':')) {
    kinds.add('sku');
    add('sku', token, 'sku', 0.95);
    if (upper !== token) add('sku', upper, 'sku', 0.95);
  }
  return probes;
}

/** A printed handle or Digital Link → its exact probes (null when the line is neither). */
function handleProbes(line: string): { probes: ExactProbe[]; kind: IdentifyTokenKind } | null {
  const isUrl = /^https?:\/\//i.test(line) || line.startsWith('/');
  const route = decodedHandle(line);
  const internal = parseInternalIdQuery(line);
  if (route && internal?.exactHandle) {
    const probes: ExactProbe[] = [];
    const add = (kind: ProbeKind, value: string | number) =>
      probes.push({ kind, value: String(value), token: line, field: 'handle', prior: 1 });
    for (const id of internal.receivingIds) add('receiving_id', id);
    for (const id of internal.receivingLineIds) add('receiving_line_id', id);
    for (const key of internal.unitKeys) {
      if (/^\d+$/.test(key)) add('unit_id', String(Number(key)));
      add('unit_key', key.toUpperCase());
    }
    return { probes, kind: 'handle' };
  }

  if (isUrl) {
    const entity = parseScannedUrl(line);
    if (entity) {
      const probes: ExactProbe[] = [];
      const add = (kind: ProbeKind, value: string, prior = 1) =>
        probes.push({ kind, value, token: line, field: 'digital_link', prior });
      switch (entity.type) {
        case 'unit':
          add('unit_key', entity.unitSerial.trim().toUpperCase());
          add('serial', entity.unitSerial.trim().toUpperCase());
          for (const v of gtinVariants(entity.gtin)) add('gtin', v, 0.9);
          break;
        case 'gs1_lot':
        case 'gs1_product':
          for (const v of gtinVariants(entity.gtin)) add('gtin', v);
          break;
        case 'order':
          add('order_id', entity.orderId);
          break;
        case 'package':
          add('tracking', extractCanonicalTracking(entity.trackingNumber));
          break;
        case 'stock':
          add('sku', entity.sku);
          break;
        case 'location':
          add('location_code', entity.locationRef.toUpperCase());
          break;
        case 'generic':
          return null;
      }
      return { probes, kind: 'digital_link' };
    }
  }

  if (!route) return null;
  const probes: ExactProbe[] = [];
  const add = (kind: ProbeKind, value: string) =>
    probes.push({ kind, value, token: line, field: 'handle', prior: 1 });
  const redirect = route.redirect ?? '';
  switch (route.type) {
    case 'receiving': {
      // REP-{id} shares the `receiving` scan type but opens a repair ticket.
      const repair = /^\/m\/rs\/(\d+)$/.exec(redirect);
      if (repair) add('repair_id', String(Number(repair[1])));
      break;
    }
    case 'serial-unit': {
      const key = scannedUnitKey(line);
      if (key) {
        if (/^\d+$/.test(key)) add('unit_id', String(Number(key)));
        add('unit_key', key.toUpperCase());
      }
      break;
    }
    case 'support-ticket':
      add('ticket', route.value.replace(/^T-/i, ''));
      break;
    case 'bin': {
      const bin = /^\/inventory\?bin=(.+)$/.exec(redirect);
      add('location_code', decodeURIComponent(bin?.[1] ?? route.value).toUpperCase());
      // A flat/dashed location shape (`A0101101`) is also a plausible serial or SKU.
      if (!/^https?:|^\//i.test(line)) probes.push(...tokenProbes(line, new Set(), false));
      break;
    }
    default:
      break;
  }
  return { probes, kind: 'handle' };
}

/** GS1 element string → probes on its serial / GTIN / SSCC. */
function gs1Probes(line: string): ExactProbe[] | null {
  const tree = parseGs1AiPayload(line);
  if (!tree) return null;
  const probes: ExactProbe[] = [];
  const add = (kind: ProbeKind, value: string, prior: number) =>
    probes.push({ kind, value, token: line, field: 'gs1', prior });
  const serial = tree.ais['21']?.trim();
  if (serial) {
    add('serial', serial.toUpperCase(), 1);
    add('unit_key', serial.toUpperCase(), 1);
  }
  const gtin = tree.ais['01'] ?? tree.ais['02'];
  if (gtin) for (const v of gtinVariants(gtin)) add('gtin', v, serial ? 0.9 : 1);
  if (tree.ais['00']) add('tracking', tree.ais['00'], 0.95);
  return probes;
}

/** Classify one line. */
export function classifyIdentifyLine(input: string): ClassifiedLine {
  const line = input.trim();
  const base = { input: line, words: [] as string[], conditions: [] as ConditionGrade[] };
  const gs1 = gs1Probes(line);
  if (gs1 && gs1.length > 0) {
    return { ...base, tokens: [{ text: line, kinds: ['gs1'] }], probes: gs1, machineIdentifier: true };
  }
  const handle = handleProbes(line);
  if (handle) {
    return { ...base, tokens: [{ text: line, kinds: [handle.kind] }], probes: handle.probes, machineIdentifier: true };
  }

  const rawTokens = line.split(' ').filter(Boolean);
  const single = rawTokens.length === 1;
  const tokens: ClassifiedToken[] = [];
  const probes: ExactProbe[] = [];
  const words: string[] = [];
  const conditions = new Set<ConditionGrade>();

  for (let i = 0; i < rawTokens.length; i++) {
    const token = rawTokens[i];
    const lower = token.toLowerCase();
    const next = rawTokens[i + 1]?.toLowerCase();

    // Two-word grades first: "like new", "used b", "grade a", "for parts", "brand new".
    if (next) {
      const pair = lower === 'grade' ? gradeOf(`USED ${next}`) : gradeOf(`${lower} ${next}`);
      if (pair) {
        conditions.add(pair);
        tokens.push({ text: `${token} ${rawTokens[i + 1]}`, kinds: ['grade'] });
        i += 1;
        continue;
      }
    }
    const unigram = GRADE_UNIGRAMS[lower.replace(/-/g, '')];
    if (unigram && !single) {
      for (const g of unigram) conditions.add(g);
      tokens.push({ text: token, kinds: ['grade'] });
      continue;
    }

    const kinds = new Set<IdentifyTokenKind>();
    // In a multi-word line only unmistakable shapes are probed; the rest are search words.
    probes.push(...tokenProbes(token, kinds, !single));
    if (MODEL_RE.test(token)) kinds.add('model');
    if (/^[\p{L}'&.]+$/u.test(token)) kinds.add('word');
    tokens.push({ text: token, kinds: [...kinds] });
    words.push(lower);
  }

  const machineIdentifier =
    single && probes.some((p) => p.kind === 'fnsku' || (p.kind === 'tracking' && p.prior > 0.9) || p.kind === 'gtin');
  return { input: line, tokens, probes, words, conditions: [...conditions], machineIdentifier };
}
