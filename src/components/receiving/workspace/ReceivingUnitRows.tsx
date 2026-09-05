"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { X } from "@/components/Icons";
import { HoverTooltip } from "@/components/ui/HoverTooltip";
import {
  Button,
  IconButton,
  TextField,
} from "@/design-system/primitives";
import { cornerClass } from "@/design-system/tokens/radius";
import { ConditionPills } from "./ConditionPills";
import { UnitSlotList, type UnitLike, type UnitSlotView } from "./UnitSlotList";
import { ConditionBadge } from "./ConditionBadge";
import { BulkQuantityPanel } from "./BulkQuantityPanel";
import { markLineShortRemaining } from "./line-receive-actions";
import { UnitSlotsManageOverlay } from "./UnitSlotsManageOverlay";
import {
  UNIT_ROW_DISPLAY_CAP,
  resolveLineReceiveMode,
} from "./line-receive-mode";
import {
  markAllReceivingUnitsCondition,
  markReceivingUnitCondition,
  markReceivingUnitsConditionSplit,
  markReceivingUnitSerialAbsent,
} from "./receiving-label-helpers";
import type { SerialAbsentState } from "./line-edit/NoSerialControl";
import { bindSerialsToUnitSlots } from "@/lib/receiving/optimistic-serials";
import { cn } from "@/utils/_cn";

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
  onAddSerial: (
    serial: string,
    conditionGrade: string | null,
  ) => void | Promise<void>;
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
  /**
   * Filled unit pencil — open Units display / edit handoff. When omitted,
   * UnitSlotList falls back to in-row replace.
   */
  onEditFilledSerial?: (serial: UnitSerial) => void;
  /** Icon-only no-serial control, pinned to the top-right of the unit list. */
  noSerialControl?: ReactNode;
  /** Programmatic focus target for the dock Add serial handoff. */
  serialInputRef?: RefObject<HTMLInputElement | null>;
  /** Station body is scan-only; per-unit edits live in the Units display. */
  stationCompact?: boolean;
  /**
   * Units Displays feed (legacy): serial rows only — no master/slot ConditionPills.
   * Prefer {@link flush} for the Units explosion (in-row collapsible pills).
   */
  hideCondition?: boolean;
  /**
   * Units Displays flush chrome — square rows, hairline dividers, joined fields.
   * Per-slot ConditionPills are collapsible; expand collapses photo + serial.
   */
  flush?: boolean;
  /** Item camera after condition on every flush unit row. */
  activeRowLeading?: ReactNode;
}

