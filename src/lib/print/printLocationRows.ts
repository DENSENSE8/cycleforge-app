/**
 * Print any set of `locations` rows — the ONE entry point Bins selection,
 * Locations › Manage and the phone location record share.
 *
 * A row whose barcode is a movable-rack code (`RK12`, `RK12-3`, `RK12-3-2`)
 * gets a rack-family face — the rack placard, a shelf or a position sticker,
 * words only and never a room. A row whose barcode is a room-coded rack
 * address (`Z AA BB L PP`, dashed or flat) gets the structured location face;
 * any other barcode (`RETURNS-TEST`, `QA-SHELF-A01`) gets the flat special-bin
 * face. An arrival urgency shelf (`arrival_priority_tier` 0..3) carries its
 * tier on the sticker. Every face goes out as one run on the same
 * {@link printLabelFacesJob} channel every label uses (silent USB when
 * paired, else one iframe print dialog).
 */

import { parseLocationCodeFlat, type LocationSegments } from '@/lib/barcode-routing';
import {
  parseRackCode,
  rackCode,
  rackFace,
  type RackAddress,
} from '@/lib/locations/rack-code';
import type { LabelFaceModel } from '@/lib/print/labelFace';
import { printLabelFacesJob } from '@/lib/print/printLabelFacesJob';
import { locationLabelToFace } from '@/lib/print/printLocationLabel';
import { encodePrintMatrix } from '@/lib/qr/platform-link';
import {
  specialBinFaceForBarcode,
  specialBinPayloadToFace,
} from '@/lib/print/printSpecialBinLabel';
import { arrivalTierLabel, asArrivalTier } from '@/lib/receiving/arrival-tier';

export interface PrintableLocationRow {
  id: number;
  name: string;
  barcode: string | null;
  roomName: string | null;
  /** `locations.arrival_priority_tier` — 0 = most urgent; null = not an urgency shelf. */
  arrivalPriorityTier: number | null;
}

/** The tenant's GS1 identity the location matrix encodes (`useOrgGs1` + the session org slug). */
export interface LocationPrintIdentity {
  gln: string;
  orgSlug?: string | null;
}

export interface LocationRowFacePlan {
  /** One face per printable row, in input order. */
  faces: LabelFaceModel[];
  /** Movable-rack rows (placard / shelf / position). */
  rack: number;
  structured: number;
  special: number;
  /** Rows with no barcode — nothing scannable to print. */
  skipped: number;
  /** Canonical codes of the rack-family faces, in input order (`location.labels.printed`). */
  rackCodes: string[];
}

export interface PrintLocationRowsResult {
  rack: number;
  structured: number;
  special: number;
  skipped: number;
  transport: 'usb' | 'iframe' | 'skipped';
  /** Canonical rack-family codes the run carried; report them only when it printed. */
  rackCodes: string[];
}

/**
 * Rack-address segments from the row's BARCODE only. The barcode is the scan
 * identity; segments read off a name would print a code that never resolves
 * back to this row.
 */
export function locationRowSegments(row: Pick<PrintableLocationRow, 'barcode'>): LocationSegments | null {
  const code = (row.barcode ?? '').trim();
  if (!code) return null;
  return parseLocationCodeFlat(code.replace(/[^A-Za-z0-9]/g, ''));
}

/** `Arrival · Priority` for a tiered shelf; null when the row is not an urgency shelf. */
export function arrivalShelfCaption(tier: number | null | undefined): string | null {
  const t = asArrivalTier(tier);
  return t === null ? null : `Arrival · ${arrivalTierLabel(t)}`;
}

/**
 * Rack-family sticker: the placard (`RACK 12`), a shelf (`RACK 12` over
 * `SHELF 3`) or a position (`RACK 12 · SHELF 3` over `POS 2`). The matrix is
 * `(414)<GLN>(254)RK12-3` with a licensed GLN, else the bare code. No room.
 */
export function rackLabelToFace(input: {
  address: RackAddress;
  gln: string;
  /** Bottom line, e.g. `Arrival · Priority` on an urgency shelf; blank → none. */
  caption?: string | null;
}): LabelFaceModel {
  const { headline, sub } = rackFace(input.address);
  const matrix = encodePrintMatrix({ kind: 'rack', address: input.address, gln: input.gln });
  return {
    kind: 'rack',
    topLeft: sub ?? '',
    topRight: '',
    center: headline,
    bottomLeft: (input.caption ?? '').trim(),
    bottomRight: '',
    matrix: { value: matrix.value, symbology: matrix.symbology, scale: 4 },
    hri: matrix.hri,
  };
}

