'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutGroup, useInView } from 'framer-motion';
import type { InlineActionFeedbackPayload } from './InlineActionFeedbackCard';
import { WORKSPACE_SECTION_TITLE_CLASS } from './WorkspaceSectionLabel';
import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import { CartonAddAction } from './CartonAddAction';
import { PoLineRow } from './PoLineRow';
import { usePoLinesData } from './hooks/usePoLinesData';
import { usePoLineItemDescriptionEditor } from './hooks/usePoLineItemDescriptionEditor';
import type {
  ActiveRowSlot,
  PoLineSerialActions,
} from './po-lines-accordion-types';

// Re-exported for existing consumers (UnmatchedItemsSection imports ProgressBadge;
// ActiveLineConditionSerial imports the ActiveRowSerial type from here).
export { ProgressBadge, ScannedBadge } from './PoLineBadges';
export type {
  ActiveRowSerial,
  PoLineSerialActions,
  ActiveRowSlotContext,
} from './po-lines-accordion-types';

interface Props {
  receivingId: number;
  activeLineId: number;
  /**
   * Optional slot rendered inside the active row's bubble — condition pills,
   * inline serial adder, etc. Receives the active line's serials so children
   * can consume the accordion's authoritative data rather than re-fetching
   * or relying on parent state.
   */
  activeRowSlot?: ActiveRowSlot;
  /**
   * Condition grade of the unit currently selected in the active row's body
   * (multi-qty lines). When set, the active row's header condition badge shows
   * this instead of the line-level grade, so the header tracks the selected
   * unit. Null/undefined → fall back to `line.condition_grade`.
   */
  activeConditionOverride?: string | null;
  /**
   * Edit/delete for serial copy-chips in the active row header. Condition is
   * set via the line-level picker in the row body, not on chip hover.
   */
  activeSerialActions?: PoLineSerialActions;
  /**
   * Read-only display (triage). Drops the expand chevron, the "Click to switch"
   * hint, and the row click-to-switch — nothing on a line can change until it's
   * unboxed, so the accordion is just a flat list of what's on the PO.
   */
  readOnly?: boolean;
  /**
   * Testing context only: hide lines marked needs_test=false (cables / no-test
   * items) so they don't appear in the tester's per-PO list. The active line is
   * always kept visible. Off in the unbox workspace, where every line matters.
   */
  hideNoTestLines?: boolean;
  /** Success/error feedback renders below the label preview in LineEditPanel. */
  onItemDescFeedback?: (feedback: InlineActionFeedbackPayload | null) => void;
  /** Called after a successful local + Zoho item-description save. */
  onItemDescSaved?: (lineId: number, zohoNotes: string | null) => void;
  /**
   * The already-known active line (the row the workspace opened on). Used as the
   * query `placeholderData` so the clicked line paints INSTANTLY on a cold open
   * while the full sibling list fetches — kills the "takes a second to render the
   * PO line" gap. Ignored once real (or cached) data is present.
   */
  placeholderActiveRow?: ReceivingLineRow;
  /**
   * Render bare (no own card chrome, no add "+" pencil) — used when composed
   * inside the unified {@link POUnboxingSection} wrapper, which supplies the
   * single shared card + edit pencil. Defaults to the standalone card so the
   * testing display and any other caller are unaffected.
   */
  embedded?: boolean;
  /**
   * Embedded-only: node rendered at the right of the "PO items · N" header row
   * (e.g. the wrapper's shared edit pencil). Lets the unified wrapper place its
   * single control on the same row as the item count.
   */
  headerRight?: React.ReactNode;
  /** Hide the embedded "PO items · N" eyebrow — the tab slider owns the label. */
  suppressHeader?: boolean;
  /**
   * Opt-in: extra controls rendered in each line's title row, immediately after
   * the item-description button (e.g. the testing page's serial LINK/UNLINK).
   * Omitted callers (unbox) render nothing here — unchanged.
   */
  renderTitleActions?: (line: ReceivingLineRow) => React.ReactNode;
}

/**
 * Multi-item PO accordion. Renders the carton's sibling lines as collapsed
 * rows; the current active line shows highlighted at the top. Clicking a
 * sibling dispatches `receiving-select-line` to re-seed the workspace on that
 * line — single-active-line semantics, no duplicate form state.
 *
 * A thin shell over three collaborators (per the god-component cleanup):
 * - {@link usePoLinesData} — sibling query + cache-coordination bus.
 * - {@link usePoLineItemDescriptionEditor} — inline Zoho item-description CRUD.
 * - {@link PoLineRow} — the presentational row leaf.
 *
 * Single-line cartons should not mount this component (the parent guards).
 */
