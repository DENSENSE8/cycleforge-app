"use client";

import { type ComponentProps, type ReactNode, type RefObject } from "react";
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
import { resolveCaptureEntry } from "../line-receive-mode";
import { PoLineUnitCaptureList } from "./PoLineUnitCaptureList";

type SerialLookupView = Pick<
  ComponentProps<typeof SerialMatchResult>,
  "state" | "unit" | "serial" | "matchedOrder"
>;

/** Body rendered inside each PO line's `activeRowSlot` (PoLinesAccordion). */
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
  onOpenReturnHistory,
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
  autoCommitDefaultGrade = false,
  showSavedChips = false,
  forceUnitRows = false,
  dockOwnsCapture = false,
  isActiveLine = false,
  activeStep = null,
  staffId = 0,
  poRef = null,
  poRouteRef = null,
  onArmCapture,
}: {
  serials: ActiveRowSerial[];
  lineId: number;
  receivingId: number | null;
  quantityExpected: number | null;
  cond: string;
  serialSubmitting: boolean;
  editingSerial: ActiveRowSerial | null;
  serialLookup: SerialLookupView;
  /** No-serial waiver state (single-qty / stamp-all) + handler, from the controller. */
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
   * Fresh scan / ungraded line: commit the default USED_A grade once on mount
   * (optimistic stamp via onConditionChange) so the face + procedure agree.
   */
  autoCommitDefaultGrade?: boolean;
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
  /** RETURN match — open Displays Timeline for full serial genealogy. */
  onOpenReturnHistory?: () => void;
  /** Programmatic focus target for the dock Add serial handoff. */
  serialInputRef?: RefObject<HTMLInputElement | null>;
  /**
   * Optional item-evidence control (Units explosion / flush lanes). Unbox
   * centre uses the capture row's Photos segment instead.
   */
  itemPhotoSlot?: ReactNode;
  /**
   * FACTS, not a conclusion — {@link resolveCaptureEntry} owns whether this
   * line mounts the capture row.
   */
  dockOwnsCapture?: boolean;
  /** Autofocus / controller binding only — does not gate capture mount. */
  isActiveLine?: boolean;
  /** The dock's `activeKey` (Unbox `dockOwnsCapture` only), passed ONLY for the controller-active line — drives the capture face's moving… */
  activeStep?: string | null;
  staffId?: number;
  poRef?: string | null;
  poRouteRef?: string | null;
  /**
   * Sibling capture faces: promote this line to the workspace controller before
   * arming serial so `data-active-step` / scan sink catch up with the click.
   */
  onArmCapture?: () => void;
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
  const mode = resolveCaptureEntry({
    dockOwnsCapture,
    isActiveLine,
    flush,
    forceUnitRows,
    receivingId,
    lineId,
    quantityExpected: quantityExpected ?? 0,
    serialCount: serials.length,
  });
  const capture = mode === 'capture-unit' || mode === 'capture-rollup';
  const isMultiQty = mode === 'unit-rows';

  const confirmDelete = async (serialUnitId: number, label?: string) => {
    if (
      shouldConfirmRemoval &&
      !(await requestConfirm({
        description: label
          ? `Remove serial ${label}?`
          : "Remove this serial?",
        tone: "danger",
        confirmLabel: "Remove",
      }))
    ) {
      return;
    }
    onDeleteSerialUnit(serialUnitId, lineId);
  };

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
        onOpenHistory={onOpenReturnHistory}
      />
    ) : undefined;
  const lookupBusy = serialLookup.state === "searching";

  return (
    <div className={flush ? "min-w-0" : "min-w-0 space-y-2"}>
      {/* Item photos — house eyebrow header + right action slot. Labeled, so the
          step the checklist points at is legible on the work surface itself.
          Units explosion uses activeRowLeading instead (after condition on every unit row). */}
      {itemPhotoSlot ? (
        <div
          className="flex min-w-0 items-center justify-between gap-2"
          data-unbox-item-photos
        >
          <p className="truncate text-role-eyebrow text-text-soft">
            Item photos
          </p>
          {/* Bleed the pill's hit-box so it cannot grow the row. */}
          <div className="-my-0.5 shrink-0">{itemPhotoSlot}</div>
        </div>
      ) : null}

      {capture ? (
        <PoLineUnitCaptureList
          lineId={lineId}
          receivingId={receivingId}
          quantityExpected={Math.max(
            quantityExpected ?? 1,
            serials.length,
            units?.length ?? 0,
            1,
          )}
          saved={serials as UnitSerial[]}
          units={units}
          lineCondition={cond}
          disabled={!receivingId}
          serialAbsent={serialAbsent}
          activeStep={activeStep}
          staffId={staffId}
          poRef={poRef}
          poRouteRef={poRouteRef}
          onConditionChange={onConditionChange}
          onAddSerial={(sn) => onSubmitSerial(sn, cond)}
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
          lookupBusy={lookupBusy}
          editingSerial={editingSerial}
          onEditingSerialChange={onEditingSerialChange}
          autoFocusSerial={autoFocusSerial}
          autoCommitDefaultGrade={autoCommitDefaultGrade}
          onArmCapture={onArmCapture}
        />
      ) : isMultiQty ? (
        // Units Displays / non-progressive multi: compact unit rows.
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
              await confirmDelete(id);
            }}
            onReplaceSerial={(original, next) =>
              onReplaceSerialUnit(original, next)
            }
            onSetUnitGrade={(id, grade) => onSetUnitGrade(id, grade)}
            onConditionChange={onConditionChange}
            onActiveConditionChange={onActiveConditionChange}
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
          {matchResult ?? null}
        </>
      ) : (
        // Non-progressive single-qty (Testing / Arrival / unmatched).
        <>
          <div
            className={
              flush && activeRowLeading
                ? // Outermost joined shell owns top+bottom hairlines + soft
                  // column seam into Serial (one seam each, Serial stays border-0).
                  "flex min-w-0 items-stretch gap-0 border-y border-border-hairline divide-x divide-border-soft"
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
                omitBottomHairline={Boolean(flush && activeRowLeading)}
                autoFocusInput={autoFocusSerial}
                focusKey={lineId}
                externalInputRef={serialInputRef}
                showSavedChips={showSavedChips}
                editingSerial={editingSerial}
                onEditingSerialChange={onEditingSerialChange}
                resultSlot={matchResult}
                lookupBusy={lookupBusy}
                condition={hideCondition ? undefined : cond}
                onConditionChange={
                  hideCondition ? undefined : onConditionChange
                }
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
                  await confirmDelete(s.id, s.serial_number);
                }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
