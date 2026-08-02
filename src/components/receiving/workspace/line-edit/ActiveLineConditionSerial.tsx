'use client';

import { type ComponentProps, type ReactNode, type RefObject } from 'react';
import { ConditionPills } from '../ConditionPills';
import { SerialCard } from '../SerialCard';
import { SerialMatchResult, type SerialMatchedOrder } from '../SerialMatchResult';
import { ReceivingUnitRows, type UnitSerial } from '../ReceivingUnitRows';
import type { ActiveRowSerial } from '../PoLinesAccordion';
import { NoSerialControl, type SerialAbsentState } from './NoSerialControl';
import type { UnitSlotView } from '../UnitSlotList';
import { markAllEmptyReceivingUnitsSerialAbsent } from '../receiving-label-helpers';
import { useSetting } from '@/hooks/useSettings';
import { requestConfirm } from '@/design-system/components/confirm';

type SerialLookupView = Pick<
  ComponentProps<typeof SerialMatchResult>,
  'state' | 'unit' | 'serial' | 'matchedOrder'
>;

/**
 * Body rendered inside the active PO line's `activeRowSlot` (PoLinesAccordion).
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
 * ## Why item photos hang here
 *
 * `itemPhotoSlot` is the desktop's only item-evidence affordance. Item photos →
 * condition → serial are three consecutive steps of the unbox procedure
 * (`derive-capture-step-states.ts`), and the last two already live on this card;
 * the first had no desktop surface at all until 2026-08-01 — the phone could
 * shoot `unbox_item`, the bench could not even upload one. It is a SLOT, not a
 * mounted pill, so this component stays presentational and each lane decides
 * for itself whether it has item evidence to capture.
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
  /** RETURN match CTA — pair the order + open the prefilled claim. */
  onFileReturnClaim?: (matchedOrder: SerialMatchedOrder | null) => void;
  /** Programmatic focus target for the dock Add serial handoff. */
  serialInputRef?: RefObject<HTMLInputElement | null>;
  /**
   * Item-evidence control for THIS line — the desktop `unbox_item` pill. Omit
   * on a lane with no item evidence to capture; the labeled step row is not
   * rendered at all when absent (honest absence beats a dead affordance).
   */
  itemPhotoSlot?: ReactNode;
  onSubmitSerial: (raw?: string, conditionGrade?: string | null) => void | Promise<void>;
  onDeleteSerialUnit: (serialUnitId: number, lineId?: number) => void;
  onReplaceSerialUnit: (
    original: { id: number; serial_number: string; condition_grade?: string | null },
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
    'receiving',
    'receiving.confirmSerialRemoval',
  );
  const shouldConfirmRemoval = confirmSerialRemoval ?? true;
  const isMultiQty = (quantityExpected ?? 0) > 1;
  // Serial-match band only when a lookup is in flight / resolved. Idle must
  // pass `undefined` (not a null-rendering element) so SerialCard does not
  // reserve the resultSlot's mt-3 — that ghost margin was the extra bottom
  // padding on RETURN / return-serial accordion rows vs the PO-line SoT.
  const matchResult =
    serialLookup.state !== 'idle' ? (
      <SerialMatchResult
        state={serialLookup.state}
        unit={serialLookup.unit}
        serial={serialLookup.serial}
        matchedOrder={serialLookup.matchedOrder}
        onFileClaim={onFileReturnClaim}
      />
    ) : undefined;

  return (
    <div className="min-w-0 space-y-2">
      {/* Item photos — house eyebrow header + right action slot. Labeled, so the
          step the checklist points at is legible on the work surface itself. */}
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
            quantityExpected={quantityExpected ?? 1}
            lineCondition={cond}
            defaultAbsentReason={serialAbsentReason}
            disabled={!receivingId}
            isSubmitting={serialSubmitting}
            requireSerialConfirmation={requireSerialConfirmation}
            serialInputRef={serialInputRef}
            serialEditTarget={editingSerial?.id != null ? (editingSerial as UnitSerial) : null}
            onAddSerial={(sn, grade) => onSubmitSerial(sn, grade)}
            onDeleteSerial={async (id) => {
              if (
                shouldConfirmRemoval &&
                !(await requestConfirm({
                  description: 'Remove this serial?',
                  tone: 'danger',
                  confirmLabel: 'Remove',
                }))
              ) {
                return;
              }
              onDeleteSerialUnit(id);
            }}
            onReplaceSerial={(original, next) => onReplaceSerialUnit(original, next)}
            onSetUnitGrade={(id, grade) => onSetUnitGrade(id, grade)}
            onConditionChange={onConditionChange}
            onActiveConditionChange={onActiveConditionChange}
            // Icon-only no-serial toggle in the top-right of the unit list.
            // Line-level waiver also stamps empty unit rows (qty roll-up / bulk).
            noSerialControl={
              <NoSerialControl
                variant="check"
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
          />
          {/* RETURN-only: serial-match result under the unit rows. */}
          {matchResult ?? null}
        </>
      ) : (
        // Single-qty line (incl. a PARTS product carrying several part-serials
        // under one unit): integrated condition picker + serial card. The
        // no-serial waiver sits directly under the input when no serial exists.
        <>
        <SerialCard
          saved={serials}
          expected={quantityExpected ?? null}
          isSubmitting={serialSubmitting}
          disabled={!receivingId}
          embedded
          autoFocusInput
          focusKey={lineId}
          externalInputRef={serialInputRef}
          showSavedChips={false}
          editingSerial={editingSerial}
          onEditingSerialChange={onEditingSerialChange}
          resultSlot={matchResult}
          condition={cond}
          onConditionChange={onConditionChange}
          // Collapsed picker: filled circle (grade hue) + white Tags icon.
          // Meta-row ConditionGradeChip stays the labeled readout.
          collapsedConditionLabel={true}
          onAdd={(sn) => onSubmitSerial(sn, cond)}
          noSerialActive={serialAbsent}
          onMarkNoSerial={() =>
            onSerialAbsentChange(
              serialAbsent
                ? { absent: false, reason: null }
                : { absent: true, reason: serialAbsentReason ?? 'NOT_SERIALIZED' },
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
                tone: 'danger',
                confirmLabel: 'Remove',
              }))
            ) {
              return;
            }
            onDeleteSerialUnit(s.id);
          }}
        />
        </>
      )}
    </div>
  );
}