export function PoLinesAccordion({
  receivingId,
  activeLineId,
  activeRowSlot,
  activeConditionOverride,
  activeSerialActions,
  readOnly = false,
  hideNoTestLines = false,
  onItemDescFeedback,
  onItemDescSaved,
  renderTitleActions,
  placeholderActiveRow,
  embedded = false,
  headerRight,
  suppressHeader = false,
}: Props) {
  const { queryKey, allRows, rows, cartonUnitIds, serialsLoading } = usePoLinesData({
    receivingId,
    activeLineId,
    hideNoTestLines,
    placeholderActiveRow,
  });

  // Active row collapse — the chevron toggles the active line's body (slot)
  // closed so a high-qty line (x100 unit rows) doesn't lock the workspace to
  // a wall of rows. Re-expands whenever the active line changes.
  const [activeCollapsed, setActiveCollapsed] = useState(false);
  useEffect(() => {
    setActiveCollapsed(false);
  }, [activeLineId]);
  const expandActiveRow = useCallback(() => setActiveCollapsed(false), []);

  // Tab-panel visibility gate for framer `layout`. When this accordion sits in a
  // hidden tab (`display:none`, e.g. the Units display is active), its rows
  // measure as a zero-box at the origin; re-enabling `layout` on show would fly
  // them in from the top-left. `useInView` is false while display:none (the ref
  // has no box → never intersects) and flips true once the panel is displayed,
  // so framer captures the baseline at the correct position — no fly-in — while
  // the in-tab sibling-reorder animation still runs when the panel is visible.
  const listRef = useRef<HTMLUListElement>(null);
  const layoutActive = useInView(listRef, { margin: '600px' });

  const desc = usePoLineItemDescriptionEditor({
    queryKey,
    activeLineId,
    allRows,
    placeholderActiveRow,
    onItemDescFeedback,
    onItemDescSaved,
    expandActiveRow,
  });

  // Always render — even for single-line POs the row layout (title, qty,
  // sku, price, condition, serial chip) is the canonical context display the
  // workspace expects above the body.
  if (rows.length === 0) return null;

  // Embedded → bare wrapper (the POUnboxingSection card supplies the chrome +
  // the single shared pencil, so the per-card "+" add action is dropped here).
  const Wrapper = embedded ? 'div' : 'section';
  return (
    <Wrapper
      className={
        embedded
          ? 'min-w-0'
          : 'min-w-0 overflow-hidden rounded-2xl bg-surface-card p-4 shadow-sm ring-1 ring-border-soft/60'
      }
    >
      {suppressHeader ? null : (
        <div className="mb-2 flex items-center justify-between">
          <h3 className={WORKSPACE_SECTION_TITLE_CLASS}>
            PO items · {rows.length}
          </h3>
          {embedded ? (
            headerRight ?? null
          ) : !readOnly ? (
            <CartonAddAction receivingId={receivingId} unitIds={cartonUnitIds} />
          ) : null}
        </div>
      )}
      <LayoutGroup id={`po-lines-${receivingId}`}>
        <ul ref={listRef} className="flex min-w-0 flex-col gap-1">
          {rows.map((line) => (
            <PoLineRow
              key={line.id}
              line={line}
              isActive={line.id === activeLineId}
              readOnly={readOnly}
              animateLayout={layoutActive}
              serialsLoading={serialsLoading}
              activeCollapsed={activeCollapsed}
              onToggleCollapsed={() => setActiveCollapsed((v) => !v)}
              activeConditionOverride={activeConditionOverride}
              activeSerialActions={activeSerialActions}
              activeRowSlot={activeRowSlot}
              renderTitleActions={renderTitleActions}
              desc={{
                shownId: desc.shownId,
                draft: desc.draft,
                savingLineId: desc.savingLineId,
                inputRef: desc.inputRef,
                toggle: desc.toggle,
                setDraft: desc.setDraft,
                save: desc.save,
              }}
            />
          ))}
        </ul>
      </LayoutGroup>
    </Wrapper>
  );
}
