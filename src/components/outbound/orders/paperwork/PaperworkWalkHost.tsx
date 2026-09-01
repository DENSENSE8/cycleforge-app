'use client';

/**
 * To-ship paperwork walk — table XOR (rail + editor).
 *
 * Clone of the exceptions workbench chrome: compare across rows in the table,
 * then walk one record. This host is the RECORD half. The door is the Labels
 * header CTA (`OrdersDeskLabelsAction`).
 */

import { PaperworkRecentRail } from './PaperworkRecentRail';
import { PaperworkEditor } from './PaperworkEditor';
import type { ShippedOrder } from '@/types/orders';

export function PaperworkWalkHost({
  rows,
  selectedId,
  loading,
  onSelect,
  onAdvance,
  onExit,
  onFactsChanged,
}: {
  rows: ShippedOrder[];
  selectedId: number;
  loading: boolean;
  onSelect: (id: number) => void;
  onAdvance: () => void;
  onExit: () => void;
  onFactsChanged: () => void;
}) {
  const selected =
    rows.find((r) => Number(r.id) === Number(selectedId)) ?? rows[0] ?? null;
  const index = selected
    ? rows.findIndex((r) => Number(r.id) === Number(selected.id)) + 1
    : 1;

  if (!selected) {
    return (
      <div
        className="flex h-full min-h-0 items-center justify-center bg-surface-canvas text-role-caption text-text-soft"
        data-testid="paperwork-walk-empty"
      >
        No orders to walk.
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 min-w-0 w-full flex-1 bg-surface-canvas"
      data-testid="paperwork-walk"
    >
      <aside
        className="flex w-[22rem] shrink-0 flex-col border-r border-border-hairline bg-surface-card"
        aria-label="Labels queue"
      >
        <PaperworkRecentRail
          rows={rows}
          selectedId={selected.id}
          onSelect={onSelect}
          loading={loading}
        />
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-card">
        <PaperworkEditor
          key={selected.id}
          row={selected}
          index={index}
          total={rows.length}
          onAdvance={onAdvance}
          onExit={onExit}
          onFactsChanged={onFactsChanged}
        />
      </div>
    </div>
  );
}
