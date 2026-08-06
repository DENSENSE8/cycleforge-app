"use client";

import { type ComponentProps, type ReactNode, type RefObject } from "react";
import { ConditionPills } from "../ConditionPills";
import { SerialCard } from "../SerialCard";
import {
  SerialMatchResult,
  type SerialMatchedOrder,
} from "../SerialMatchResult";
import { ReceivingUnitRows, type UnitSerial } from "../ReceivingUnitRows";
import type { ActiveRowSerial } from "../PoLinesAccordion";
import { NoSerialControl, type SerialAbsentState } from "./NoSerialControl";
import type { UnitSlotView } from "../UnitSlotList";
import { markAllEmptyReceivingUnitsSerialAbsent } from "../receiving-label-helpers";
import { useSetting } from "@/hooks/useSettings";
import { requestConfirm } from "@/design-system/components/confirm";

type SerialLookupView = Pick<
  ComponentProps<typeof SerialMatchResult>,
  "state" | "unit" | "serial" | "matchedOrder"
>;

/**
 * Body rendered inside each PO line's `activeRowSlot` (PoLinesAccordion).
 * Branches on line quantity:
 *  - Multi-qty same-product line → one selectable {@link ReceivingUnitRows} row
 *    per physical unit, each with its own condition grade + serial.
 *  - Single-qty line → one {@link ConditionPills} picker + a flat serial list.
 * When a serial lookup is active, surfaces the serial-match band (RETURN flow).
 *
 * Purely presentational: every mutation is delegated to the parent's existing
 * handlers. The `requestConfirm` guards on delete are gated by the
 * `receiving.confirmSerialRemoval` org setting (Settings Registry; default on).
 *
 * Main Unbox paints condition · serial only on this card. Optional
 * `itemPhotoSlot` remains for lanes that still want a labeled item-evidence
 * row (procedure dock / future per-unit photos); omit it and the row is absent.
 */
