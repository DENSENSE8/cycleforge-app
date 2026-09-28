'use client';

/** To-ship paperwork walk — table XOR (rail + editor). */

import { useCallback, useMemo } from 'react';
import { PaperworkRecentRail } from './PaperworkRecentRail';
import { PaperworkEditor } from './PaperworkEditor';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { DESK_TRIAGE_RAIL_CLASS } from '@/design-system/tokens/desk-stage';
import { singleBand } from '@/lib/group-rows';
import { RECORD_CURSOR_PRIORITY } from '@/lib/record-cursor/store';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { cn } from '@/utils/_cn';
import type { ShippedOrder } from '@/types/orders';

const WALK_PLANE_CLASS = 'absolute inset-0 z-panel flex min-h-0 min-w-0 bg-mode-canvas text-mode-ink';

export function PaperworkWalkHost({
  rows,
  selectedId,
  loading = false,
  onSelect,
  onAdvance,
  onPrev,
  onExit,
  onFactsChanged,
}: {
  rows: ShippedOrder[];
  selectedId: number;
  loading?: boolean;
  onSelect: (id: number) => void;
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

  const order = useMemo(() => singleBand(rows), [rows]);
  const getId = useCallback((row: ShippedOrder) => Number(row.id), []);
  usePublishRecordCursor<ShippedOrder>({
    surfaceId: 'to-ship-paperwork-walk',
    scope: 'record',
    enabled: selected != null,
    priority: RECORD_CURSOR_PRIORITY.grid,
    order,
    openId: selected ? Number(selected.id) : null,
    getId,
    onOpen: (row) => onSelect(Number(row.id)),
    onClose: onExit,
  });

  if (!selected) {
    return (
      <ModeRegion mode="triage" className={cn(WALK_PLANE_CLASS, 'items-center justify-center')} data-testid="paperwork-walk-empty">
        <p className="text-role-data text-text-muted">No orders to walk.</p>
      </ModeRegion>
    );
  }

  return (
    <ModeRegion mode="triage" className={WALK_PLANE_CLASS} data-testid="paperwork-walk">
      <aside className={cn(DESK_TRIAGE_RAIL_CLASS, 'border-r border-mode-divide')} aria-label="Labels queue">
        <PaperworkRecentRail
          rows={rows}
          selectedId={selected.id}
          onSelect={onSelect}
          loading={loading}
        />
      </aside>
      <PaperworkEditor
        key={selected.id}
        row={selected}
        index={index}
        total={rows.length}
        onAdvance={onAdvance}
        onPrev={index > 1 ? onPrev : undefined}
        onExit={onExit}
        onFactsChanged={onFactsChanged}
      />
    </ModeRegion>
  );
}
