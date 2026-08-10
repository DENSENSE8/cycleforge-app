'use client';

/**
 * Media Library desk inspector — the n ≠ 1 face of the selection plane.
 *
 * ```text
 * [→|] ……………………………………………………     ← DeskRailChromeRow (chrome ONLY)
 * ───────────────────────────────────
 * 2 SELECTED                          ← identity: what the verbs will act on
 * ───────────────────────────────────
 * > Select all 48                     ← armed rows (↑↓ / Home / End / Enter)
 *   Select all matching
 * ───────────────────────────────────
 *   Add photos
 *   Copy shareable links
 *   Create share page
 *   Download selected
 *   Edit labels
 * ───────────────────────────────────
 *                              [ 🗑 ]  ← InspectorActionFloor (Macro floor)
 * ```
 *
 * ## Why this replaced a top action bar
 *
 * The bulk verbs lived in `PhotoLibraryToolbar` — a chrome band that *swapped
 * itself in over Bands 1–3* whenever a selection existed. Three costs, and the
 * third is the one that made it wrong rather than merely dense:
 *
 *  1. **It hid the chrome it replaced.** Selecting two photos took away the
 *     lifecycle tabs, the search field and the breadcrumb — the operator lost
 *     their place in the archive to read a row of icons.
 *  2. **Icon-only, at the top, with tooltips.** Six unlabelled glyphs is six
 *     things to parse before finding one verb; the same verbs as rows name
 *     themselves in words and cost no chrome height at all.
 *  3. **The right edge already owns "what can I do to the picked record".**
 *     n = 1 opens {@link PhotoInspectorPanel} there. Putting n ≥ 2 somewhere
 *     else made cardinality change the *place* as well as the content.
 *
 * ## What it composes, and what it deliberately does not
 *
 * Rows are the house armed-verb waist — {@link useArmedCursorList} +
 * `armed-cursor-face` tokens, the same pair `PhotosActionsArmedList` (Unbox
 * Displays → Photos → Actions) composes. Commit paints in the same turn as
 * Enter / Space / pointerdown; there is no hit-marker timer.
 *
 * It composes the HOOK, not `StationArmedVerbList`, and that is a decision the
 * A3 plan flagged in advance: that component hardwires
 * `useNavRegion({ id: 'right' })` and `isKeyboardRegion('right')`, which are
 * Station keyboard-region concerns. This is a desk `RightRailHost` occupant, and
 * `⌘;` region arm on this surface is explicitly ask-first (A3 → C-NAV), so the
 * rail takes the cursor behaviour and leaves the region registration alone.
 *
 * The armed face composes the chevron + track WITHOUT
 * `ARMED_CURSOR_MARKER_PULSE_CLASS` — a recorded, operator-confirmed divergence
 * from the Unbox golden (2026-08-10). This surface runs one predictable DS with
 * no motion; the pulse is the last thing that would still move on it, so a rail
 * that pulsed here would be the animation the pass exists to remove.
 *
 * ## Delete is on the FLOOR, never in the rows
 *
 * A destructive verb does not sit in the verb list beside its peers: it is the
 * flush trailing child of {@link InspectorActionFloor}, the desk Macro floor
 * (`right-rail-inspector.md` → *Workbench inspector action floor*). Park stays on
 * the top `DeskRailChromeRow`, so a dismiss never sits beside a delete.
 *
 * **Delete is the floor's only peer, and that is the choice** (option (a) of the
 * handoff): every other bulk verb is a *set* operation that reads better as a
 * named row, and the rows are the one place a verb is read. Delete is on the
 * floor because it is destructive, not because floors are where verbs go — the
 * same shape `BinDetailFlyout`, `SkuDetailView` and `RepairDetailsPanel` already
 * ship. `InspectorFlushDelete` owns its own arm-then-confirm, so the rail holds
 * no delete state of its own.
 *
 * The floor stays MOUNTED at zero selected (disabled) rather than unmounting —
 * a bottom row that appears and disappears with the selection would move the
 * verb list under the operator's cursor mid-tick.
 *
 * Occupant id is the stable `detail:photo-batch` — a per-selection id would play
 * exit → empty → enter every time the operator ticked another tile, which is the
 * loop this rail exists for. Mutually exclusive with `detail:photo` by
 * construction (one `inspectorPhoto === null` split decides which mounts).
 *
 * SoT: `.claude/rules/display/media-library.md`.
 */

