/**
 * Flat-barcode 2×1" thermal labels — locations whose barcode is a bare code
 * rather than a structured zone/aisle/bay/level/position one, so the warehouse
 * 3×2 builder (which MINTS the code from those five steps) cannot emit them.
 *
 * Two members today: special bins (RETURNS-TEST, TECH-PARTS, UNSORTED) and
 * **station benches** (`PACK-DESK-01`, `PACK-STAGING`). They share this module
 * because they are one job — one face, one print shell — not because a bench is
 * a bin. Splitting them would give the same 2×1 sticker two encoders.
 *
 * Reuses the shared {@link LabelFaceModel} / {@link printLabel} shell (matrix
 * on the right, HRI under it). Bottom-right slot stays empty — room only on
 * the left of the bottom row.
 */

import { buildFaceInfoHtml, type LabelFaceModel } from '@/lib/print/labelFace';
import { reserveLegacyPrintPopup } from '@/lib/print/iframePrint';
import {
  DEFAULT_RETURNS_TEST_BIN_BARCODE,
  returnsTestBinSymbol,
} from '@/lib/inventory/returns-test-bin-symbol';
import { SPECIAL_BIN_BARCODES } from '@/lib/inventory/special-bins';
import { packBenchShortLabel } from '@/lib/packing/pack-bench-display';

interface SpecialBinLabelPayload {
  barcode: string;
  topLeft: string;
  badge?: string | null;
  notes?: string | null;
  room?: string | null;
  /** Print-dialog document name. Defaults to `Bin <code>` — bins are the origin. */
  docName?: string | null;
}

/** Built-in presets for seeded special bins. */
const SPECIAL_BIN_FACE_PRESETS: Record<
  string,
  Omit<SpecialBinLabelPayload, 'barcode'>
> = {
  'RETURNS-TEST': {
    topLeft: 'RETURNS',
    badge: 'TEST',
    notes: 'Returns testing bin',
    room: 'Receiving',
  },
  'TECH-PARTS': {
    topLeft: 'PARTS',
    badge: 'TECH',
    notes: 'Tech room — parts',
    room: 'Technical Room',
  },
  UNSORTED: {
    topLeft: 'PUTAWAY',
    badge: 'DEFAULT',
    notes: 'Unsorted putaway',
    room: 'Unsorted',
  },
};

/**
 * True when `barcode` is a known special (or the configured returns-test
 * symbol). Structured aisle/bay codes return false.
 */
export function isSpecialBinBarcode(
  barcode: string | null | undefined,
  returnsOverride?: string | null,
): boolean {
  const b = String(barcode ?? '').trim();
  if (!b) return false;
  if ((SPECIAL_BIN_BARCODES as readonly string[]).includes(b)) return true;
  if (SPECIAL_BIN_FACE_PRESETS[b]) return true;
  const returns = returnsTestBinSymbol(returnsOverride);
  return Boolean(returns) && b === returns;
}

/** Resolve face copy for a barcode — preset or a generic special-bin fallback. */
export function specialBinFaceForBarcode(
  barcode: string,
  opts?: { room?: string | null; name?: string | null; returnsOverride?: string | null },
): SpecialBinLabelPayload {
  const code = barcode.trim();
  const preset = SPECIAL_BIN_FACE_PRESETS[code];
  if (preset) {
    return {
      barcode: code,
      topLeft: preset.topLeft,
      badge: preset.badge,
      notes: preset.notes,
      room: (opts?.room ?? preset.room ?? '').trim() || preset.room || 'Warehouse',
    };
  }
  // Configured returns barcode that isn't the default RETURNS-TEST key.
  if (isSpecialBinBarcode(code, opts?.returnsOverride)) {
    return {
      barcode: code,
      topLeft: 'RETURNS',
      badge: 'TEST',
      notes: (opts?.name ?? '').trim() || 'Returns testing bin',
      room: (opts?.room ?? 'Receiving').trim() || 'Receiving',
    };
  }
  return {
    barcode: code,
    topLeft: 'BIN',
    badge: 'SPECIAL',
    notes: (opts?.name ?? '').trim() || code,
    room: (opts?.room ?? 'Warehouse').trim() || 'Warehouse',
  };
}

