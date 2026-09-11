'use client';

/**
 * Mobile `/m` face for compound leaf detail — same facts as CompoundRowDetailBand.
 *
 * Callers: CompoundRowDetailHost (OrdersQueueTableRow, ReceivingGridRow, CompoundRow)
 * when pathname starts with /m. Schema: CompoundRowDetail.
 * User: "Rendered fewer hooks… To-ship" — import Facts from CompoundRowDetailFacts,
 * not Band (Turbopack export miss crashed the UnshippedTable module tree).
 */

import { BottomSheet } from '@/components/ui/BottomSheet';
import type { CompoundRowDetail } from './compound-row-model';
import { CompoundRowDetailFacts } from './CompoundRowDetailFacts';

export function CompoundRowDetailSheet({
  open,
  onClose,
  detail,
  title,
}: {
  open: boolean;
  onClose: () => void;
  detail: CompoundRowDetail;
  title?: string;
}) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title ? `Details · ${title}` : 'Line details'}
      forceVariant="sheet"
      compact
      maxWidth="28rem"
    >
      <div className="px-1 pb-2 pt-1">
        <CompoundRowDetailFacts detail={detail} title={title} />
      </div>
    </BottomSheet>
  );
}
