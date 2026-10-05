/**
 * The /support split pane with nothing open: the list read as a whole — the
 * server's status counts (the chips' numbers), then the work flags over the
 * rows on screen.
 */

import type { RecordLedgerSummary } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import {
  SUPPORT_LOCAL_STATUSES,
  SUPPORT_LOCAL_STATUS_LABEL,
  type SupportLocalStatus,
  type SupportWorkFlag,
} from '@/lib/support/conversation/model';
import { SUPPORT_LIST_VIEW_LABEL, type SupportListRow, type SupportListView } from '@/lib/support/list/support-list';

const SUMMARY_FLAGS: ReadonlyArray<{ flag: SupportWorkFlag; label: string }> = [
  { flag: 'needs_reply', label: 'Needs reply' },
  { flag: 'follow_up_due', label: 'Follow-up due' },
  { flag: 'unclassified', label: 'Unclassified' },
];

export function supportDeskSummary(
  rows: readonly SupportListRow[],
  statusCounts: Readonly<Record<SupportLocalStatus, number>> | undefined,
  view: SupportListView | null,
): RecordLedgerSummary {
  return {
    title: view ? SUPPORT_LIST_VIEW_LABEL[view] : 'Support items',
    facts: [
      ...SUPPORT_LOCAL_STATUSES.map((status) => {
        const value = statusCounts?.[status] ?? 0;
        return { label: SUPPORT_LOCAL_STATUS_LABEL[status], value, warn: (status === 'new' || status === 'open') && value > 0 };
      }),
      ...SUMMARY_FLAGS.map(({ flag, label }) => {
        const value = rows.filter((row) => row.flags[flag]).length;
        return { label, value, warn: value > 0 };
      }),
    ],
    note: 'Open one to read the conversation and reply.',
  };
}
