'use client';

import { type ReceivingLineRow } from '@/components/station/receiving-line-row';
import { ReceivingFeedRail } from './ReceivingFeedRail';

interface Props {
  selectedLineId: number | null;
  selectedRow?: ReceivingLineRow | null;
  /** Kept for call-site compatibility; QC recents are scoped by session staff. */
  testerId?: number | null;
  filterText?: string;
  includeRow?: (row: ReceivingLineRow) => boolean;
}

/**
 * Quality Control Recent rail — last lines this operator opened on Testing.
 * Display shell is {@link ReceivingFeedRail}; membership/age live in the
 * `testingRecent` feed (`view=testing_opened`).
 */
export function TestingRecentRail({
  selectedLineId,
  selectedRow = null,
  filterText = '',
  includeRow,
}: Props) {
  return (
    <ReceivingFeedRail
      feed="testingRecent"
      selectedLineId={selectedLineId}
      selectedRow={selectedRow}
      filterText={filterText}
      includeRow={includeRow}
    />
  );
}
