import { ChevronDown } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';

/** Compact one-line strip shown when the combine-review panel is collapsed. */
export function PairedReviewCollapsedStrip({
  onToggleExpanded,
  selectedCount,
  collapsedTotalQty,
  lockedFbaId,
}: {
  onToggleExpanded: () => void;
  selectedCount: number;
  collapsedTotalQty: number;
  lockedFbaId: string | null;
}) {
  return (
    <div className="shrink-0 border-b border-border-hairline px-3 py-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        radius="flush"
        onClick={onToggleExpanded}
        className="h-auto w-full justify-between gap-2 border border-border-soft bg-surface-canvas/90 px-2.5 py-2 text-left hover:bg-surface-sunken"
        aria-expanded={false}
      >
        <span className="text-role-micro uppercase tracking-widest text-text-muted">
          Combine review
        </span>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          {selectedCount > 0 ? (
            <span className="truncate text-role-micro tabular-nums text-text-soft">
              {selectedCount} · {collapsedTotalQty}
            </span>
          ) : lockedFbaId ? (
            <span className="truncate font-mono text-role-micro text-text-success">{lockedFbaId}</span>
          ) : (
            <span className="text-role-micro font-semibold text-text-faint">Tap to expand</span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-text-faint" />
        </div>
      </Button>
    </div>
  );
}
