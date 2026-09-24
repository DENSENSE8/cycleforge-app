'use client';

/**
 * To-ship paperwork walk — table XOR (rail + editor).
 *
 * Compare across rows in the ledger, then walk one record. This host is the
 * RECORD half: it covers the desk stage edge to edge (`absolute inset-0` over
 * the still-mounted ledger — Center Lock Q5, never a body swap and never a
 * split under the table). The ledger is the industrial floor face; the walk is
 * understand-then-decide desk work, so it wears the TRIAGE mode (slate panels,
 * grouped cards). The doors are the Labels bar segment
 * (`OrdersDeskLabelsAction`) and the evidence column's Labels verb.
 *
 * While it is up the walk owns the `record` cursor, so the desk's ambient
 * keyboard (J / K / ↑ / ↓ step, Esc closes) walks these orders instead of the
 * ledger hidden underneath. Same tier as the ledger; a tie goes to the most
 * recent publisher, which is always the walk (it mounts over a live ledger).
 */

import { useCallback, useMemo } from 'react';
import { PaperworkRecentRail } from './PaperworkRecentRail';
import { PaperworkEditor } from './PaperworkEditor';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
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
      <aside
        className="flex w-[22rem] shrink-0 flex-col border-r border-border-soft bg-mode-bar"
        aria-label="Labels queue"
      >
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
