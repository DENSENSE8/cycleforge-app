'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ConditionPills } from './ConditionPills';
import { UnitSlotList, type UnitLike, type UnitSlotView } from './UnitSlotList';
import { ConditionBadge } from './ConditionBadge';
import { markReceivingUnitSerialAbsent } from './receiving-label-helpers';
import type { SerialAbsentState } from './line-edit/NoSerialControl';

export type UnitSerial = UnitLike;

interface Props {
  /** Receiving line these units belong to. */
  lineId: number;
  /** Saved serials for the line, in scan order. Index i → unit row i. */
  saved: ReadonlyArray<UnitSerial>;
  /**
   * Materialised `receiving_line_unit` rows (ordinal order). When present, each
   * row gets a durable id for the per-unit no-serial check. Optional through
   * Phase 3 — absent means legacy dense `saved[i]` slots (no per-row check).
   */
  units?: ReadonlyArray<UnitSlotView> | null;
  /** Expected qty — drives how many unit rows render when `units` is absent. */
  quantityExpected: number;
  /** Line-level grade, used as the default for not-yet-graded units. */
  lineCondition: string | null | undefined;
  /** Line-level last-used absent reason — default for a new per-unit waiver. */
  defaultAbsentReason?: string | null;
  disabled?: boolean;
  isSubmitting?: boolean;
  /** Org enforces the serial checkpoint — per-row check reads as required. */
  requireSerialConfirmation?: boolean;
  /** Scan a serial into a slot, stamping the grade chosen for that slot. */
  onAddSerial: (serial: string, conditionGrade: string | null) => void | Promise<void>;
  onDeleteSerial: (serialUnitId: number) => void;
  onReplaceSerial: (original: UnitSerial, next: string) => void;
  /** Persist a per-unit grade for an already-scanned serial. */
  onSetUnitGrade: (serialUnitId: number, grade: string) => void;
  /**
   * Set the line-level default grade. Used by the "All units" master picker to
   * stamp every unit at once (empty slots inherit it; scanned units are also
   * re-graded via {@link onSetUnitGrade}).
   */
  onConditionChange?: (grade: string) => void;
  /**
   * Fires with the effective condition grade of the currently-selected unit
   * (saved grade → pending grade → line default). Lets the parent print/preview
   * a label that matches the selected item rather than the line-level grade, so
   * a multi-qty PO with mixed conditions gets one correct label per unit.
   */
  onActiveConditionChange?: (grade: string | null) => void;
  /** Header chip Edit — routes into the matching unit's scan input. */
  serialEditTarget?: UnitSerial | null;
  /** Icon-only no-serial control, pinned to the top-right of the unit list. */
  noSerialControl?: ReactNode;
  /** Programmatic focus target for the dock Add serial handoff. */
  serialInputRef?: RefObject<HTMLInputElement | null>;
}

/**
 * Multi-quantity receiving display: one selectable row per physical unit so a
 * line with qty 6 of the same product is acknowledged as six units — each with
 * its own condition grade and serial. The selected unit expands (condition
 * pills + serial entry); the rest collapse to a single line. Mounts in the
 * active PO-item row of {@link PoLinesAccordion} when `quantity_expected` > 1.
 *
 * Per-unit condition persists to `serial_units.condition_grade`: a scanned unit
 * calls the grade endpoint; an empty slot holds the chosen grade locally and
 * stamps it onto the scan.
 */
