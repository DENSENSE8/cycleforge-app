'use client';

/**
 * The serial half of the old `ActiveLineConditionSerial`, as its own surface.
 *
 * That component did three jobs — item photos, condition, and serial — inside
 * one accordion row slot, which is precisely why the flow could not be stepped:
 * there was no seam to put a step boundary on. Each job is now a step, and this
 * is the one that carries real wiring (a dozen handlers off the controller).
 *
 * ## It lives in the DOCK, not the step body (2026-08-02)
 *
 * Ruled with the other step actions: the card reads, the dock acts. The scan
 * field used to mount as the `serial` step's body above the deck faces — a
 * second input strip the hand had to leave the dock band to reach. It is now
 * the dock's `SerialDockControl` slot ({@link buildUnboxStepDock}), so Enter /
 * wedge land where Print · Receive already sit. Saved chips stay on the items
 * panel; the step body is empty on purpose.
 *
 * Multi-qty branches to one selectable row per physical unit; single-qty renders
 * the integrated serial card. The no-serial waiver is the EXISTING
 * `serial_absent` store via {@link NoSerialControl} — the serial step must never
 * grow a second waiver, which would be the note-vs-label grain mistake in a new
 * shape.
 */

import { useEffect, type RefObject } from 'react';
import { SerialCard } from '../../SerialCard';
import { SerialMatchResult, type SerialMatchedOrder } from '../../SerialMatchResult';
import { ReceivingUnitRows, type UnitSerial } from '../../ReceivingUnitRows';
import type { UnitSlotView } from '../../UnitSlotList';
import type { ActiveRowSerial } from '../../PoLinesAccordion';
import { NoSerialControl } from '../NoSerialControl';
import { markAllEmptyReceivingUnitsSerialAbsent } from '../../receiving-label-helpers';
import { useSetting } from '@/hooks/useSettings';
import { useReceivingEvents } from '@/hooks/useReceivingEvents';
import { requestConfirm } from '@/design-system/components/confirm';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

/** Focus the dock serial field — wedge target while the serial step is active. */
function focusDockSerial(ref: RefObject<HTMLInputElement | null> | undefined) {
  const el = ref?.current;
  if (!el || el.disabled) return;
  el.focus({ preventScroll: true });
  el.select();
}

interface SerialStepController {
  cond: string;
  serialSubmitting: boolean;
  headerSerialEdit: ActiveRowSerial | null;
  serialLookup: {
    state: string;
    unit: unknown;
    serial: string | null;
    matchedOrder: SerialMatchedOrder | null;
  };
  serialAbsent: boolean;
  serialAbsentReason: string | null;
  requireSerialConfirmation: boolean;
  serialRef?: RefObject<HTMLInputElement | null>;
  isMultiQtyLine?: boolean;
  activeRowSerials?: ActiveRowSerial[];
  activeRowUnits?: unknown[] | null;
  setHeaderSerialEdit: (next: ActiveRowSerial | null) => void;
  setUnitLabelCondition: (next: string | null) => void;
  setCond: (next: string) => void;
  enqueueSerial: (raw?: string, grade?: string | null) => void | Promise<void>;
  deleteSerialUnit: (id: number, lineId?: number) => void | Promise<void>;
  replaceSerialUnit: (
    original: { id: number; serial_number: string; condition_grade?: string | null },
    next: string,
  ) => void | Promise<void>;
  setUnitGrade: (id: number, grade: string) => void | Promise<void>;
  commitSerialAbsent: (next: { absent: boolean; reason: string | null }) => void;
  handleFileReturnClaim?: (matchedOrder: SerialMatchedOrder | null) => void;
  patch: (patch: Record<string, unknown>) => void | Promise<void>;
}