export function ActiveLineConditionSerial({
  serials,
  lineId,
  receivingId,
  quantityExpected,
  cond,
  serialSubmitting,
  editingSerial,
  serialLookup,
  onFileReturnClaim,
  onSubmitSerial,
  onDeleteSerialUnit,
  onReplaceSerialUnit,
  onSetUnitGrade,
  onActiveConditionChange,
  onConditionChange,
  onEditingSerialChange,
  serialAbsent,
  serialAbsentReason,
  onSerialAbsentChange,
  requireSerialConfirmation,
  serialInputRef,
  units = null,
  itemPhotoSlot,
  onEditFilledSerial,
  stationCompact = false,
  hideCondition = false,
  flush = false,
  activeRowLeading,
  autoFocusSerial = true,
  showSavedChips = false,
  forceUnitRows = false,
}: {
  serials: ActiveRowSerial[];
  lineId: number;
  receivingId: number | null;
  quantityExpected: number | null;
  cond: string;
  serialSubmitting: boolean;
  editingSerial: ActiveRowSerial | null;
  serialLookup: SerialLookupView;
  /** No-serial waiver state (single-qty only) + handler, from the controller. */
  serialAbsent: boolean;
  serialAbsentReason: string | null;
  onSerialAbsentChange: (next: SerialAbsentState) => void;
  /** Org enforces the serial checkpoint — surfaces the "required" hint. */
  requireSerialConfirmation: boolean;
  /** Materialised per-unit rows for the multi-qty green-check (Phase 3). */
  units?: UnitSlotView[] | null;
  /**
   * Filled unit pencil — open Units display. Optional; in-row replace when absent.
   */
  onEditFilledSerial?: (serial: UnitSerial) => void;
  /**
   * Multi-unit Station body: keep empty scan inputs, but collapse condition
   * controls and completed serials to readouts. Durable editing stays in the
   * Units right-edge display.
   */
  stationCompact?: boolean;
  /**
   * Units Displays feed (legacy): serials only — no ConditionPills / grade circle.
   * Prefer {@link flush} for the Units explosion (in-row collapsible pills).
   */
  hideCondition?: boolean;
  /**
   * Units Displays flush chrome: square serial rows, hairline dividers,
   * underline/joined fields. Per-unit ConditionPills expand collapses photo + serial.
   */
  flush?: boolean;
  /**
   * Item-camera control on every flush unit row (e.g. line-scoped photos).
   * Sits after the condition tag. Units explosion mounts
   * {@link ReceivingPhotoButton} here — not a standalone ITEM PHOTOS section.
   */
  activeRowLeading?: ReactNode;
  /**
   * Autofocus the serial input. Only the controller-active interleaved line
   * should pass true — otherwise every SKU body fights for the caret.
   */
  autoFocusSerial?: boolean;
  /**
   * Show saved serial chips under the scan field. Centre PO accordion keeps
   * chips in the meta row (`false`); rarely used when {@link forceUnitRows}
   * is on (Units Displays lists one row per serial instead).
   */
  showSavedChips?: boolean;
  /**
   * Always use per-unit rows ({@link ReceivingUnitRows}), even when
   * quantity_expected is 1. Units Displays explosion needs one editable row
   * per serial — not a single SerialCard with chips.
   */
  forceUnitRows?: boolean;
  /** RETURN match CTA — pair the order + open the prefilled claim. */
  onFileReturnClaim?: (matchedOrder: SerialMatchedOrder | null) => void;
  /** Programmatic focus target for the dock Add serial handoff. */
  serialInputRef?: RefObject<HTMLInputElement | null>;
  /**
   * Optional item-evidence control. Main Unbox omits this (condition · serial
   * only). When provided, renders the labeled Item photos row above the body.
   */
  itemPhotoSlot?: ReactNode;
  onSubmitSerial: (
    raw?: string,
    conditionGrade?: string | null,
  ) => void | Promise<void>;
  onDeleteSerialUnit: (serialUnitId: number, lineId?: number) => void;
  onReplaceSerialUnit: (
    original: {
      id: number;
      serial_number: string;
      condition_grade?: string | null;
    },
    nextSerial: string,
  ) => void;
  onSetUnitGrade: (serialUnitId: number, grade: string) => void;
  onActiveConditionChange: (next: string | null) => void;
  onConditionChange: (next: string) => void;
  onEditingSerialChange: (next: ActiveRowSerial | null) => void;
}) {
  // Settings Registry: org policy for the destructive serial-remove confirm
  // (default on — falls back to the prior always-confirm UX while loading).
  const { value: confirmSerialRemoval } = useSetting<boolean>(
    "receiving",
    "receiving.confirmSerialRemoval",
  );
  const shouldConfirmRemoval = confirmSerialRemoval ?? true;
  // Units Displays always explodes into per-serial rows. Centre accordion
  // still uses qty>1 for ReceivingUnitRows vs single SerialCard.
  const isMultiQty = forceUnitRows || (quantityExpected ?? 0) > 1;
  // Match band only for resolved outcomes. Searching is a spinner in the
  // trailing check cell — never a band under the field.
  const matchResult =
    serialLookup.state === "found" || serialLookup.state === "not-found" ? (
      <SerialMatchResult
        state={serialLookup.state}
        unit={serialLookup.unit}
        serial={serialLookup.serial}
        matchedOrder={serialLookup.matchedOrder}
        onFileClaim={onFileReturnClaim}
      />
    ) : undefined;
  const lookupBusy = serialLookup.state === "searching";

  return (
    <div className={flush ? 'min-w-0' : 'min-w-0 space-y-2'}>
      {/* Item photos — house eyebrow header + right action slot. Labeled, so the
          step the checklist points at is legible on the work surface itself.
          Units explosion uses activeRowLeading instead (after condition on every unit row). */}
      {itemPhotoSlot ? (
        <div
          className="flex min-w-0 items-center justify-between gap-2"
          data-unbox-item-photos
        >
          <p className="truncate text-role-eyebrow uppercase tracking-widest text-text-soft">
            Item photos
          </p>
          {/* Bleed the pill's hit-box so it cannot grow the row. */}
          <div className="-my-0.5 shrink-0">{itemPhotoSlot}</div>
        </div>
      ) : null}

      {isMultiQty ? (
        // Multi-qty same-product line: split into one selectable row per
        // physical unit, each with its own condition grade and serial. The
        // selected unit's grade is reported up via onActiveConditionChange so
        // the header badge + label preview track that unit.
        <>
          <ReceivingUnitRows
            lineId={lineId}
            saved={serials as UnitSerial[]}
            units={units}
            quantityExpected={Math.max(
              quantityExpected ?? 1,
              serials.length,
              units?.length ?? 0,
              1,
            )}
            lineCondition={cond}
            defaultAbsentReason={serialAbsentReason}
            disabled={!receivingId}
            isSubmitting={serialSubmitting}
            requireSerialConfirmation={requireSerialConfirmation}
            serialInputRef={serialInputRef}
            serialEditTarget={
              editingSerial?.id != null ? (editingSerial as UnitSerial) : null
            }
            onAddSerial={(sn, grade) => onSubmitSerial(sn, grade)}
            onDeleteSerial={async (id) => {
              if (
                shouldConfirmRemoval &&
                !(await requestConfirm({
                  description: "Remove this serial?",
                  tone: "danger",
                  confirmLabel: "Remove",
                }))
              ) {
                return;
              }
              onDeleteSerialUnit(id, lineId);
            }}
            onReplaceSerial={(original, next) =>
              onReplaceSerialUnit(original, next)
            }
            onSetUnitGrade={(id, grade) => onSetUnitGrade(id, grade)}
            onConditionChange={onConditionChange}
            onActiveConditionChange={onActiveConditionChange}
            // Icon-only no-serial toggle in the top-right of the unit list.
            // Line-level waiver also stamps empty unit rows (qty roll-up / bulk).
            noSerialControl={
              <NoSerialControl
                variant="check"
                appearance="flush"
                absent={serialAbsent}
                reason={serialAbsentReason}
                required={requireSerialConfirmation}
                disabled={!receivingId}
                onChange={(next) => {
                  onSerialAbsentChange(next);
                  if (next.absent && next.reason) {
                    markAllEmptyReceivingUnitsSerialAbsent(
                      lineId,
                      next.reason,
                      units,
                    );
                  }
                }}
              />
            }
            onEditFilledSerial={onEditFilledSerial}
            stationCompact={stationCompact}
            hideCondition={hideCondition}
            flush={flush}
            activeRowLeading={activeRowLeading}
          />
          {/* RETURN-only: serial-match result under the unit rows. */}
          {matchResult ?? null}
        </>
      ) : (
        // Single-qty line (incl. a PARTS product carrying several part-serials
        // under one unit): integrated condition picker + serial card. The
        // no-serial waiver sits directly under the input when no serial exists.
        <>
          <div
            className={
              flush && activeRowLeading
                ? 'flex min-w-0 items-stretch gap-0 border-b border-border-hairline'
                : undefined
            }
          >
            {flush && activeRowLeading ? (
              <div className="flex h-11 w-11 shrink-0 items-stretch [&>*]:h-full [&>*]:w-full">
                {activeRowLeading}
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <SerialCard
                saved={serials}
                expected={quantityExpected ?? null}
                isSubmitting={serialSubmitting}
                disabled={!receivingId}
                embedded
                autoFocusInput={autoFocusSerial}
                focusKey={lineId}
                externalInputRef={serialInputRef}
                showSavedChips={showSavedChips}
                editingSerial={editingSerial}
                onEditingSerialChange={onEditingSerialChange}
                resultSlot={matchResult}
                lookupBusy={lookupBusy}
                condition={hideCondition ? undefined : cond}
                onConditionChange={hideCondition ? undefined : onConditionChange}
                // Collapsed picker: filled circle (grade hue) + white Tags icon.
                // Meta-row ConditionGradeChip stays the labeled readout.
                collapsedConditionLabel={true}
                onAdd={(sn) => onSubmitSerial(sn, cond)}
                noSerialActive={serialAbsent}
                onMarkNoSerial={() =>
                  onSerialAbsentChange(
                    serialAbsent
                      ? { absent: false, reason: null }
                      : {
                          absent: true,
                          reason: serialAbsentReason ?? "NOT_SERIALIZED",
                        },
                  )
                }
                noSerialSlot={
                  <NoSerialControl
                    absent
                    fullWidth
                    hideClear
                    reason={serialAbsentReason}
                    required={requireSerialConfirmation}
                    disabled={!receivingId}
                    onChange={onSerialAbsentChange}
                  />
                }
                onReplaceSerial={(original, nextSerial) => {
                  if (original.id == null) return;
                  onReplaceSerialUnit(
                    {
                      id: original.id,
                      serial_number: original.serial_number,
                      condition_grade: original.condition_grade,
                    },
                    nextSerial,
                  );
                }}
                onDeleteSerial={async (s) => {
                  if (s.id == null) return;
                  if (
                    shouldConfirmRemoval &&
                    !(await requestConfirm({
                      description: `Remove serial ${s.serial_number}?`,
                      tone: "danger",
                      confirmLabel: "Remove",
                    }))
                  ) {
                    return;
                  }
                  onDeleteSerialUnit(s.id, lineId);
                }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
