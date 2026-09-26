'use client';

/** Main-area Bays workspace. */

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
