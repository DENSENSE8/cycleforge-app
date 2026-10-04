/**
 * Movable-rack identity grammar — pure, client-safe.
 *
 * A rack is a physical object on wheels; its code never encodes a room.
 * `RK12` = rack 12, `RK12-3` = shelf 3 on rack 12, `RK12-3-2` = position 2 on
 * that shelf. No zero padding (owner 2026-10-03: "just rack increment"), so
 * the dashes are load-bearing: an undashed `RK123` is rack 123, never rack 12
 * shelf 3. Printed payloads keep the dashes (GS1 AI 254 allows `-`).
 *
 * The `RK` prefix can never match the room-coded grammar in
 * `barcode-routing.ts` (`A-01-01-1`, `A0101101`): those lead with ONE letter
 * then a digit or dash; `RK` is two letters.
 */

import { isLicensedGln } from '@/lib/interop/gs1-keys';

export interface RackAddress {
  rack: number;
  shelf: number | null;
  position: number | null;
}

/** Largest number any segment may carry. Generous; codes stay short. */
export const RACK_SEGMENT_MAX = 99_999;

const RACK_CODE_RE = /^RK0*(\d{1,5})(?:-0*(\d{1,5})(?:-0*(\d{1,5}))?)?$/i;
const GS1_AI_PARENS_RE = /^\(414\)\d{13}\(254\)(.+)$/i;
const GS1_AI_FNC1_RE = /^414\d{13}(?:\x1D|\x1E)?254(.+)$/i;
const GS1_DIGITAL_LINK_RE = /\/414\/\d+\/254\/([^/?#\s]+)/i;

function validSegment(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= RACK_SEGMENT_MAX;
}

function assertAddress(a: RackAddress): void {
  if (!validSegment(a.rack)) throw new RangeError(`rack number out of range: ${a.rack}`);
  if (a.shelf != null && !validSegment(a.shelf)) throw new RangeError(`shelf out of range: ${a.shelf}`);
  if (a.position != null) {
    if (a.shelf == null) throw new RangeError('a position needs a shelf');
    if (!validSegment(a.position)) throw new RangeError(`position out of range: ${a.position}`);
  }
}

/** Canonical code: `RK12` | `RK12-3` | `RK12-3-2`. */
export function rackCode(a: RackAddress): string {
  assertAddress(a);
  let code = `RK${a.rack}`;
  if (a.shelf != null) code += `-${a.shelf}`;
  if (a.position != null) code += `-${a.position}`;
  return code;
}

function parseBareRackCode(raw: string): RackAddress | null {
  const m = RACK_CODE_RE.exec(raw.trim());
  if (!m) return null;
  const rack = Number(m[1]);
  const shelf = m[2] != null ? Number(m[2]) : null;
  const position = m[3] != null ? Number(m[3]) : null;
  if (!validSegment(rack)) return null;
  if (shelf != null && !validSegment(shelf)) return null;
  if (position != null && !validSegment(position)) return null;
  return { rack, shelf, position };
}

/**
 * Parse any printed/typed spelling of a rack code: `RK12-3`, `rk12-3`,
 * `RK0012-03` (tolerated leading zeros), the GS1 AI `(414)<GLN>(254)RK12-3`
 * (parens or FNC1) and the Digital Link `/414/<GLN>/254/RK12-3`.
 */
export function parseRackCode(raw: string): RackAddress | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const direct = parseBareRackCode(value);
  if (direct) return direct;
  const ai = GS1_AI_PARENS_RE.exec(value) ?? GS1_AI_FNC1_RE.exec(value);
  if (ai) return parseBareRackCode(ai[1]);
  const link = GS1_DIGITAL_LINK_RE.exec(value);
  if (link) {
    try {
      return parseBareRackCode(decodeURIComponent(link[1]));
    } catch {
      return null;
    }
  }
  return null;
}

/** Canonical spelling of any rack-code scan, or null when it is not one. */
export function canonicalRackCode(raw: string): string | null {
  const a = parseRackCode(raw);
  return a ? rackCode(a) : null;
}

export type RackLevel = 'rack' | 'shelf' | 'position';

export function rackLevel(a: RackAddress): RackLevel {
  if (a.position != null) return 'position';
  if (a.shelf != null) return 'shelf';
  return 'rack';
}

/** Printed face words. No room, ever. */
export function rackFace(a: RackAddress): { headline: string; sub: string | null } {
  assertAddress(a);
  if (a.position != null) {
    return { headline: `POS ${a.position}`, sub: `RACK ${a.rack} · SHELF ${a.shelf}` };
  }
  if (a.shelf != null) return { headline: `SHELF ${a.shelf}`, sub: `RACK ${a.rack}` };
  return { headline: `RACK ${a.rack}`, sub: null };
}

/** `locations.name` for a rack-family row: `Rack 12` | `Rack 12 Shelf 3` | `Rack 12 Shelf 3 Pos 2`. */
export function rackName(a: RackAddress): string {
  assertAddress(a);
  let name = `Rack ${a.rack}`;
  if (a.shelf != null) name += ` Shelf ${a.shelf}`;
  if (a.position != null) name += ` Pos ${a.position}`;
  return name;
}

export interface RackLabelPayload {
  symbology: 'gs1datamatrix' | 'datamatrix';
  value: string;
  gln: string | null;
  code: string;
}

/**
 * The matrix payload for a rack-family label: `(414)<GLN>(254)<code>` when the
 * org holds a licensed GLN, the bare canonical code otherwise. Mirrors
 * `locationLabelPayload` for the room-coded grammar.
 */
export function rackLabelPayload(a: RackAddress, opts?: { gln?: string | null }): RackLabelPayload {
  const code = rackCode(a);
  const gln = (opts?.gln ?? '').replace(/\D/g, '');
  if (isLicensedGln(gln)) {
    return { symbology: 'gs1datamatrix', value: `(414)${gln}(254)${code}`, gln, code };
  }
  return { symbology: 'datamatrix', value: code, gln: null, code };
}