export function UnboxSerialStepSurface({
  row,
  c,
  serials,
  units,
}: {
  row: ReceivingLineRow;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- unbox controller return
  c: SerialStepController | any;
  /** Authoritative serials for this line, from the accordion's query. */
  serials?: ActiveRowSerial[];
  units?: UnitSlotView[] | null;
}) {
  const { value: confirmSerialRemoval } = useSetting<boolean>(
    'receiving',
    'receiving.confirmSerialRemoval',
  );
  const shouldConfirmRemoval = confirmSerialRemoval ?? true;

  const receivingId = row.receiving_id ?? null;
  const lineId = row.id;
  const quantityExpected = row.quantity_expected ?? null;
  const isMultiQty = (quantityExpected ?? 0) > 1;
  const saved: ActiveRowSerial[] =
    serials ?? ((row.serials as ActiveRowSerial[] | undefined) ?? []);

  // This surface only mounts while the serial step owns the dock leading zone.
  // Autofocus + claim receiving-focus-scan so the wedge never lands in the
  // sidebar scan bar (or nowhere) while the operator is mid-trio.
  useEffect(() => {
    const t = window.setTimeout(() => focusDockSerial(c.serialRef), 0);
    return () => window.clearTimeout(t);
  }, [c.serialRef, lineId]);

  useReceivingEvents({
    'receiving-focus-scan': () => {
      requestAnimationFrame(() => focusDockSerial(c.serialRef));
    },
  });

  // Idle must pass `undefined` (not a null-rendering element) so SerialCard does
  // not reserve the resultSlot's margin — that ghost gap was the extra padding
  // on RETURN rows against the PO-line SoT.
  const matchResult =
    c.serialLookup?.state !== 'idle' ? (
      <SerialMatchResult
        state={c.serialLookup.state}
        unit={c.serialLookup.unit}
        serial={c.serialLookup.serial}
        matchedOrder={c.serialLookup.matchedOrder}
        onFileClaim={c.handleFileReturnClaim}
      />
    ) : undefined;

  if (isMultiQty) {
    return (
      <div className="flex h-11 min-w-0 items-center overflow-x-auto overflow-y-hidden">
        <ReceivingUnitRows
          lineId={lineId}
          saved={saved as UnitSerial[]}
          units={units ?? null}
          quantityExpected={quantityExpected ?? 1}
          lineCondition={c.cond}
          defaultAbsentReason={c.serialAbsentReason}
          disabled={!receivingId}
          isSubmitting={c.serialSubmitting}
          requireSerialConfirmation={c.requireSerialConfirmation}
          serialInputRef={c.serialRef}
          serialEditTarget={
            c.headerSerialEdit?.id != null ? (c.headerSerialEdit as UnitSerial) : null
          }
          onAddSerial={(sn: string, grade: string | null) => c.enqueueSerial(sn, grade)}
          onDeleteSerial={async (id: number) => {
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
            void c.deleteSerialUnit(id);
          }}
          onReplaceSerial={(
            original: { id: number; serial_number: string; condition_grade?: string | null },
            next: string,
          ) => void c.replaceSerialUnit(original, next)}
          onSetUnitGrade={(id: number, grade: string) => void c.setUnitGrade(id, grade)}
          onConditionChange={(next: string) => {
            c.setCond(next);
            void c.patch({ condition_grade: next });
          }}
          onActiveConditionChange={c.setUnitLabelCondition}
          noSerialControl={
            <NoSerialControl
              variant="check"
              absent={c.serialAbsent}
              reason={c.serialAbsentReason}
              required={c.requireSerialConfirmation}
              disabled={!receivingId}
              onChange={(next) => {
                c.commitSerialAbsent(next);
                if (next.absent && next.reason) {
                  markAllEmptyReceivingUnitsSerialAbsent(
                    lineId,
                    next.reason,
                    units ?? null,
                  );
                }
              }}
            />
          }
        />
        {matchResult ?? null}
      </div>
    );
  }

  return (
    <SerialCard
      saved={saved}
      expected={quantityExpected}
      isSubmitting={c.serialSubmitting}
      disabled={!receivingId}
      embedded
      autoFocusInput
      focusKey={lineId}
      externalInputRef={c.serialRef}
      showSavedChips={false}
      editingSerial={c.headerSerialEdit}
      onEditingSerialChange={c.setHeaderSerialEdit}
      resultSlot={matchResult}
      // No condition picker here — grade is its own step (`ConditionDockControl`).
      // Stamping `c.cond` on add still inherits whatever the condition step set.
      onAdd={(sn: string) => c.enqueueSerial(sn, c.cond)}
      noSerialActive={c.serialAbsent}
      onMarkNoSerial={() =>
        c.commitSerialAbsent(
          c.serialAbsent
            ? { absent: false, reason: null }
            : { absent: true, reason: c.serialAbsentReason ?? 'NOT_SERIALIZED' },
        )
      }
      noSerialSlot={
        <NoSerialControl
          absent
          fullWidth
          hideClear
          reason={c.serialAbsentReason}
          required={c.requireSerialConfirmation}
          disabled={!receivingId}
          onChange={(next) => c.commitSerialAbsent(next)}
        />
      }
      onReplaceSerial={(original, nextSerial) => {
        if (original.id == null) return;
        void c.replaceSerialUnit(
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
        void c.deleteSerialUnit(s.id);
      }}
    />
  );
}
