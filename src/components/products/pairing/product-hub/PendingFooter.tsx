import { Link2 } from '@/components/Icons';
import { StickyActionBar } from '@/design-system/components/StickyActionBar';

/**
 * Pending pair decisions — commit (pair/reject/unpair) or discard, as the
 * desk's floating sticky buttons (`StickyActionBar`, owner 2026-10-03: no bar
 * behind them). Mount as the last child of the hub's scrolling body.
 */
export function PendingFooter({
  selectedCount,
  unselectedCount,
  unpairCount,
  saving,
  saveError,
  onCommit,
  onDiscard,
}: {
  /** Suggestions currently selected (will be paired). */
  selectedCount: number;
  /** Suggestions left unselected (will be rejected). */
  unselectedCount: number;
  /** Confirmed rows marked to unpair. */
  unpairCount: number;
  saving: boolean;
  saveError: string | null;
  /** Pair all selected + reject all unselected in one commit. */
  onCommit: () => void;
  onDiscard: () => void;
}) {
  const actionable = selectedCount + unselectedCount + unpairCount;
  if (actionable === 0 && !saveError) return null;

  return (
    <StickyActionBar
      error={saveError ?? undefined}
      secondary={{ label: 'Discard', onClick: onDiscard, disabled: saving || actionable === 0 }}
      primary={{
        label: `Pair ${selectedCount} · Reject ${unselectedCount}`,
        onClick: onCommit,
        disabled: actionable === 0,
        isLoading: saving,
        icon: <Link2 className="h-4 w-4" />,
      }}
    />
  );
}
