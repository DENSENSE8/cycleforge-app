'use client';

import { useCallback, useMemo, useRef } from 'react';
import { LayoutGroup } from '@/design-system/motion';
import { WORKSPACE_SECTION_TITLE_CLASS } from './WorkspaceSectionLabel';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import { CartonAddAction } from './CartonAddAction';
import { PoLineRow } from './PoLineRow';
import { markReceivingSerialAbsent } from './receiving-label-helpers';
import { usePoLinesData } from './hooks/usePoLinesData';
import type { PoLineSerialSplitContext } from './PoLineTitleMenu';
import type {
  ActiveRowSlot,
  PoLineSerialActions,
} from './po-lines-accordion-types';
import { singleBand } from '@/lib/group-rows';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { useRecordCursorKeyboard } from '@/hooks/useRecordCursorKeyboard';
import { setActiveSinkId } from '@/lib/station-scan-sink';
import { useLineCollapse, type LineCollapseController } from '@/components/station/collapse';
import { scheduleFocusUnboxCaptureSerialInLine } from './line-edit/focus-unbox-capture-serial';

// Type re-exports — ActiveLineConditionSerial / Units hosts import from here.
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
   * Carton-open snapshot of `receiving.accordionExpand`. Currently inert — the
   * per-line collapse chevron was removed (capture lives in the bottom dock),
   * so bodies are always expanded. Kept on the API for caller compatibility and
   * in case expand-all-on-open returns.
   */
  accordionBootstrap?: 'default' | 'all';
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
  /** Unbox Action Dock — PO meta condition/serial → focus dock step. */
  onEditConditionInDock?: (line: ReceivingLineRow) => void;
  onEditSerialInDock?: (line: ReceivingLineRow) => void;
  /**
   * When false, meta collapses to qty | SKU | price and unit editors stay off
   * (Arrival door flow). Defaults true (Unbox / Testing).
   */
  unitsChrome?: boolean;
  /**
   * SHARE the host's line-collapse controller instead of the accordion's own.
   *
   * Optional because this component owns one by default — every PO-line list in
   * the app discloses the same way without its host re-deriving the rule. Pass
   * one only when a control ABOVE the list has to reach the lines: the Unbox and
   * Testing Items bands both carry "Collapse all", and a band that collapsed
   * itself while the lines underneath stayed open would hand the column back and
   * then take it again the moment the band re-opened.
   */
  lineCollapse?: LineCollapseController;
}

