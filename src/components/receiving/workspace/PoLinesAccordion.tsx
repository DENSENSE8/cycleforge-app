'use client';

import { useCallback, useRef, useState } from 'react';
import { LayoutGroup, useInView } from '@/design-system/motion';
import type { InlineActionFeedbackPayload } from './InlineActionFeedbackCard';
import { WORKSPACE_SECTION_TITLE_CLASS } from './WorkspaceSectionLabel';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { CartonAddAction } from './CartonAddAction';
import { PoLineRow } from './PoLineRow';
import { markReceivingSerialAbsent } from './receiving-label-helpers';
import { usePoLinesData } from './hooks/usePoLinesData';
import { usePoLineItemDescriptionEditor } from './hooks/usePoLineItemDescriptionEditor';
import type { PoLineSerialSplitContext } from './PoLineTitleMenu';
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
   * Optional slot rendered under every editable PO line — condition pills,
   * inline serial adder, etc. Receives that line's serials/units (+ the line
   * itself) so children can consume the accordion's authoritative data rather
   * than re-fetching or relying on the controller-active row alone.
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
   * Carton-open snapshot of `receiving.accordionExpand`. `'all'` keeps the
   * active line body expanded and suppresses inactive decorative chevrons.
   */
  accordionBootstrap?: 'default' | 'all';
  /**
   * Opt-in: extra controls rendered in each line's title row, immediately after
   * the ⋮ menu (e.g. the testing page's serial LINK combine control).
   * Omitted callers (unbox) render nothing here — unchanged.
   */
  renderTitleActions?: (line: ReceivingLineRow) => React.ReactNode;
  /**
   * Opt-in: enables Unlink in the title ⋮ for unmatched cartons with a serial
   * (Testing UNLINK / wrong physical item → split onto its own row).
   */
  serialSplit?: Omit<PoLineSerialSplitContext, 'receivingId'>;
  /**
   * Serials cell click → open Units Displays for that line.
   * Omit on surfaces without a Displays host (Shipping, read-only triage).
   */
  onViewAllUnits?: (line: ReceivingLineRow) => void;
}

/**
 * Multi-item PO accordion. Renders the carton's sibling lines with
 * condition/serial editors interleaved under each SKU. The current active
 * line is highlighted for focus / scan-default; clicking a sibling still
 * dispatches `receiving-select-line` to re-seed the workspace controller.
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
  serialSplit,
  placeholderActiveRow,
  embedded = false,
  headerRight,
  suppressHeader = false,
  accordionBootstrap = 'default',
  onViewAllUnits,
}: Props) {
  const { queryKey, allRows, rows, cartonUnitIds, serialsLoading } = usePoLinesData({
    receivingId,
    activeLineId,
    hideNoTestLines,
    placeholderActiveRow,
  });

  // Active row collapse — the chevron toggles the active line's body (slot)
  // closed so a high-qty line (x100 unit rows) doesn't lock the workspace to
  // a wall of rows. Re-expands whenever the active line changes (sync during
  // render so the first paint of the new line isn't collapsed for a frame).
  // `accordionBootstrap === 'all'` forces expanded on open + on line switch.
  const expandAll = accordionBootstrap === 'all';
  const [activeCollapsed, setActiveCollapsed] = useState(false);
  const [collapseForLineId, setCollapseForLineId] = useState(activeLineId);
  if (activeLineId !== collapseForLineId) {
    setCollapseForLineId(activeLineId);
    setActiveCollapsed(false);
  }
  const expandActiveRow = useCallback(() => setActiveCollapsed(false), []);
  const effectiveCollapsed = expandAll ? false : activeCollapsed;
  const toggleCollapsed = useCallback(() => {
    if (expandAll) return;
    setActiveCollapsed((v) => !v);
  }, [expandAll]);

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

  // Embedded → bare wrapper (parent supplies layout). Standalone (testing /
  // other callers) stays a flush plane too — flat hairline list, not a raised
  // card island. The elevated action dock is the only lifted surface.
  const Wrapper = embedded ? 'div' : 'section';
  return (
    <Wrapper className="min-w-0">
      {suppressHeader ? null : (
        <div className="mb-0 flex items-center justify-between">
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
        <ul ref={listRef} className="flex min-w-0 flex-col gap-0">
          {rows.map((line) => (
            <PoLineRow
              key={line.id}
              line={line}
              isActive={line.id === activeLineId}
              readOnly={readOnly}
              animateLayout={layoutActive}
              serialsLoading={serialsLoading}
              activeCollapsed={effectiveCollapsed}
              onToggleCollapsed={toggleCollapsed}
              showInactiveChevron={false}
              activeConditionOverride={activeConditionOverride}
              activeSerialActions={activeSerialActions}
              activeRowSlot={activeRowSlot}
              renderTitleActions={renderTitleActions}
              // The shell owns the mutation; the row stays presentational.
              // `markReceivingSerialAbsent` is the single choke point — it fires
              // the optimistic `receiving-line-updated` patch AND the durable
              // POST, so a waiver set from a collapsed row and one set from the
              // active editor are the same write and the stepper cannot disagree
              // with either.
              onSerialAbsentChange={(lineId, next) =>
                markReceivingSerialAbsent(lineId, next)
              }
              serialSplit={
                serialSplit
                  ? { ...serialSplit, receivingId }
                  : undefined
              }
              onViewAllUnits={onViewAllUnits}
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
