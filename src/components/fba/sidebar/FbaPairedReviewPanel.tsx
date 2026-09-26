'use client';

import { usePairedReview, type FbaPairedReviewPanelProps } from './paired-review/usePairedReview';
import { PairedReviewCollapsedStrip } from './paired-review/PairedReviewCollapsedStrip';
import { PairedReviewWorkspace } from './paired-review/PairedReviewWorkspace';
import { PairedReviewPanelLayout } from './paired-review/PairedReviewPanelLayout';

/** FBA combine-review panel — thin composition shell. */
export function FbaPairedReviewPanel(props: FbaPairedReviewPanelProps) {
  const {
    selectedItems,
    stationTheme = 'green',
    expanded = true,
    onToggleExpanded,
    layout = 'panel',
  } = props;

  const c = usePairedReview(props);

  // Compact strip when collapsed
  if (!expanded && onToggleExpanded) {
    return (
      <PairedReviewCollapsedStrip
        onToggleExpanded={onToggleExpanded}
        selectedCount={selectedItems.length}
        collapsedTotalQty={c.collapsedTotalQty}
        lockedFbaId={c.lockedFbaId}
      />
    );
  }

  // Panel stays visible when FBA ID is locked
  if (selectedItems.length === 0 && !c.lockedFbaId) return null;

  // ── Workspace layout: wide kanban for the center crossfade ──────────────
  if (layout === 'workspace') {
    return <PairedReviewWorkspace c={c} stationTheme={stationTheme} selectedItems={selectedItems} />;
  }

  return (
    <PairedReviewPanelLayout
      c={c}
      stationTheme={stationTheme}
      selectedItems={selectedItems}
      onToggleExpanded={onToggleExpanded}
    />
  );
}
