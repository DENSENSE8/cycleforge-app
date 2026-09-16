import { handlingUnitHandle } from '@/lib/barcode-routing';
import { buildFaceInfoHtml, type LabelFaceModel } from '@/lib/print/labelFace';
import { reserveLegacyPrintPopup } from '@/lib/print/iframePrint';

/**
 * 2×1" licence-plate (LPN) label for a handling unit (box / tote).
 *
 * Two things on the paper: a `Box / LPN` kicker top-left, and the
 * human-readable code filling the rest — left-aligned, vertically centred.
 * The DataMatrix carries the bare `H-{id}` handle, which `routeScan()` parses
 * → `/m/h/{id}` (and the testing resolver fans out to every unit in the box).
 *
 * Operator ruling 2026-09-15 — kicker top-left, ID left-middle, no date. The
 * member count and bin name are gone as well: both are stale the moment the
 * tote is carried anywhere, which is what a tote is for. A date told the
 * operator nothing they act on either.
 *
 * The face is a {@link LabelFaceModel} of kind `lpn`, not bespoke HTML, so the
 * single print here, the bulk run, and every on-screen preview render the same
 * sticker.
 */

export interface HandlingUnitLabelPayload {
  /** Numeric handling_units.id — used to build the H- handle + DataMatrix. */
  handlingUnitId: number;
  /** Stored code; defaults to `H-{id}` when omitted. Shown on the big face. */
  code?: string | null;
}

/** Kicker printed above the code. Names the object, not its contents. */
const LPN_KICKER = 'Box / LPN';

export function handlingUnitLabelToFace(payload: HandlingUnitLabelPayload): LabelFaceModel {
  const handle = handlingUnitHandle(payload.handlingUnitId);
  const code = (payload.code && payload.code.trim()) || handle;
  return {
    kind: 'lpn',
    topLeft: LPN_KICKER,
    center: code,
    // Unused by the `lpn` face — it paints `topLeft` + `center` only.
    topRight: '',
    bottomLeft: '',
    bottomRight: '',
    // Plain DataMatrix carrying the `H-{id}` handle — no URL on the wire. The
    // stored `code` may be an external tote barcode, but the SCAN identity is
    // always the house handle, because that is what `routeScan` decodes.
    matrix: { value: handle, symbology: 'datamatrix', scale: 4 },
  };
}

export function printHandlingUnitLabel(payload: HandlingUnitLabelPayload): void {
  if (typeof window === 'undefined') return;
  const face = handlingUnitLabelToFace(payload);
  const legacyPopup = reserveLegacyPrintPopup();
  // Deliberately dynamic, not static: printLabel drags the bwip-js barcode
  // engine, which no caller should pay for until it actually prints.
  void import('@/lib/print/printLabel').then(({ printLabel }) => {
    printLabel({
      name: 'Box Label',
      ...buildFaceInfoHtml(face),
      dataMatrix: face.matrix,
      hri: face.hri,
      face,
      legacyPopup,
    });
  });
}
