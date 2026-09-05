'use client';

/**
 * To-ship paperwork walk — {@link DeskStageOverlay} `fill="stage"` over the
 * To-ship sheet (Q5). The DataTable stays mounted underneath.
 *
 * The overlay is HEADERLESS (`showHeader={false}`). The desk header's Labels
 * toggle IS this surface's on/off — it stays mounted and reads `aria-pressed`
 * while the walk is up — and Esc is wired by the host. A title band repeating
 * the order number, a second ✕ and a second pair of walk arrows were three
 * controls restating what the desk already said. Position and stepping moved
 * down to the editor's floating foot, where the hand already is. `title`
 * stays: with no header it is the region's accessible name.
 *
 * Doors: header Labels CTA (`OrdersDeskLabelsAction`), tracking-hover Label,
 * selection-bar Labels / `l`.
 */

import { DeskStageOverlay } from '@/design-system/components/DeskStageOverlay';
import { PaperworkEditor } from './PaperworkEditor';
import type { ShippedOrder } from '@/types/orders';

export function PaperworkWalkHost({
  rows,
  selectedId,
  onAdvance,
  onPrev,
  onExit,
  onFactsChanged,
}: {
  rows: ShippedOrder[];
  selectedId: number;
  onAdvance: () => void;
  onPrev: () => void;
  onExit: () => void;
  onFactsChanged: () => void;
}) {
  const selected =
    rows.find((r) => Number(r.id) === Number(selectedId)) ?? rows[0] ?? null;
  const index = selected
    ? rows.findIndex((r) => Number(r.id) === Number(selected.id)) + 1
    : 1;
  const total = Math.max(rows.length, 1);

  if (!selected) {
    return (
      <DeskStageOverlay
        open
        onClose={onExit}
        title="Labels"
        fill="stage"
        showHeader={false}
        closeOnScrim={false}
        testId="paperwork-walk"
      >
        <div
          className="flex h-full min-h-0 items-center justify-center bg-surface-card text-role-caption text-text-soft"
          data-testid="paperwork-walk-empty"
        >
          No orders to walk.
        </div>
      </DeskStageOverlay>
    );
  }

  const title = String(selected.product_title || '').trim() || selected.order_id || 'Labels';

  return (
    <DeskStageOverlay
      open
      onClose={onExit}
      title={title}
      fill="stage"
      showHeader={false}
      closeOnScrim={false}
      testId="paperwork-walk"
    >
      <PaperworkEditor
        key={selected.id}
        row={selected}
        index={index}
        total={total}
        onAdvance={onAdvance}
        onPrev={onPrev}
        prevDisabled={index <= 1}
        onFactsChanged={onFactsChanged}
      />
    </DeskStageOverlay>
  );
}
