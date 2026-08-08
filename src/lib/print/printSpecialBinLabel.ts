/**
 * Special-bin 2×1" thermal labels — bare-barcode bins (RETURNS-TEST,
 * TECH-PARTS, UNSORTED) that cannot use the warehouse 3×2 location printer.
 *
 * Reuses the shared {@link LabelFaceModel} / {@link printLabel} shell (matrix
 * on the right, HRI under it). Bottom-right slot stays empty — room only on
 * the left of the bottom row.
 */

import { buildFaceInfoHtml, type LabelFaceModel } from '@/lib/print/labelFace';
import {
  DEFAULT_RETURNS_TEST_BIN_BARCODE,
  returnsTestBinSymbol,
} from '@/lib/inventory/returns-test-bin-symbol';
import { SPECIAL_BIN_BARCODES } from '@/lib/inventory/special-bins';

interface SpecialBinLabelPayload {
  barcode: string;
  topLeft: string;
  badge?: string | null;
  notes?: string | null;
  room?: string | null;
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

/** Print a 2×1 special-bin label (browser print shell). */
function printSpecialBinLabel(payload: SpecialBinLabelPayload): void {
  if (typeof window === 'undefined') return;
  const face = specialBinPayloadToFace(payload);
  if (!face.matrix.value) return;

  void import('@/lib/print/printLabel').then(({ printLabel }) => {
    printLabel({
      name: `Bin ${face.matrix.value}`,
      ...buildFaceInfoHtml(face),
      dataMatrix: face.matrix,
      hri: face.hri,
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
  printSpecialBinLabel(
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

