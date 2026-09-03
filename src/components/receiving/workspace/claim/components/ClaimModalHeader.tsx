import { X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

interface Props {
  row: ReceivingLineRow;
  submitting: boolean;
  archiveSubmitting?: boolean;
  onClose: () => void;
  /**
   * `display` — Unbox Displays push: strip + Chat·Claim tabs already name the
   * verb; carton identity lives on StationContextBar. No second gray title /
   * PO restatement / X (column `→|` owns dismiss).
   * `modal` — right slide-over (Testing / triage): no carton context beside it,
   * so eyebrow + PO key + close are load-bearing.
   */
  chrome?: 'modal' | 'display';
}

/** Create-ticket header — "Create ticket" top-right on both chrome faces. */
export function ClaimModalHeader({
  row,
  submitting,
  archiveSubmitting,
  onClose,
  chrome = 'modal',
}: Props) {
  const identity =
    row.receiving_source === 'unmatched'
      ? 'Unmatched carton'
      : row.zoho_purchaseorder_number
        ? `PO ${row.zoho_purchaseorder_number}`
        : row.tracking_number
          ? `Carton · ${String(row.tracking_number).slice(-8)}`
          : 'Unmatched carton';

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-hairline bg-surface-card px-4 py-3 text-text-default">
      {chrome === 'modal' ? (
        <div className="min-w-0">
          <p className="text-role-micro uppercase tracking-[0.14em] text-text-faint">Ticket</p>
          <p className="mt-0.5 truncate text-sm font-semibold tracking-tight text-text-default">
            {identity}
          </p>
        </div>
      ) : (
        <div />
      )}
      <div className="flex shrink-0 items-center gap-2">
        <p className="text-sm font-semibold tracking-tight text-text-default">Create ticket</p>
        {chrome === 'modal' ? (
          <IconButton
            onClick={onClose}
            disabled={submitting || archiveSubmitting}
            ariaLabel="Cancel"
            icon={<X className="h-4 w-4" />}
            className="rounded-lg p-1.5 text-text-faint hover:bg-surface-card hover:text-text-muted disabled:opacity-50"
          />
        ) : null}
      </div>
    </div>
  );
}
