'use client';

/**
 * Print-faithful 2×1 tote / box licence plate — the same iframe every other
 * label preview uses ({@link LabelFacePreview}), so what an operator sees on
 * screen is the document Chrome prints.
 *
 * Sibling of {@link LocationLabelFacePreview}: one wrapper per label family,
 * both mounting the shared preview rather than hand-rolling a second sticker.
 *
 * **Specimen mode.** A bulk run has no codes yet — `handling_units.code` is a
 * database serial stamped at mint, which happens at Print. Passing
 * `specimen` renders the real face with a visibly fake code so nobody tries to
 * match the preview against paper. Passing a `handlingUnitId` renders that
 * box's actual plate (the reprint path).
 */

import { LabelFacePreview } from '@/components/labels/LabelFacePreview';
import { handlingUnitLabelToFace } from '@/lib/print/printHandlingUnitLabel';
import type { LabelFaceModel } from '@/lib/print/labelFace';

/** Obviously-not-a-real-id stand-in for the serial the database has not minted. */
export const SPECIMEN_LPN_CODE = 'H-###';

export function HandlingUnitLabelFacePreview({
  handlingUnitId,
  code,
  fit = 'host',
  maxScale,
}: {
  /** Omit for a specimen plate (bulk run, before the mint). */
  handlingUnitId?: number | null;
  code?: string | null;
  fit?: 'capped' | 'host';
  maxScale?: number;
}) {
  const specimen = handlingUnitId == null;
  const trimmed = code?.trim() ?? '';
  const displayCode: string =
    trimmed || (handlingUnitId != null ? `H-${handlingUnitId}` : SPECIMEN_LPN_CODE);
  const base = handlingUnitLabelToFace({
    handlingUnitId: handlingUnitId ?? 0,
    code: displayCode,
  });
  const face: LabelFaceModel = specimen
    ? {
        ...base,
        center: displayCode,
        matrix: {
          value: displayCode.startsWith('H-') ? displayCode : SPECIMEN_LPN_CODE,
          symbology: 'datamatrix',
          scale: 4,
        },
      }
    : base;

  return <LabelFacePreview model={face} embedded fit={fit} maxScale={maxScale} />;
}