import {
  useCallback,
  useId,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { Check, ChevronRight, Layers } from '@/components/Icons';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskRailChromeRow } from '@/components/right-rail/DeskRailChromeRow';
import {
  FLOOR_DELETE_PEER_CLASS,
  InspectorActionFloor,
} from '@/components/right-rail/InspectorActionFloor';
import { InspectorFlushDelete } from '@/components/right-rail/InspectorFlushDelete';
import {
  ARMED_CURSOR_CHEVRON_CLASS,
  ARMED_CURSOR_TRACK_CLASS,
} from '@/components/station/displays/armed-cursor-face';
import { useArmedCursorList } from '@/components/station/displays/useArmedCursorList';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { LIST_KEY_OWNER_ATTR } from '@/lib/keyboard/list-key-scope';
import {
  resolveSelectionAction,
  type SelectionAction,
} from '@/lib/selection/selection-actions';
import { cn } from '@/utils/_cn';

interface BatchRow {
  id: string;
  label: string;
  icon: (p: { className?: string }) => ReactNode;
  disabled?: boolean;
  run: () => void | Promise<void>;
}

export function PhotoBatchInspectorPanel<T>({
  rows,
  total,
  selectedCount,
  hasMore,
  onSelectAllMatching,
  actions,
  onDeleteSelected,
  onSelectAll,
  onClear,
}: {
  /** Selected rows loaded into the stream — may be fewer than `selectedCount`. */
  rows: T[];
  /** Loaded stream length, for "Select all N". */
  total: number;
  /** True selection size (may exceed `rows.length` under "select all matching"). */
  selectedCount?: number;
  /** More pages match the current filters — enables "Select all matching". */
  hasMore?: boolean;
  onSelectAllMatching?: () => void;
  /** Bulk verbs — the same {@link SelectionAction} set the toolbar took. */
  actions: SelectionAction<T>[];
  onDeleteSelected?: (rows: T[]) => void | Promise<void>;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const count = rows.length;
  const shownCount = selectedCount ?? count;
  const allSelected = total > 0 && count >= total;

  const batchRows = useMemo<BatchRow[]>(() => {
    const out: BatchRow[] = [
      {
        id: 'select-all',
        label: allSelected ? 'Clear selection' : `Select all ${total}`,
        icon: (p) => <Check className={p.className} />,
        disabled: total === 0,
        run: allSelected ? onClear : onSelectAll,
      },
    ];

    if (hasMore && onSelectAllMatching) {
      out.push({
        id: 'select-matching',
        label: 'Select all matching',
        icon: (p) => <Layers className={p.className} />,
        run: onSelectAllMatching,
      });
    }

    for (const action of actions) {
      const resolved = resolveSelectionAction(action, rows);
      out.push({
        id: action.key,
        label: action.label,
        // The action set already carries house glyphs; wrap so every row's icon
        // takes the same size from one place rather than N call sites.
        icon: () => action.icon,
        disabled: resolved.disabled,
        run: () => action.run(rows),
      });
    }

    // NOTE: Delete is deliberately NOT a row here — it is the flush trailing
    // child of the Macro floor below. See the docblock.
    return out;
  }, [
    actions,
    allSelected,
    hasMore,
    onClear,
    onSelectAll,
    onSelectAllMatching,
    rows,
    total,
  ]);

  const orderedIds = useMemo(() => batchRows.map((r) => r.id), [batchRows]);
  const rowById = useMemo(() => new Map(batchRows.map((r) => [r.id, r])), [batchRows]);

  const rootRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
  const listId = useId();

  const {
    cursorId,
    setCursorId,
    commitArmed,
    handleCommitPointerDown,
    handleCommitClick,
    handleNavKeyDown,
  } = useArmedCursorList({ orderedIds, activeId: null, rootRef, rowRefs });

  const runRow = useCallback(
    (id: string) => {
      const row = rowById.get(id);
      if (!row || row.disabled) return;
      void row.run();
    },
    [rowById],
  );

  const onRowKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLButtonElement>, id: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (rowById.get(id)?.disabled) return;
        commitArmed(id, runRow);
        return;
      }
      handleNavKeyDown(e, id);
    },
    [commitArmed, handleNavKeyDown, rowById, runRow],
  );

  return (
    <DetailStackRailRegistrar
      id="detail:photo-batch"
      onClose={onClear}
      modal={false}
      ariaLabel={`${shownCount} photos selected`}
    >
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden"
        data-testid="photo-batch-inspector-panel"
      >
        <div className="shrink-0 border-b border-border-hairline bg-surface-card">
          {/* Chrome row is chrome ONLY — close, and nothing else. There is no
              record cursor to step: a selection is a set, not a position. */}
          <DeskRailChromeRow onClose={onClear} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <p
            className="border-b border-border-hairline px-3 py-2 text-role-eyebrow uppercase tracking-widest text-text-soft"
            data-testid="photo-batch-count"
          >
            {shownCount} selected
          </p>

          <div
            ref={rootRef}
            data-station-action-dossier=""
            data-testid="photo-batch-actions-list"
            {...{ [LIST_KEY_OWNER_ATTR]: '' }}
            tabIndex={-1}
            className="outline-none"
          >
            <ul
              aria-labelledby={listId}
              className="divide-y divide-border-hairline border-b border-border-hairline"
            >
              <li className="sr-only">
                <h3 id={listId}>Actions for the selected photos</h3>
              </li>
              {batchRows.map((row) => {
                const isArmed = cursorId != null && cursorId === row.id;
                const Icon = row.icon;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) rowRefs.current.set(row.id, el);
                        else rowRefs.current.delete(row.id);
                      }}
                      disabled={row.disabled}
                      onPointerDown={(e) => {
                        if (row.disabled) return;
                        handleCommitPointerDown(e, row.id, runRow);
                      }}
                      onClick={() => {
                        if (row.disabled) return;
                        handleCommitClick(row.id, runRow);
                      }}
                      onFocus={() => setCursorId(row.id)}
                      onKeyDown={(e) => onRowKeyDown(e, row.id)}
                      className={cn(
                        'group/row ds-raw-button relative flex w-full items-center gap-2 px-3 py-3 text-left',
                        'hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-40',
                        // Armed face = `>` + bottom track; no focusRing twin
                        // while armed (it would band the row twice). ds-allow-focus
                        isArmed ? 'outline-none' : focusRing('control', 'accent'),
                        cornerClass('flush'),
                      )}
                      data-testid={`photo-batch-action-${row.id}`}
                      data-active={isArmed ? 'true' : undefined}
                      aria-current={isArmed ? 'true' : undefined}
                    >
                      {isArmed ? (
                        <span className={ARMED_CURSOR_TRACK_CLASS} aria-hidden />
                      ) : null}
                      <span className="relative z-raised flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                        {isArmed ? (
                          <span aria-hidden>
                            <ChevronRight className={ARMED_CURSOR_CHEVRON_CLASS} />
                          </span>
                        ) : null}
                        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-accent-bg [&>svg]:h-4 [&>svg]:w-4">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="truncate text-role-caption font-semibold text-text-default">
                          {row.label}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Macro floor — the destructive verb's one home. Flush trailing child,
            arm-then-confirm owned by the control, disabled (never unmounted) at
            zero selected so the row above never shifts under a tick. */}
        <InspectorActionFloor>
          <InspectorFlushDelete
            onConfirm={() => onDeleteSelected?.(rows)}
            label={shownCount > 0 ? `Delete ${shownCount}` : 'Delete selected'}
            confirmLabel={`Click again to delete ${shownCount}`}
            disabled={!onDeleteSelected || shownCount === 0}
            data-testid="photo-batch-delete"
            className={FLOOR_DELETE_PEER_CLASS}
          />
        </InspectorActionFloor>
      </div>
    </DetailStackRailRegistrar>
  );
}