/**
 * Multi-quantity receiving display.
 *
 * Adaptive modes (see {@link resolveLineReceiveMode}):
 *  - **Qty roll-up** — high-qty identical commodities: grade + count, zero unit rows.
 *  - **Unit track** — per-unit identity: capped {@link UnitSlotList} (+ manage overlay).
 *
 * Per-unit condition lives on `receiving_line_unit.condition_grade` — durable
 * across reload. Caps are UI-only; DB materialisation stays one row per expected unit.
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
  onEditFilledSerial,
  noSerialControl,
  serialInputRef,
  stationCompact = false,
  hideCondition = false,
  flush = false,
  activeRowLeading,
}: Props) {
  const total = Math.max(quantityExpected, saved.length, units?.length ?? 0, 1);

  const [forceUnitMode, setForceUnitMode] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  /** Line-level add field (Units flush) — fills the next empty slot. */
  const [lineScan, setLineScan] = useState("");
  const lineScanRef = useRef<HTMLInputElement | null>(null);

  const mode = resolveLineReceiveMode({
    quantityExpected,
    serialCount: saved.length,
    forceUnitMode,
  });

  // Bound serials per unit (linked id + ordinal fill for unbound/optimistic).
  const boundSerials =
    units && units.length > 0 ? bindSerialsToUnitSlots(units, saved) : null;

  // Default selection: the first not-yet-scanned / not-waived slot, else the first unit.
  const firstEmpty = (() => {
    if (boundSerials && units && units.length > 0) {
      const idx = boundSerials.findIndex(
        (serial, i) => !units[i]?.serial_absent && !serial,
      );
      return idx >= 0 ? idx : 0;
    }
    return saved.length < total ? saved.length : 0;
  })();
  const [selectedIndex, setSelectedIndex] = useState(firstEmpty);

  // Last reason used on a per-unit waiver — defaults the next green-check click
  // (plan §9 lean: allow per-unit reason, default picker to last-used).
  const [lastAbsentReason, setLastAbsentReason] = useState<string | null>(
    defaultAbsentReason,
  );

  const serialAt = useCallback(
    (index: number): UnitSerial | null => {
      if (boundSerials) return boundSerials[index] ?? null;
      return saved[index] ?? null;
    },
    [boundSerials, saved],
  );

  // Precedence: scanned serial grade → durable unit row grade (incl. null) →
  // line default only when no unit row exists. A cleared unit grade must stay
  // empty in the Units display — do not re-inherit the line default via `??`.
  const gradeFor = (serial: UnitSerial | null, index: number): string | null => {
    if (serial?.condition_grade) return serial.condition_grade;
    if (units?.[index] != null) return units[index].condition_grade ?? null;
    return lineCondition ?? null;
  };

  const activeGrade = gradeFor(serialAt(selectedIndex), selectedIndex);
  const lastEmittedRef = useRef<string | null | undefined>(undefined);
  const firstEmptyRef = useRef(firstEmpty);
  firstEmptyRef.current = firstEmpty;
  const defaultAbsentReasonRef = useRef(defaultAbsentReason);
  defaultAbsentReasonRef.current = defaultAbsentReason;

  useEffect(() => {
    setSelectedIndex(firstEmptyRef.current);
    setLastAbsentReason(defaultAbsentReasonRef.current ?? null);
    setForceUnitMode(false);
    setManageOpen(false);
    setLineScan("");
    lastEmittedRef.current = undefined;
    // Only re-seed on line change, not on every serial add.
  }, [lineId]);

  const submitLineScan = () => {
    const v = lineScan.trim();
    if (!v || disabled) return;
    const target = firstEmpty;
    setSelectedIndex(target);
    const serial = serialAt(target);
    const grade =
      serial?.condition_grade ||
      (units?.[target] != null
        ? (units[target].condition_grade ?? null)
        : (lineCondition ?? null));
    void onAddSerial(v, grade);
    setLineScan("");
    // Field stays enabled during in-flight writes — keep the caret here.
    lineScanRef.current?.focus({ preventScroll: true });
  };

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
    if (idx >= 0) {
      setSelectedIndex(idx);
      setForceUnitMode(true);
    }
  }, [serialEditTarget?.id, saved, units]);

  /** Persist a grade for one slot: unit row (durable) + linked serial if any. */
  const commitSlotGrade = useCallback(
    (index: number, grade: string) => {
      const unit = units?.[index] ?? null;
      const serial = serialAt(index);
      if (unit) markReceivingUnitCondition(lineId, unit.id, grade, units);
      // Optimistic serials mint negative ids — the grade API rejects ≤0.
      // Unit-row PATCH above already owns the durable grade until confirm.
      if (serial && serial.id > 0) onSetUnitGrade(serial.id, grade);
    },
    [lineId, units, serialAt, onSetUnitGrade],
  );

  // "All units" master picker: stamp every unit row + every scanned serial +
  // the line-level default in one tap. Per-unit rows below still override.
  const setAllUnits = useCallback(
    (grade: string) => {
      onConditionChange?.(grade);
      markAllReceivingUnitsCondition(lineId, grade, units);
      for (const s of saved) {
        if (s?.id != null && s.id > 0) onSetUnitGrade(s.id, grade);
      }
    },
    [onConditionChange, onSetUnitGrade, saved, units, lineId],
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
      const reason =
        lastAbsentReason ?? defaultAbsentReason ?? "NOT_SERIALIZED";
      commitUnitAbsent(unitId, { absent: true, reason });
    },
    [commitUnitAbsent, lastAbsentReason, defaultAbsentReason],
  );

  const applyBulk = useCallback(
    (input: {
      primaryGrade: string | null;
      primaryCount: number;
      secondaryGrade: string | null;
    }) => {
      if (!input.primaryGrade) return;
      onConditionChange?.(input.primaryGrade);
      if (input.secondaryGrade) {
        markReceivingUnitsConditionSplit(
          lineId,
          input.primaryGrade,
          input.primaryCount,
          input.secondaryGrade,
          units,
        );
      } else {
        markAllReceivingUnitsCondition(lineId, input.primaryGrade, units);
      }
      for (const s of saved) {
        if (s?.id != null && s.id > 0) onSetUnitGrade(s.id, input.primaryGrade);
      }
    },
    [lineId, units, saved, onConditionChange, onSetUnitGrade],
  );

  const applyGradeToRemainingEmpty = useCallback(() => {
    const grades = Array.from({ length: total }, (_, i) =>
      gradeFor(serialAt(i), i),
    );
    const shared = grades.every((g) => g && g === grades[0]) ? grades[0] : null;
    const grade = (lineCondition || shared || "").trim().toUpperCase();
    if (!grade || !units) return;
    onConditionChange?.(grade);
    for (const u of units) {
      if (u.serial_unit_id != null) continue;
      if (u.condition_grade) continue;
      markReceivingUnitCondition(lineId, u.id, grade, units);
    }
  }, [lineCondition, units, lineId, onConditionChange, total, serialAt]);

  // Reflect the shared grade when every unit agrees; show indeterminate (no
  // active pill) when units are mixed, so the master never misreports state.
  const effectiveGrades = Array.from({ length: total }, (_, i) =>
    gradeFor(serialAt(i), i),
  );
  const masterValue = effectiveGrades.every((g) => g === effectiveGrades[0])
    ? effectiveGrades[0]
    : null;

  const overflowCount = Math.max(0, total - UNIT_ROW_DISPLAY_CAP);
  const showReceiveAsBulk =
    quantityExpected > UNIT_ROW_DISPLAY_CAP && saved.length === 0;

  if (mode === "qtyRollup" && !hideCondition) {
    return (
      <div className="min-w-0" data-receive-mode="qtyRollup">
        <BulkQuantityPanel
          quantityExpected={quantityExpected}
          lineCondition={lineCondition}
          disabled={disabled}
          noSerialControl={noSerialControl}
          onApply={applyBulk}
          onTrackEachUnit={() => setForceUnitMode(true)}
          onShortRemaining={(_remaining, got) => {
            void markLineShortRemaining(
              { id: lineId, quantity_expected: quantityExpected },
              got,
            );
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'min-w-0 bg-surface-card',
        flush || stationCompact ? null : 'space-y-2',
      )}
      data-receive-mode="unitTrack"
    >
      {flush ? (
        <div
          className={cn(
            "flex h-11 w-full min-w-0 items-stretch overflow-hidden border-b border-border-hairline bg-surface-card divide-x divide-border-soft",
            cornerClass("flush"),
          )}
          data-units-line-serial-adder
        >
          <div className="flex min-w-0 flex-1 items-stretch">
            <TextField
              ref={(el) => {
                lineScanRef.current = el;
                if (serialInputRef) {
                  (serialInputRef as { current: HTMLInputElement | null }).current =
                    el;
                }
              }}
              label="Serial"
              data-unbox-serial-input
              appearance="flush"
              value={lineScan}
              onChange={setLineScan}
              mono
              disabled={disabled}
              autoComplete="off"
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitLineScan();
                }
              }}
              trailing={
                lineScan ? (
                  <IconButton
                    onClick={() => setLineScan("")}
                    ariaLabel="Clear"
                    icon={<X className="h-3.5 w-3.5" />}
                    className="rounded-md p-1 text-text-faint hover:bg-surface-sunken hover:text-text-muted"
                  />
                ) : undefined
              }
            />
          </div>
          <div className="flex h-11 w-11 shrink-0 self-stretch">
            <HoverTooltip label="Add serial" asChild>
              <IconButton
                onClick={submitLineScan}
                disabled={!lineScan.trim() || disabled}
                ariaLabel="Add serial"
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="h-5 w-5"
                  >
                    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                  </svg>
                }
                className={cn(
                  cornerClass("flush"),
                  "flex h-full w-full items-center justify-center bg-emerald-600 p-0 text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-text-faint",
                )}
                // ds-allow-control-size — joined trailing cell fills h-11×w-11
              />
            </HoverTooltip>
          </div>
          {noSerialControl ? (
            <div className="flex h-11 w-11 shrink-0 items-stretch *:size-full">
              {noSerialControl}
            </div>
          ) : null}
        </div>
      ) : stationCompact || hideCondition ? (
        hideCondition && noSerialControl ? (
          <div className={`flex justify-end ${flush ? 'px-0 py-0' : 'px-1'}`}>
            {noSerialControl}
          </div>
        ) : null
      ) : (
        // Umbrella control — one tap grades the whole lot; rows below override.
        <div className="flex min-w-0 items-start gap-2 px-1">
          <div className="min-w-0 flex-1">
            <ConditionPills value={masterValue} onChange={setAllUnits} />
          </div>
          {noSerialControl ? (
            <div className="shrink-0">{noSerialControl}</div>
          ) : null}
        </div>
      )}
      <UnitSlotList
        total={total}
        saved={saved}
        units={units}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        disabled={disabled}
        isSubmitting={isSubmitting}
        requireSerialConfirmation={requireSerialConfirmation}
        onMarkUnitNoSerial={
          !stationCompact && units && units.length > 0
            ? markUnitNoSerial
            : undefined
        }
        onUnitSerialAbsentChange={
          !stationCompact && units && units.length > 0
            ? commitUnitAbsent
            : undefined
        }
        singleRowExpanded
        stationCompact={stationCompact}
        flush={flush}
        activeRowLeading={activeRowLeading}
        maxVisible={UNIT_ROW_DISPLAY_CAP}
        renderExpandedMeta={
          hideCondition
            ? undefined
            : (serial, index, pairing) => (
                // Station compact + Units flush: collapsible picker. Compact /
                // flush start collapsed when graded (Tags square); expand opens
                // the grade row. Flush pairing collapses photo + serial.
                <ConditionPills
                  value={gradeFor(serial, index)}
                  collapsible={stationCompact || flush || pairing != null}
                  startCollapsed={stationCompact || flush}
                  expanded={pairing?.expanded}
                  onExpandedChange={pairing?.onExpandedChange}
                  onChange={(next) => {
                    setSelectedIndex(index);
                    commitSlotGrade(index, next);
                  }}
                />
              )
        }
        renderCollapsedMeta={
          hideCondition
            ? undefined
            : (serial, index) => <ConditionBadge grade={gradeFor(serial, index)} />
        }
        onAddSerial={(index, sn) =>
          onAddSerial(sn, gradeFor(serialAt(index), index))
        }
        onDeleteSerial={(s) => onDeleteSerial(s.id)}
        onReplaceSerial={(original, next) => onReplaceSerial(original, next)}
        onEditFilledSerial={onEditFilledSerial}
        serialEditTarget={stationCompact ? null : serialEditTarget}
        primaryInputRef={flush ? undefined : serialInputRef}
        overflowSlot={
          overflowCount > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={disabled}
              onClick={() => setManageOpen(true)}
              data-unit-overflow-cta
            >
              +{overflowCount} more · manage units
            </Button>
          ) : null
        }
      />
      {showReceiveAsBulk ? (
        <div className="px-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => setForceUnitMode(false)}
          >
            Receive remaining as quantity
          </Button>
        </div>
      ) : null}

      <UnitSlotsManageOverlay
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        total={total}
        saved={saved}
        units={units}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        disabled={disabled}
        isSubmitting={isSubmitting}
        requireSerialConfirmation={requireSerialConfirmation}
        gradeFor={gradeFor}
        onCommitSlotGrade={commitSlotGrade}
        onAddSerial={(index, sn) =>
          onAddSerial(sn, gradeFor(serialAt(index), index))
        }
        onDeleteSerial={(s) => onDeleteSerial(s.id)}
        onReplaceSerial={(original, next) => onReplaceSerial(original, next)}
        onMarkUnitNoSerial={
          units && units.length > 0 ? markUnitNoSerial : undefined
        }
        onUnitSerialAbsentChange={
          units && units.length > 0 ? commitUnitAbsent : undefined
        }
        serialEditTarget={serialEditTarget}
        serialInputRef={serialInputRef}
        onApplyGradeToRemaining={applyGradeToRemainingEmpty}
        onReceiveRemainingAsBulk={
          showReceiveAsBulk ? () => setForceUnitMode(false) : undefined
        }
        masterPills={
          hideCondition || flush ? null : (
            <ConditionPills value={masterValue} onChange={setAllUnits} />
          )
        }
      />
    </div>
  );
}

// `ConditionBadge` moved to ./ConditionBadge so UnitSlotList can render it without
// importing this module (runtime cycle). Imported above for local use; re-exported
// here for backwards compatibility.
export { ConditionBadge };
