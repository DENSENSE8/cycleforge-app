import { X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

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

/** Claim title chrome — modal only; Displays hosts omit this band. */
export function ClaimModalHeader({
  row,
  submitting,
  archiveSubmitting,
  onClose,
  chrome = 'modal',
}: Props) {
  if (chrome === 'display') return null;

  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border-hairline bg-surface-canvas px-4 py-3">
      <div>
        <p className="text-role-micro uppercase tracking-[0.14em] text-rose-700">File a claim</p>
        <p className="mt-0.5 text-sm font-semibold tracking-tight text-text-default">
          {row.receiving_source === 'unmatched'
            ? 'Unmatched carton'
            : row.zoho_purchaseorder_number
              ? `PO ${row.zoho_purchaseorder_number}`
              : row.tracking_number
                ? `Carton · ${String(row.tracking_number).slice(-8)}`
                : 'Unmatched carton'}
        </p>
      </div>
      <IconButton
        onClick={onClose}
        disabled={submitting || archiveSubmitting}
        ariaLabel="Cancel"
        icon={<X className="h-4 w-4" />}
        className="rounded-lg p-1.5 text-text-faint hover:bg-surface-card hover:text-text-muted disabled:opacity-50"
      />
    </div>
  );
}
