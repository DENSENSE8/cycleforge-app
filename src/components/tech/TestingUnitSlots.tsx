'use client';

import { useEffect, useState } from 'react';
import {
  TestingStatusPills,
  unitStatusToVerdict,
  type TestingVerdict,
} from '@/components/receiving/workspace/TestingStatusPills';
import { InlineSerialAdder } from '@/components/receiving/workspace/InlineSerialAdder';
import { UnitSlotList, type UnitLike } from '@/components/receiving/workspace/UnitSlotList';
import { StationConditionEditor } from '@/components/tech/StationConditionEditor';
import { ConditionBadge } from '@/components/receiving/workspace/ReceivingUnitRows';

export interface UnitSlotSerial {
  id: number;
  serial_number: string;
  current_status?: string;
  condition_grade?: string | null;
}

/** Which of the two pill columns is currently expanded — never both. */
type ExpandedPicker = 'condition' | 'verdict' | null;

interface Props {
  /** Receiving line being tested. The verdict + serials both bind to it. */
  lineId: number;
  /**
   * The line's saved serials in scan order. Index i → unit row i. A multi-qty
   * line lists each physical unit as its own row so every PO item carries its
   * own testing verdict + serial.
   */
  saved: ReadonlyArray<UnitSlotSerial>;
  /** Expected qty for the line — > 1 splits into selectable per-unit rows. */
  expected?: number | null;
  /** Line-level verdict, derived from the saved serials' statuses. */
  verdict: TestingVerdict | null;
  /** True while a verdict mutation is in flight. */
  isMutating?: boolean;
  /** True while a serial add/replace is in flight. */
  isSubmitting?: boolean;
  /** Disable the whole panel (no carton, line locked, saving, etc.). */
  disabled?: boolean;
  /** Autofocus the serial input when the line becomes active (single-qty only). */
  autoFocus?: boolean;
  /** Currently selected (expanded) unit index for multi-qty lines. */
  selectedIndex?: number;
  onSelectIndex?: (index: number) => void;
  /** Apply one verdict to every serial on the unit / PO line (single-qty path). */
  onSetVerdict: (next: TestingVerdict) => void;
  /**
   * Record a verdict against a single unit. Multi-qty lines call this per row
   * so each PO item gets its own pass/test-again/fail. Falls back to
   * {@link onSetVerdict} when absent.
   */
  onSetUnitVerdict?: (serial: UnitSlotSerial, next: TestingVerdict) => void;
  /** Update the condition of a single unit. */
  onSetUnitCondition?: (serial: UnitSlotSerial, next: string) => void;
  onAddSerial: (serial: string) => void | Promise<void>;
  onDeleteSerial: (serial: UnitSlotSerial) => void;
  onReplaceSerial: (original: UnitSlotSerial, next: string) => void;
  /**
   * When false, the saved serial chips are rendered by a parent header
   * (e.g. {@link PoLinesAccordion}'s active row) instead of here, so the
   * single-qty adder hides its own chip list to avoid showing serials twice.
   * Defaults to true for surfaces without a header chip list (unmatched).
   */
  showSavedChips?: boolean;
  /**
   * Controlled edit target from a parent header chip's Edit menu item. When
   * set, the matching unit's scan input is populated for in-place editing.
   */
  editingSerial?: UnitSlotSerial | null;
  onEditingSerialChange?: (serial: UnitSlotSerial | null) => void;
  /**
   * @deprecated Always one-row now (unbox parity). Kept for call-site compat.
   */
  oneRow?: boolean;
}

/**
 * Columns: Condition (left, collapsed + pencil) · Verdict · Serial.
 * Only one of condition / verdict is expanded at a time.
 */
function ConditionVerdictColumns({
  condition,
  onConditionChange,
  showCondition,
  verdict,
  onVerdictChange,
  verdictDisabled,
  conditionLocked,
}: {
  condition: string | null | undefined;
  onConditionChange?: (next: string) => void;
  showCondition: boolean;
  verdict: TestingVerdict | null;
  onVerdictChange: (next: TestingVerdict) => void;
  verdictDisabled: boolean;
  conditionLocked: boolean;
}) {
  // Condition arrives pre-selected from receiving/unbox → start collapsed.
  // Open verdict for picking when none is set yet.
  const [expanded, setExpanded] = useState<ExpandedPicker>(
    () => (verdict == null ? 'verdict' : null),
  );

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2">
      {showCondition && onConditionChange ? (
        <>
          <StationConditionEditor
            condition={condition}
            onChange={onConditionChange}
            isLocked={conditionLocked}
            collapsible
            collapsedLabel
            expanded={expanded === 'condition'}
            onExpandedChange={(next) => setExpanded(next ? 'condition' : null)}
          />
          <div className="h-8 w-px shrink-0 bg-surface-sunken" />
        </>
      ) : null}
      <TestingStatusPills
        value={verdict}
        onChange={(next) => {
          onVerdictChange(next);
          setExpanded(null);
        }}
        disabled={verdictDisabled}
        collapsible
        collapsedLabel
        expanded={expanded === 'verdict'}
        onExpandedChange={(next) => setExpanded(next ? 'verdict' : null)}
      />
    </div>
  );
}

