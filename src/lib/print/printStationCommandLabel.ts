/**
 * Station command barcode — 2×1" thermal label (matrix on the right).
 *
 * Reuses the shared {@link LabelFaceModel} / {@link printLabel} shell so the
 * sticker prints on the same stock as receiving carton labels. Encodes the
 * exact CMD-* string as DataMatrix (Arrival traffic cop → command).
 */

import { buildFaceInfoHtml, type LabelFaceModel } from '@/lib/print/labelFace';
import { reserveLegacyPrintPopup } from '@/lib/print/iframePrint';

interface StationCommandLabelPayload {
  /** Exact scan string (e.g. CMD-BATCH-SORT). */
  code: string;
  /** Human label for the face center. */
  label?: string | null;
  /** Top-right badge (defaults to CMD). */
  badge?: string | null;
}

/**
 * Map a station-command payload onto the shared face — DataMatrix on the right,
 * HRI under it. Same slot grid as carton / returns-bin labels.
 */
export function stationCommandPayloadToFace(
  payload: StationCommandLabelPayload,
): LabelFaceModel {
  const code = String(payload.code ?? '').trim().toUpperCase();
  const label =
    (payload.label ?? '').trim() || code.replace(/^CMD-/, '').replace(/-/g, ' ') || 'Command';
  const badge = (payload.badge ?? 'CMD').trim() || 'CMD';
  return {
    kind: 'receiving',
    topLeft: 'CMD',
    topRight: badge,
    center: label,
    bottomLeft: 'Station',
    bottomRight: '',
    matrix: { value: code, symbology: 'datamatrix', scale: 4 },
    hri: code,
  };
}

/** Print a 2×1 station command barcode label (browser print shell). */
export function printStationCommandLabel(payload: StationCommandLabelPayload): void {
  if (typeof window === 'undefined') return;
  const face = stationCommandPayloadToFace(payload);
  if (!face.matrix.value) return;

  const legacyPopup = reserveLegacyPrintPopup();
  void import('@/lib/print/printLabel').then(({ printLabel }) => {
    printLabel({
      name: 'Station command',
      ...buildFaceInfoHtml(face),
      dataMatrix: face.matrix,
      hri: face.hri,
      face,
      legacyPopup,
    });
  });
}
