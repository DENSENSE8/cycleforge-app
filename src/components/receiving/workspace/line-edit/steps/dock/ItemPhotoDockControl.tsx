'use client';

/**
 * Dock control for `item_photos` — line-scoped capture on the Unbox floor.
 *
 * Band 1 right strip (left waist is {@link UnboxDockScanEntry}):
 *   [ Link a photo | Upload photos | Send to phone ]
 *
 * Verbs live in {@link ItemPhotoCaptureStrip} (shared with the PO-line capture
 * Photos expand). This control only maps dock context → strip props.
 */

import { ItemPhotoCaptureStrip } from '@/components/receiving/workspace/line-edit/ItemPhotoCaptureStrip';
import type { UnboxStepDockContext } from './types';

export function ItemPhotoDockControl({
  receivingId,
  staffId,
  poRef,
  poRouteRef,
  row,
}: UnboxStepDockContext) {
  return (
    <ItemPhotoCaptureStrip
      receivingId={receivingId}
      lineId={row.id}
      staffId={Number(staffId) || 0}
      poRef={poRef ?? null}
      poRouteRef={poRouteRef ?? null}
    />
  );
}