/**
 * Per-line testing panel for the tech workspace. Mounts inside the active
 * row of {@link PoLinesAccordion} (matched cartons) or each line of
 * {@link UnmatchedItemsSection}.
 *
 * Single-quantity: condition · verdict · serial on ONE flex row (collapsible
 * pill + pencil per segment). Condition starts closed (grade from unbox);
 * only condition or verdict expands at once.
 *
 * Multi-quantity: one selectable row per physical unit via {@link UnitSlotList}
 * `singleRowExpanded` — same column order per unit.
 */
export function TestingLinePanel({
  lineId,
  saved,
  expected = null,
  verdict,
  isMutating = false,
  isSubmitting = false,
  disabled = false,
  autoFocus = false,
  selectedIndex,
  onSelectIndex,
  onSetVerdict,
  onSetUnitVerdict,
  onSetUnitCondition,
  onAddSerial,
  onDeleteSerial,
  onReplaceSerial,
  showSavedChips = true,
  editingSerial = null,
  onEditingSerialChange,
}: Props) {
  const total = Math.max(expected ?? 0, saved.length, 1);

  if (total > 1) {
    return (
      <TestingUnitRows
        lineId={lineId}
        saved={saved}
        total={total}
        isMutating={isMutating}
        isSubmitting={isSubmitting}
        disabled={disabled}
        selectedIndex={selectedIndex}
        onSelectIndex={onSelectIndex}
        onSetUnitVerdict={(serial, next) =>
          (onSetUnitVerdict ?? (() => onSetVerdict(next)))(serial, next)
        }
        onSetUnitCondition={onSetUnitCondition}
        onAddSerial={onAddSerial}
        onDeleteSerial={onDeleteSerial}
        onReplaceSerial={onReplaceSerial}
        serialEditTarget={editingSerial}
      />
    );
  }

  // When the parent header already surfaces saved serials (PoLinesAccordion /
  // UnmatchedLineRow meta chips), skip the inline adder so condition + verdict
  // pills stay left-aligned. Re-show it for the first scan or an in-place edit
  // from the header chip menu.
  const headerOwnsSerial = !showSavedChips && saved.length > 0 && editingSerial == null;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <ConditionVerdictColumns
        condition={saved[0]?.condition_grade}
        onConditionChange={
          saved[0]?.id != null && onSetUnitCondition
            ? (next) => onSetUnitCondition(saved[0], next)
            : undefined
        }
        showCondition={saved[0]?.id != null && onSetUnitCondition != null}
        verdict={verdict}
        onVerdictChange={onSetVerdict}
        verdictDisabled={disabled || isMutating || saved.length === 0}
        conditionLocked={disabled || isMutating}
      />
      {headerOwnsSerial ? null : (
        <>
          <div className="h-8 w-px shrink-0 bg-surface-sunken" />
          <InlineSerialAdder
            key={`tech-adder-${lineId}`}
            lineId={lineId}
            saved={saved}
            expected={expected}
            isSubmitting={isSubmitting}
            disabled={disabled}
            autoFocus={autoFocus}
            showSavedChips={showSavedChips}
            editingSerial={editingSerial}
            onEditingSerialChange={(s) =>
              onEditingSerialChange?.(s as UnitSlotSerial | null)
            }
            onAdd={(_lineId, sn) => onAddSerial(sn)}
            onDelete={(_lineId, s) => onDeleteSerial(s as UnitSlotSerial)}
            onReplaceSerial={(_lineId, original, next) =>
              onReplaceSerial(original as UnitSlotSerial, next)
            }
          />
        </>
      )}
    </div>
  );
}