export function specialBinPayloadToFace(payload: SpecialBinLabelPayload): LabelFaceModel {
  const barcode = payload.barcode.trim();
  const room = (payload.room ?? '').trim() || 'Warehouse';
  const notes = (payload.notes ?? '').trim() || barcode;
  const badge = (payload.badge ?? '').trim() || 'BIN';
  const topLeft = (payload.topLeft ?? '').trim() || 'BIN';
  return {
    kind: 'receiving',
    topLeft,
    topRight: badge,
    center: notes,
    bottomLeft: room,
    bottomRight: '',
    matrix: { value: barcode, symbology: 'datamatrix', scale: 4 },
    hri: barcode,
  };
}

/** Print a 2×1 flat-barcode location label (browser print shell). */
function printFlatLocationTag(payload: SpecialBinLabelPayload): void {
  if (typeof window === 'undefined') return;
  const face = specialBinPayloadToFace(payload);
  if (!face.matrix.value) return;

  const legacyPopup = reserveLegacyPrintPopup();
  void import('@/lib/print/printLabel').then(({ printLabel }) => {
    printLabel({
      name: payload.docName?.trim() || `Bin ${face.matrix.value}`,
      ...buildFaceInfoHtml(face),
      dataMatrix: face.matrix,
      hri: face.hri,
      legacyPopup,
    });
  });
}

/** Print from a warehouse overview / flyout row when it is a special barcode. */
export function printSpecialBinLabelFromRow(row: {
  barcode: string | null;
  room?: string | null;
  name?: string;
}, returnsOverride?: string | null): boolean {
  const code = (row.barcode ?? '').trim();
  if (!isSpecialBinBarcode(code, returnsOverride)) return false;
  printFlatLocationTag(
    specialBinFaceForBarcode(code, {
      room: row.room,
      name: row.name,
      returnsOverride,
    }),
  );
  return true;
}

/** Returns-bin defaults — thin wrapper over the special-bin face. */
export function returnsBinPayloadToFace(payload: {
  barcode?: string | null;
  room?: string | null;
  notes?: string | null;
  badge?: string | null;
} = {}): LabelFaceModel {
  const barcode =
    (payload.barcode ?? '').trim() ||
    returnsTestBinSymbol() ||
    DEFAULT_RETURNS_TEST_BIN_BARCODE;
  return specialBinPayloadToFace({
    barcode,
    topLeft: 'RETURNS',
    badge: payload.badge ?? 'TEST',
    notes: payload.notes ?? 'Returns testing bin',
    room: payload.room ?? 'Receiving',
  });
}

/**
 * Print a station bench's tag — the 2×1 face for a DESK / STAGING `locations`
 * row (Settings → Stations).
 *
 * The CENTER is the operator face (`packBenchShortLabel`), not the warehouse
 * name: the sticker is read at the bench by the person who named it, so a tag
 * that says `Pack Desk 2` while every screen says `Packing Station 2` is the
 * derived-label problem back on a physical object nobody re-prints.
 *
 * Returns false (and prints nothing) when the bench has no barcode — there is
 * no matrix to draw, and a tag with an empty code is worse than no tag.
 */
export function printStationTagFromRow(row: {
  barcode: string | null;
  name: string;
  displayName?: string | null;
  locationKind: string;
  room?: string | null;
}): boolean {
  const code = (row.barcode ?? '').trim();
  if (!code) return false;
  printFlatLocationTag({
    barcode: code,
    docName: `Station ${code}`,
    topLeft: 'STATION',
    badge: row.locationKind === 'STAGING' ? 'STAGING' : 'DESK',
    notes: packBenchShortLabel({
      locationName: row.name,
      locationDisplayName: row.displayName,
      locationKind: row.locationKind,
    }),
    room: row.room ?? null,
  });
  return true;
}
