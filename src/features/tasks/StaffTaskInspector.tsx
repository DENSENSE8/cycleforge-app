'use client';

/**
 * My Tasks' record plane — the picked task's detail, as a NON-MODAL right-rail
 * inspector claiming the single `RightRailHost` slot.
 *
 * **This is where the task's WRITES live.** The grid row carries one verb (the
 * gutter check) and otherwise points at this pane; rename, delete, restore and
 * the recurring cycle all happen here. That split is the reason the grid
 * declares `inCellEdit: false`: a cell editor would be a second rename path
 * competing with the record plane, and the two would drift.
 *
 * **Occupant id is stable (`detail:staff-task`), not per-record** — walking a
 * task list row by row is the core loop, and `RightRailHost` keys its
 * `AnimatePresence` on the id, so a per-record id would play exit → empty →
 * enter on every step (`display/motion-crossfade.md`). The pane re-seeds its
 * draft from the row on every record change (`key` on the body), so it holds no
 * stale draft across that step.
 *
 * Composed, not hand-rolled: `DeskRailChromeRow` owns the `→|` dismiss,
 * `Panel` the card, `LedgerValue` / `DateTimeValue` the value typography,
 * `Button` the actions.
 */

import { useEffect, useState } from 'react';
import { Loader2, RotateCcw, Trash2 } from '@/components/Icons';
import { DateTimeValue } from '@/design-system/components/DateTimeValue';
import { LedgerValue } from '@/design-system/components/LedgerValue';
import { Button, Panel } from '@/design-system/primitives';
import { DeskRailChromeRow } from '@/components/right-rail/DeskRailChromeRow';
import { PaneHeaderLabel } from '@/components/ui/pane-header';
import { useRegisterRightPanel } from '@/components/right-rail/useRegisterRightPanel';
import { RIGHT_RAIL_PRIORITY } from '@/lib/right-rail/store';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { workStatusChipClass, workStatusLabel } from '@/lib/work-orders/work-status-display';
import { RECUR_INTERVALS, STATION_LABEL, type StationKey } from '@/components/layout/goal-chip/goal-chip-shared';
import type { StaffTaskRow } from './grid/staff-task-row';
import { cn } from '@/utils/_cn';

/** Stable id — see the docblock. Do NOT key this on the task. */
const STAFF_TASK_RAIL_ID = 'detail:staff-task';

export interface StaffTaskInspectorActions {
  onToggle: (row: StaffTaskRow, done: boolean) => void;
  onRename: (row: StaffTaskRow, text: string) => void;
  onDelete: (row: StaffTaskRow) => void;
  onRestore: (row: StaffTaskRow) => void;
  /** Recurring only — resets the whole station list's cycle (server contract). */
  onChangeInterval?: (row: StaffTaskRow, intervalMs: number) => void;
  pending?: boolean;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">{label}</p>
      {children}
    </div>
  );
}

function Chip({ label, toneClass }: { label: string; toneClass: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-role-micro uppercase tracking-widest ring-1 ring-inset',
        toneClass,
      )}
    >
      {label}
    </span>
  );
}