interface TestingUnitRowsProps {
  lineId: number;
  saved: ReadonlyArray<UnitSlotSerial>;
  total: number;
  isMutating: boolean;
  isSubmitting: boolean;
  disabled: boolean;
  selectedIndex?: number;
  onSelectIndex?: (index: number) => void;
  onSetUnitVerdict: (serial: UnitSlotSerial, next: TestingVerdict) => void;
  onSetUnitCondition?: (serial: UnitSlotSerial, next: string) => void;
  onAddSerial: (serial: string) => void | Promise<void>;
  onDeleteSerial: (serial: UnitSlotSerial) => void;
  onReplaceSerial: (original: UnitSlotSerial, next: string) => void;
  serialEditTarget?: UnitSlotSerial | null;
}

/**
 * Multi-quantity testing display: one selectable row per physical unit, so a
 * line with qty 4 of the same SKU is acknowledged as four units — each with its
 * own testing verdict and serial. Mirrors {@link ReceivingUnitRows}, swapping
 * the condition picker for {@link TestingStatusPills}.
 *
 * The verdict binds to a scanned unit's `serial_units` row, so the pills are
 * disabled on an empty slot — scan the serial first, then pick a verdict.
 */
function TestingUnitRows({
  lineId,
  saved,
  total,
  isMutating,
  isSubmitting,
  disabled,
  selectedIndex,
  onSelectIndex,
  onSetUnitVerdict,
  onSetUnitCondition,
  onAddSerial,
  onDeleteSerial,
  onReplaceSerial,
  serialEditTarget = null,
}: TestingUnitRowsProps) {
  // Local selection fallback when the parent doesn't control it: default to the
  // first not-yet-scanned slot, else the first unit.
  const firstEmpty = saved.length < total ? saved.length : 0;
  const [localIndex, setLocalIndex] = useState(firstEmpty);
  const selected = selectedIndex ?? localIndex;
  const select = onSelectIndex ?? setLocalIndex;

  // Re-home selection when switching lines (uncontrolled mode only).
  useEffect(() => {
    if (selectedIndex == null) setLocalIndex(saved.length < total ? saved.length : 0);
    // Only re-seed on line change, not on every serial add.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineId]);

  return (
    <UnitSlotList
      total={total}
      saved={saved}
      selectedIndex={selected}
      onSelect={select}
      disabled={disabled}
      isSubmitting={isSubmitting}
      // Match the receiving display: every unit is an always-open row (verdict
      // pills + serial input, no n/N counter), and a committed scan advances
      // focus to the next unit so a lot is scanned in one fast pass.
      singleRowExpanded
      renderExpandedMeta={(serial) => (
        <ConditionVerdictColumns
          condition={serial?.condition_grade}
          onConditionChange={
            serial?.id != null && onSetUnitCondition
              ? (next) => onSetUnitCondition(serial as UnitSlotSerial, next)
              : undefined
          }
          showCondition={serial?.id != null && onSetUnitCondition != null}
          verdict={unitStatusToVerdict(serial?.current_status)}
          onVerdictChange={(next) => {
            if (serial) onSetUnitVerdict(serial as UnitSlotSerial, next);
          }}
          verdictDisabled={disabled || isMutating || serial == null}
          conditionLocked={disabled || isMutating}
        />
      )}
      renderCollapsedMeta={(serial) => (
        <div className="flex items-center gap-2">
          <ConditionBadge grade={serial?.condition_grade} />
          <VerdictBadge verdict={unitStatusToVerdict(serial?.current_status)} />
        </div>
      )}
      onAddSerial={(_index, sn) => onAddSerial(sn)}
      onDeleteSerial={(s) => onDeleteSerial(s as UnitSlotSerial)}
      onReplaceSerial={(original, next) =>
        onReplaceSerial(original as UnitSlotSerial, next)
      }
      serialEditTarget={(serialEditTarget as UnitLike | null) ?? null}
    />
  );
}

const VERDICT_BADGE: Record<TestingVerdict, { label: string; tone: string }> = {
  PASS: { label: 'pass', tone: 'text-emerald-600' },
  TEST_AGAIN: { label: 'test again', tone: 'text-amber-600' },
  TESTING_FAILED: { label: 'failed', tone: 'text-rose-600' },
};

function VerdictBadge({ verdict }: { verdict: TestingVerdict | null }) {
  if (!verdict) {
    return (
      <span className="text-role-micro font-bold uppercase tracking-widest text-text-faint">
        untested
      </span>
    );
  }
  const { label, tone } = VERDICT_BADGE[verdict];
  return (
    <span className={`text-role-micro font-bold uppercase tracking-widest ${tone}`}>
      {label}
    </span>
  );
}
