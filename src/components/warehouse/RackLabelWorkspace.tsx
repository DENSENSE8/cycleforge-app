'use client';

/**
 * Main-area Bays workspace.
 *
 * Hosts the bay-level label printer — same picker scaffolding as the bin
 * label printer but without the position step. Each printed label
 * identifies a whole bay column on one level (zone/aisle/bay/level),
 * stored under the position=0 sentinel so scan routing can distinguish
 * bay scans from bin scans.
 */

import { RackLabelPrinter } from '@/components/barcode/RackLabelPrinter';
import { LABEL_BUILDER } from '@/components/barcode/label-builder-layout';

export function RackLabelWorkspace() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`flex min-h-0 flex-1 flex-col ${LABEL_BUILDER.stackGap} ${LABEL_BUILDER.pagePad}`}>
        <RackLabelPrinter />
      </div>
    </div>
  );
}