function StaffTaskInspectorBody({
  row,
  actions,
  onClose,
}: {
  row: StaffTaskRow;
  actions: StaffTaskInspectorActions;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(row.text);
  // Re-seed on record change — the occupant id is stable, so the body persists
  // across a row step and would otherwise show the previous task's draft.
  useEffect(() => setDraft(row.text), [row.id, row.text]);

  const dirty = draft.trim() !== row.text && draft.trim().length > 0;
  const status = row.archived ? 'CANCELED' : row.done ? 'DONE' : 'OPEN';

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="staff-task-inspector">
      <DeskRailChromeRow onClose={onClose} columnDisplay />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
        <PaneHeaderLabel
          eyebrow={row.kind === 'recurring' ? 'Recurring task' : 'To-do'}
          value={row.text}
          valueTitle={row.text}
        />

        <div className="flex flex-wrap gap-2">
          <Chip
            label={row.archived ? 'Deleted' : (workStatusLabel(status) ?? 'Open')}
            toneClass={workStatusChipClass(status)}
          />
          {row.station ? (
            <Chip
              label={STATION_LABEL[row.station as StationKey] ?? row.station}
              toneClass="bg-surface-sunken text-text-muted ring-border-soft"
            />
          ) : null}
        </div>

        {/* Rename — the record plane's own editor, not a cell editor. */}
        <Panel padding="sm" radius="xl" elevation="none" className="space-y-2">
          <Field label="Name">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && dirty) actions.onRename(row, draft.trim());
                if (e.key === 'Escape') setDraft(row.text);
              }}
              disabled={row.archived}
              aria-label="Task name"
              className={cn(
                'w-full rounded-none border border-border-soft bg-surface-card px-2.5 py-2 text-role-data text-text-default disabled:opacity-60',
                focusRing('field', 'accent'),
              )}
            />
          </Field>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={!dirty || row.archived || actions.pending}
              onClick={() => actions.onRename(row, draft.trim())}
            >
              Save name
            </Button>
            {dirty ? (
              <Button variant="ghost" size="sm" onClick={() => setDraft(row.text)}>
                Reset
              </Button>
            ) : null}
          </div>
        </Panel>

        <Panel padding="sm" radius="xl" elevation="none" className="space-y-3">
          <Field label="Kind">
            <LedgerValue value={row.kind === 'recurring' ? 'Recurring' : 'To-do'} />
          </Field>
          <Field label={row.kind === 'recurring' ? 'Resets' : 'Due'}>
            {row.kind === 'recurring' && row.resetsAtMs != null ? (
              <DateTimeValue value={new Date(row.resetsAtMs).toISOString()} />
            ) : (
              <LedgerValue value={null} />
            )}
          </Field>
          <Field label="Last checked">
            <DateTimeValue
              value={row.checkedAtMs != null ? new Date(row.checkedAtMs).toISOString() : null}
              fallback="Never"
            />
          </Field>
        </Panel>

        {/* The cycle is a property of the STATION LIST, not of one task — the
            server applies it to every recurring task on that station, so the
            control says so rather than pretending it is per-row. */}
        {row.kind === 'recurring' && actions.onChangeInterval && !row.archived ? (
          <Panel padding="sm" radius="xl" elevation="none" className="space-y-2">
            <Field label="Reset every (whole list)">
              <div className="flex flex-wrap gap-1">
                {RECUR_INTERVALS.map((opt) => (
                  <Button
                    key={opt.label}
                    variant={row.intervalMs === opt.ms ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => actions.onChangeInterval?.(row, opt.ms)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </Field>
          </Panel>
        ) : null}

        <div className="flex flex-col gap-2">
          {row.archived ? (
            <Button
              variant="secondary"
              icon={actions.pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              disabled={actions.pending}
              onClick={() => actions.onRestore(row)}
            >
              Restore to list
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                disabled={actions.pending}
                onClick={() => actions.onToggle(row, !row.done)}
              >
                {row.done ? 'Mark not done' : 'Mark done'}
              </Button>
              <Button
                variant="danger"
                icon={<Trash2 />}
                disabled={actions.pending}
                onClick={() => {
                  actions.onDelete(row);
                  onClose();
                }}
              >
                Delete task
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Claims the single right-rail slot while a task is picked. Renders nothing
 * itself — `RightRailHost` renders the top occupant, which is why no surface
 * ever hand-rolls its own `fixed right-0` panel.
 */
export function StaffTaskInspectorRail({
  row,
  actions,
  onClose,
}: {
  row: StaffTaskRow | null;
  actions: StaffTaskInspectorActions;
  onClose: () => void;
}) {
  useRegisterRightPanel({
    id: STAFF_TASK_RAIL_ID,
    priority: RIGHT_RAIL_PRIORITY.detail,
    enabled: row != null,
    modal: false,
    ariaLabel: 'Task details',
    onClose,
    node: row ? (
      <StaffTaskInspectorBody key={row.id} row={row} actions={actions} onClose={onClose} />
    ) : null,
  });
  return null;
}