/**
 * `location.labels.printed` is recorded per rack: the run's rack-family codes
 * grouped under their rack's code (`RK12` → [`RK12`, `RK12-3`]), first-seen order.
 */
export function groupRackCodesByRack(codes: readonly string[]): Map<string, string[]> {
  const byRack = new Map<string, string[]>();
  for (const code of codes) {
    const address = parseRackCode(code);
    if (!address) continue;
    const rack = rackCode({ rack: address.rack, shelf: null, position: null });
    const list = byRack.get(rack) ?? [];
    if (!list.includes(code)) list.push(code);
    byRack.set(rack, list);
  }
  return byRack;
}

/** Row → face classification. Pure: the print run and its tests share it. */
export function planLocationRowFaces(
  rows: readonly PrintableLocationRow[],
  identity: LocationPrintIdentity,
): LocationRowFacePlan {
  const faces: LabelFaceModel[] = [];
  const rackCodes: string[] = [];
  let rack = 0;
  let structured = 0;
  let special = 0;
  let skipped = 0;
  for (const row of rows) {
    const barcode = (row.barcode ?? '').trim();
    if (!barcode) {
      skipped += 1;
      continue;
    }
    const tier = asArrivalTier(row.arrivalPriorityTier);
    // Rack grammar first: `RK…` is never a room-coded address, and the face
    // must not fall through to the room-coded or special-bin families.
    const address = parseRackCode(barcode);
    if (address) {
      faces.push(rackLabelToFace({ address, gln: identity.gln, caption: arrivalShelfCaption(tier) }));
      rackCodes.push(rackCode(address));
      rack += 1;
      continue;
    }
    const segments = locationRowSegments(row);
    if (segments) {
      faces.push(
        locationLabelToFace({
          segments,
          roomName: row.roomName,
          gln: identity.gln,
          orgSlug: identity.orgSlug,
          caption: arrivalShelfCaption(tier),
        }),
      );
      structured += 1;
      continue;
    }
    const payload = specialBinFaceForBarcode(barcode, { room: row.roomName, name: row.name });
    // A free-form urgency shelf names its tier in the kicker/badge pair the
    // special face already has (`BIN · SPECIAL` → `ARRIVAL · PRIORITY`).
    faces.push(
      specialBinPayloadToFace(
        tier === null
          ? payload
          : { ...payload, topLeft: 'ARRIVAL', badge: arrivalTierLabel(tier).toUpperCase() },
      ),
    );
    special += 1;
  }
  return { faces, rack, structured, special, skipped, rackCodes };
}

/** Print the rows' stickers as one run on the shared 2×1 label channel. */
export async function printLocationRowLabels(
  rows: readonly PrintableLocationRow[],
  opts: LocationPrintIdentity & {
    /** Silent USB only — the iframe batch is one job and does not tick. */
    onProgress?: (done: number, total: number) => void;
  },
): Promise<PrintLocationRowsResult> {
  const plan = planLocationRowFaces(rows, opts);
  const transport = await printLabelFacesJob({
    faces: plan.faces,
    name: plan.faces.length === 1 ? 'Location label' : 'Location labels',
    faceName: (face) =>
      face.kind === 'rack'
        ? `Rack ${face.hri ?? face.matrix.value}`
        : face.kind === 'location'
          ? `Location ${face.center}`
          : `Bin ${face.matrix.value}`,
    onProgress: opts.onProgress,
  });
  return {
    rack: plan.rack,
    structured: plan.structured,
    special: plan.special,
    skipped: plan.skipped,
    transport,
    rackCodes: plan.rackCodes,
  };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** One line for a finished run: what printed, how, and what was skipped. */
export function locationLabelPrintSummary(result: PrintLocationRowsResult): string {
  const parts: string[] = [];
  if (result.rack > 0) parts.push(plural(result.rack, 'rack label'));
  if (result.structured > 0) parts.push(plural(result.structured, 'location label'));
  if (result.special > 0) parts.push(plural(result.special, 'special bin label'));
  const printed = result.transport === 'skipped' || parts.length === 0
    ? 'Nothing was printed'
    : result.transport === 'usb'
      ? `Sent ${parts.join(' and ')} to the label printer`
      : `Opened ${parts.join(' and ')} in the print dialog`;
  return result.skipped > 0 ? `${printed} · ${plural(result.skipped, 'location')} skipped (no code to print)` : printed;
}
