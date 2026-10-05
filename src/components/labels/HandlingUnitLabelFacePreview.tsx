'use client';

/** Print-faithful 2×1 tote / box licence plate — the same iframe every other label preview uses ({@link LabelFacePreview}), so what an… */

import { LabelFacePreview } from '@/design-system/components/LabelFacePreview';
import { handlingUnitLabelToFace } from '@/lib/print/printHandlingUnitLabel';
import type { LabelFaceModel } from '@/lib/print/labelFace';

/** Obviously-not-a-real-id stand-in for the serial the database has not minted. */
const SPECIMEN_LPN_CODE = 'H-###';

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