/**
 * Multi-item PO accordion. Renders the carton's sibling lines with
 * condition/serial editors interleaved under each SKU. The current active
 * line is highlighted for focus / scan-default; clicking a sibling still
 * dispatches `receiving-select-line` to re-seed the workspace controller.
 *
 * Publishes the record-cursor **`sibling`** scope so ambient ↑/↓ steps PO
 * lines while the carton middle is open (←/→ stay on procedure steps). Carton
 * hopping stays on the recents rail / History triage
 * `record` scope — not ambient arrows here.
 *
 * A thin shell over two collaborators (per the god-component cleanup):
 * - {@link usePoLinesData} — sibling query + cache-coordination bus.
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
  serialSplit,
  placeholderActiveRow,
  embedded = false,
  headerRight,
  suppressHeader = false,
  onViewAllUnits,
  onEditConditionInDock,
  onEditSerialInDock,
  unitsChrome = true,
  lineCollapse,
}: Props) {
  // The list is the owner: one controller for every row it renders, replaced by
  // the host's when the host has a Collapse all to drive it from.
  const ownLineCollapse = useLineCollapse(activeLineId);
  const lines = lineCollapse ?? ownLineCollapse;

  const { rows, cartonUnitIds, serialsLoading } = usePoLinesData({
    receivingId,
    activeLineId,
    hideNoTestLines,
    placeholderActiveRow,
  });

  // Ops capture bodies snap open — never Framer `layout` tween when under-row
  // faces mount or update (reads as a dropdown).
  const listRef = useRef<HTMLUListElement>(null);

  const paintRows = useMemo((): ReceivingLineRow[] => {
    if (rows.length > 0) return rows;
    if (placeholderActiveRow && placeholderActiveRow.id > 0) {
      return [placeholderActiveRow];
    }
    return [];
  }, [rows, placeholderActiveRow]);

  const siblingOrder = useMemo(() => singleBand(paintRows), [paintRows]);

  const openSiblingLine = useCallback(
    (line: ReceivingLineRow) => {
      setActiveSinkId(`po-line:${line.id}`);
      dispatchSelectLine(line);
      // Stepping onto a line asks for its capture bar. Selecting it usually
      // expands it by the default rule anyway; this covers the case where the
      // operator had pinned it shut.
      lines.expand(line.id);
      // Focus THIS line's capture serial — not active-step (lags a paint) and
      // not the dock wedge. Same target as qty click / in-field ↑↓.
      scheduleFocusUnboxCaptureSerialInLine(line.id, 60);
    },
    [lines],
  );

  const handleSiblingCursorOpen = useCallback(
    (line: ReceivingLineRow) => {
      openSiblingLine(line);
    },
    [openSiblingLine],
  );

  // ↑/↓ = PO lines inside the open carton (`sibling` scope). Enabled whenever
  // the accordion is interactive — Testing + Unbox share this grammar. Carton
  // ambient `record` keys are History-triage only today, so they do not fight.
  usePublishRecordCursor<ReceivingLineRow>({
    surfaceId: `po-lines-sibling-${receivingId}`,
    scope: 'sibling',
    enabled: !readOnly && paintRows.length > 0,
    order: siblingOrder,
    openId: activeLineId > 0 ? activeLineId : null,
    getId: (row) => row.id,
    onOpen: handleSiblingCursorOpen,
  });

  useRecordCursorKeyboard({
    enabled: !readOnly && paintRows.length > 0,
    scope: 'sibling',
  });

  // Always render — even for single-line POs the row layout (title, qty,
  // sku, price, condition, serial chip) is the canonical context display the
  // workspace expects above the body. Never blank while we still have a
  // known active row (cold siblings key / in-flight fetch).
  if (paintRows.length === 0) {
    return null;
  }

  // Embedded → bare wrapper (parent supplies layout). Standalone (testing /
  // other callers) stays a flush plane too — flat hairline list, not a raised
  // card island. The elevated action dock is the only lifted surface.
  const Wrapper = embedded ? 'div' : 'section';
  return (
    <Wrapper className="min-w-0">
      {suppressHeader ? null : (
        <div className="mb-0 flex items-center justify-between">
          <h3 className={WORKSPACE_SECTION_TITLE_CLASS}>
            PO items · {paintRows.length}
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
          {paintRows.map((line) => (
            <PoLineRow
              key={line.id}
              line={line}
              isActive={line.id === activeLineId}
              readOnly={readOnly}
              animateLayout={false}
              serialsLoading={serialsLoading}
              activeConditionOverride={unitsChrome ? activeConditionOverride : undefined}
              activeSerialActions={unitsChrome ? activeSerialActions : undefined}
              activeRowSlot={unitsChrome ? activeRowSlot : undefined}
              // The shell owns the mutation; the row stays presentational.
              // `markReceivingSerialAbsent` is the single choke point — it fires
              // the optimistic `receiving-line-updated` patch AND the durable
              // POST, so a waiver set from a collapsed row and one set from the
              // active editor are the same write and the stepper cannot disagree
              // with either. Arrival (`unitsChrome={false}`) never stamps serials.
              onSerialAbsentChange={
                unitsChrome
                  ? (lineId, next) =>
                      markReceivingSerialAbsent(lineId, next, {
                        serial_absent: line.serial_absent ?? false,
                        serial_absent_reason: line.serial_absent_reason ?? null,
                      })
                  : undefined
              }
              serialSplit={
                unitsChrome && serialSplit
                  ? { ...serialSplit, receivingId }
                  : undefined
              }
              onViewAllUnits={unitsChrome ? onViewAllUnits : undefined}
              onEditConditionInDock={
                unitsChrome ? onEditConditionInDock : undefined
              }
              onEditSerialInDock={unitsChrome ? onEditSerialInDock : undefined}
              unitsChrome={unitsChrome}
              // Unconditional: a row with no capture body drops the control
              // itself (ItemRecordRow → `canDisclose`), so a read-only ledger
              // never grows a toggle and no caller has to know which is which.
              collapse={{
                expanded: lines.isExpanded(line.id),
                onToggle: () => lines.toggle(line.id),
                onExpand: () => lines.expand(line.id),
              }}
            />
          ))}
        </ul>
      </LayoutGroup>
    </Wrapper>
  );
}
