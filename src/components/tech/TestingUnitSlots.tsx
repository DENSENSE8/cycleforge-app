'use client';

import { useEffect, useState, type ReactNode } from 'react';
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
  /** When false, the saved serial chips are rendered by a parent header (e.g. */
  showSavedChips?: boolean;
  /**
   * Controlled edit target from a parent header chip's Edit menu item. When
   * set, the matching unit's scan input is populated for in-place editing.
   */
  editingSerial?: UnitSlotSerial | null;
  onEditingSerialChange?: (serial: UnitSlotSerial | null) => void;
  /** Force the per-unit row layout even for a single-qty line — one flush editable row per serial (verdict · condition · serial), exactly… */
  forceUnitRows?: boolean;
  /**
   * Units Display flush chrome: full-bleed hairline rows, square controls,
   * edge-to-edge. Only meaningful with {@link forceUnitRows}.
   */
  flush?: boolean;
  /**
   * @deprecated Always one-row now (unbox parity). Kept for call-site compat.
   */
  oneRow?: boolean;
}

/**
 * Columns: Condition Tags (leading) · Verdict fill band (trailing primary).
 * Only one of condition / verdict is expanded at a time. Verdict takes the
 * remaining width as equal thirds — station main action.
 */
function ConditionVerdictColumns({
  condition,
  onConditionChange,
  showCondition,
  verdict,
  onVerdictChange,
  verdictDisabled,
  conditionLocked,
  serialSlot = null,
}: {
  condition: string | null | undefined;
  onConditionChange?: (next: string) => void;
  showCondition: boolean;
  verdict: TestingVerdict | null;
  onVerdictChange: (next: TestingVerdict) => void;
  verdictDisabled: boolean;
  conditionLocked: boolean;
  /** Optional serial adder between Tags and the verdict band. */
  serialSlot?: ReactNode;
}) {
  // Condition arrives pre-selected from receiving/unbox → start collapsed.
  // Open verdict for picking when none is set yet.
  const [expanded, setExpanded] = useState<ExpandedPicker>(
    () => (verdict == null ? 'verdict' : null),
  );

  return (
    <div className="flex w-full min-w-0 items-stretch gap-0">
      {showCondition && onConditionChange ? (
        <StationConditionEditor
          condition={condition}
          onChange={onConditionChange}
          isLocked={conditionLocked}
          collapsible
          collapsedLabel
          expanded={expanded === 'condition'}
          onExpandedChange={(next) => setExpanded(next ? 'condition' : null)}
        />
      ) : null}
      {serialSlot}
      <div className="min-w-0 flex-1">
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
    </div>
  );
}

/** Per-line testing panel for the tech workspace. */
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
  forceUnitRows = false,
  flush = false,
}: Props) {
  const total = Math.max(expected ?? 0, saved.length, 1);

  if (forceUnitRows || total > 1) {
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
        flush={flush}
      />
    );
  }

  // When the parent header already surfaces saved serials (PoLinesAccordion / accordion meta chips), skip the inline adder so the verdict…
  const headerOwnsSerial = !showSavedChips && saved.length > 0 && editingSerial == null;

  const serialSlot = headerOwnsSerial ? null : (
    <div className="min-w-0 flex-1">
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
    </div>
  );

  return (
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
      serialSlot={serialSlot}
    />
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
  /** Units Display flush chrome — full-bleed hairline rows, square controls. */
  flush?: boolean;
}

/** Multi-quantity testing display: */
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
  flush = false,
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
      flush={flush}
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
  TEST_AGAIN: { label: 'test again', tone: 'text-blue-600' },
  TESTING_FAILED: { label: 'failed', tone: 'text-rose-600' },
};

function VerdictBadge({ verdict }: { verdict: TestingVerdict | null }) {
  if (!verdict) {
    return (
      <span className="text-role-micro text-text-faint">
        untested
      </span>
    );
  }
  const { label, tone } = VERDICT_BADGE[verdict];
  return (
    <span className={`text-role-micro ${tone}`}>
      {label}
    </span>
  );
}