export function ReceivingUnitRows({
  lineId,
  saved,
  units = null,
  quantityExpected,
  lineCondition,
  defaultAbsentReason = null,
  disabled = false,
  isSubmitting = false,
  requireSerialConfirmation = false,
  onAddSerial,
  onDeleteSerial,
  onReplaceSerial,
  onSetUnitGrade,
  onConditionChange,
  onActiveConditionChange,
  serialEditTarget = null,
  noSerialControl,
  serialInputRef,
}: Props) {
  const total = Math.max(quantityExpected, saved.length, units?.length ?? 0, 1);

  // Default selection: the first not-yet-scanned / not-waived slot, else the first unit.
  const firstEmpty = (() => {
    if (units && units.length > 0) {
      const idx = units.findIndex((u) => !u.serial_absent && u.serial_unit_id == null);
      return idx >= 0 ? idx : 0;
    }
    return saved.length < total ? saved.length : 0;
  })();
  const [selectedIndex, setSelectedIndex] = useState(firstEmpty);

  // Grade chosen for empty slots before their serial is scanned, keyed by slot.
  const [pendingGrade, setPendingGrade] = useState<Record<number, string>>({});
  // Last reason used on a per-unit waiver — defaults the next green-check click
  // (plan §9 lean: allow per-unit reason, default picker to last-used).
  const [lastAbsentReason, setLastAbsentReason] = useState<string | null>(defaultAbsentReason);

  const gradeFor = (serial: UnitSerial | null, index: number): string | null =>
    serial?.condition_grade ??
    units?.[index]?.condition_grade ??
    pendingGrade[index] ??
    lineCondition ??
    null;

  // Surface the selected unit's effective grade to the parent (for the label
  // preview / print). Recomputed whenever the selection, that unit's saved or
  // pending grade, or the line default changes. Guarded against redundant
  // emits so the parent isn't re-rendered on every keystroke elsewhere.
  const activeGrade = gradeFor(saved[selectedIndex] ?? null, selectedIndex);
  const lastEmittedRef = useRef<string | null | undefined>(undefined);

  // Re-home selection when switching to a different line, and re-arm the emit
  // guard so the new line's selected grade is always reported even if it equals
  // the previous line's last emitted value.
  useEffect(() => {
    setSelectedIndex(firstEmpty);
    setLastAbsentReason(defaultAbsentReason);
    lastEmittedRef.current = undefined;
    // Only re-seed on line change, not on every serial add.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineId]);

  useEffect(() => {
    if (lastEmittedRef.current === activeGrade) return;
    lastEmittedRef.current = activeGrade;
    onActiveConditionChange?.(activeGrade);
  }, [activeGrade, onActiveConditionChange]);

  useEffect(() => {
    if (serialEditTarget?.id == null) return;
    const idx =
      units && units.length > 0
        ? units.findIndex((u) => u.serial_unit_id === serialEditTarget.id)
        : saved.findIndex((s) => s.id === serialEditTarget.id);
    if (idx >= 0) setSelectedIndex(idx);
  }, [serialEditTarget?.id, saved, units]);

  // "All units" master picker: stamp every unit to one grade in a single tap.
  // The line-level default covers empty/ungraded slots (via gradeFor), and each
  // already-scanned unit is re-graded explicitly so prior per-unit picks are
  // overwritten too. Per-unit rows below still override individual exceptions.
  const setAllUnits = useCallback(
    (grade: string) => {
      onConditionChange?.(grade);
      setPendingGrade({});
      for (const s of saved) {
        if (s?.id != null) onSetUnitGrade(s.id, grade);
      }
    },
    [onConditionChange, onSetUnitGrade, saved],
  );

  const commitUnitAbsent = useCallback(
    (unitId: number, next: SerialAbsentState) => {
      if (next.absent && next.reason) setLastAbsentReason(next.reason);
      markReceivingUnitSerialAbsent(lineId, unitId, next, units);
    },
    [lineId, units],
  );

  const markUnitNoSerial = useCallback(
    (unitId: number) => {
      const reason = lastAbsentReason ?? defaultAbsentReason ?? 'NOT_SERIALIZED';
      commitUnitAbsent(unitId, { absent: true, reason });
    },
    [commitUnitAbsent, lastAbsentReason, defaultAbsentReason],
  );

  // Reflect the shared grade when every unit agrees; show indeterminate (no
  // active pill) when units are mixed, so the master never misreports state.
  const effectiveGrades = Array.from({ length: total }, (_, i) => {
    const serial =
      units && units.length > 0
        ? saved.find((s) => s.id === units[i]?.serial_unit_id) ?? null
        : saved[i] ?? null;
    return gradeFor(serial, i);
  });
  const masterValue = effectiveGrades.every((g) => g === effectiveGrades[0]) ? effectiveGrades[0] : null;

  return (
    <div className="min-w-0 space-y-2">
      {/* Umbrella control — one tap grades the whole lot; rows below override.
          Bare pills: the position above the unit list reads as "all" from
          context, so no chrome/label needed. `px-1` matches the unit rows'
          horizontal inset so the master + per-row pills share a left edge. */}
      <div className="flex min-w-0 items-start gap-2 px-1">
        <div className="min-w-0 flex-1">
          <ConditionPills value={masterValue} onChange={setAllUnits} />
        </div>
        {noSerialControl ? <div className="shrink-0">{noSerialControl}</div> : null}
      </div>
      <UnitSlotList
        total={total}
        saved={saved}
        units={units}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        disabled={disabled}
        isSubmitting={isSubmitting}
        requireSerialConfirmation={requireSerialConfirmation}
        onMarkUnitNoSerial={units && units.length > 0 ? markUnitNoSerial : undefined}
        onUnitSerialAbsentChange={units && units.length > 0 ? commitUnitAbsent : undefined}
        // Render the active unit exactly like a single-qty SerialCard row:
        // inline condition pills, no n/N counter, no pending badge.
        singleRowExpanded
        renderExpandedMeta={(serial, index) => (
          <ConditionPills
            value={gradeFor(serial, index)}
            onChange={(next) => {
              // Picking a grade on any row also makes it the active unit, so the
              // single bottom print button labels with the condition just chosen.
              setSelectedIndex(index);
              if (serial) onSetUnitGrade(serial.id, next);
              else setPendingGrade((m) => ({ ...m, [index]: next }));
            }}
          />
        )}
        renderCollapsedMeta={(serial, index) => (
          <ConditionBadge grade={gradeFor(serial, index)} />
        )}
        onAddSerial={(index, sn) => {
          const serial =
            units && units.length > 0
              ? saved.find((s) => s.id === units[index]?.serial_unit_id) ?? null
              : saved[index] ?? null;
          return onAddSerial(sn, gradeFor(serial, index));
        }}
        onDeleteSerial={(s) => onDeleteSerial(s.id)}
        onReplaceSerial={(original, next) => onReplaceSerial(original, next)}
        serialEditTarget={serialEditTarget}
        primaryInputRef={serialInputRef}
      />
    </div>
  );
}

// `ConditionBadge` moved to ./ConditionBadge so UnitSlotList can render it without
// importing this module (runtime cycle). Imported above for local use; re-exported
// here for backwards compatibility.
export { ConditionBadge };
