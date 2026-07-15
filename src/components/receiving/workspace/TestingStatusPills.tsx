'use client';

import { useRef, useState } from 'react';
import { Pencil } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useHorizontalWheelScroll } from '@/hooks/useHorizontalWheelScroll';

/**
 * Verdict the tech assigns to a receiving line during the testing step.
 *
 *   pass         → workflow_status='PASSED',     qa_status='PASSED'
 *   test_again   → workflow_status='IN_TEST',    qa_status='PENDING'   (stays in queue)
 *   testing_failed → workflow_status='FAILED',   qa_status='FAILED_FUNCTIONAL'
 *
 * The DB enums and persistence layer are unchanged from receiving (see
 * `lib/receiving/receive-line.ts` and `mark-received-po`); we just narrow
 * the visible choices and add a third 'TEST_AGAIN' affordance for re-queue.
 */
export type TestingVerdict = 'PASS' | 'TEST_AGAIN' | 'TESTING_FAILED';

interface Props {
  value: TestingVerdict | null | undefined;
  onChange: (next: TestingVerdict) => void;
  disabled?: boolean;
  /**
   * When set, the picker starts as the full row and collapses to the selected
   * pill + an edit pencil once a verdict is chosen — mirroring {@link ConditionPills}.
   */
  collapsible?: boolean;
  /** Controlled expanded state (collapsible mode only). */
  expanded?: boolean;
  onExpandedChange?: (next: boolean) => void;
  /**
   * Collapsible mode only. When false, the collapsed state renders JUST the edit
   * pencil (no selected-verdict pill) — used where another surface already shows
   * the verdict. Defaults to true.
   */
  collapsedLabel?: boolean;
}

const TEST_OPTS: Array<{
  value: TestingVerdict;
  label: string;
  tone: { active: string; inactive: string };
}> = [
  {
    value: 'PASS',
    label: 'Pass',
    tone: {
      active: 'bg-emerald-600 text-white shadow-sm shadow-emerald-200 ring-emerald-700',
      inactive: 'bg-surface-card text-emerald-800 ring-emerald-200 hover:bg-emerald-50',
    },
  },
  {
    value: 'TEST_AGAIN',
    label: 'Test Again',
    tone: {
      active: 'bg-amber-500 text-white shadow-sm shadow-amber-200 ring-amber-600',
      inactive: 'bg-surface-card text-amber-800 ring-amber-200 hover:bg-amber-50',
    },
  },
  {
    value: 'TESTING_FAILED',
    label: 'Testing Failed',
    tone: {
      active: 'bg-rose-600 text-white shadow-sm shadow-rose-200 ring-rose-700',
      inactive: 'bg-surface-card text-rose-800 ring-rose-200 hover:bg-rose-50',
    },
  },
];

const PILL_BASE =
  'ds-raw-button inline-flex h-9 shrink-0 snap-start items-center whitespace-nowrap rounded-full px-4 text-role-caption font-black uppercase tracking-[0.1em] ring-1 ring-inset transition-all active:scale-[0.98]';

/**
 * Testing verdict picker. Mirrors {@link ConditionPills}' visual primitive
 * (ring-pill row, horizontal-scroll, radio semantics) so the receiving and
 * testing forms feel identical — only the choices differ. Tones intentionally
 * encode meaning: green = ship-ready, amber = re-queue, rose = fail/claim.
 */
export function TestingStatusPills({
  value,
  onChange,
  disabled = false,
  collapsible = false,
  expanded: expandedProp,
  onExpandedChange,
  collapsedLabel = true,
}: Props) {
  const selected = (value ?? '').toUpperCase() as TestingVerdict | '';
  const selectedOpt = TEST_OPTS.find((o) => o.value === selected) ?? null;
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [internalExpanded, setInternalExpanded] = useState(true);
  const expanded = expandedProp ?? internalExpanded;
  const setExpanded = (next: boolean) => {
    onExpandedChange?.(next);
    if (expandedProp === undefined) setInternalExpanded(next);
  };
  useHorizontalWheelScroll(scrollerRef, expanded);

  // Collapsed: selected pill + pencil, or pencil-only when no verdict yet
  // (lets condition/verdict mutex collapse the row even before a pick).
  if (collapsible && !expanded) {
    return (
      <div
        role="radiogroup"
        aria-label="Testing verdict"
        aria-disabled={disabled || undefined}
        className={`flex w-fit items-center gap-1.5 ${disabled ? 'pointer-events-none opacity-60' : ''}`}
      >
        {selectedOpt && collapsedLabel ? (
          <HoverTooltip label={`${selectedOpt.label} — change`} asChild focusable={false}>
            <button
              type="button"
              aria-label={`Verdict ${selectedOpt.label} — change`}
              onClick={() => setExpanded(true)}
              disabled={disabled}
              className={`${PILL_BASE} ${selectedOpt.tone.active}`}
            >
              {selectedOpt.label}
            </button>
          </HoverTooltip>
        ) : null}
        <HoverTooltip
          label={
            selectedOpt
              ? collapsedLabel
                ? 'Edit verdict'
                : `Verdict ${selectedOpt.label} — change`
              : 'Set testing verdict'
          }
          asChild
          focusable={false}
        >
          <button
            type="button"
            onClick={() => setExpanded(true)}
            disabled={disabled}
            aria-label={
              selectedOpt
                ? collapsedLabel
                  ? 'Edit verdict'
                  : `Verdict ${selectedOpt.label} — change`
                : 'Set testing verdict'
            }
            className="ds-raw-button rounded p-0.5 text-text-faint transition-colors hover:bg-surface-sunken hover:text-text-muted"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </HoverTooltip>
      </div>
    );
  }

  return (
    <div
      ref={scrollerRef}
      role="radiogroup"
      aria-label="Testing verdict"
      aria-disabled={disabled || undefined}
      className={`-mx-1 flex gap-1.5 overflow-x-auto overscroll-x-contain px-1 py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${
        disabled ? 'pointer-events-none opacity-60' : ''
      }`}
    >
      {TEST_OPTS.map((opt) => {
        const isActive = selected === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => {
              onChange(opt.value);
              if (collapsible) setExpanded(false);
            }}
            disabled={disabled}
            className={`${PILL_BASE} ${isActive ? opt.tone.active : opt.tone.inactive}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Translate a {@link TestingVerdict} into the receiving-lines PATCH body. */
export function verdictToReceivingLinePatch(verdict: TestingVerdict): {
  workflow_status: string;
  qa_status: string;
  disposition_code: string;
} {
  switch (verdict) {
    case 'PASS':
      return {
        workflow_status: 'PASSED',
        qa_status: 'PASSED',
        disposition_code: 'ACCEPT',
      };
    case 'TEST_AGAIN':
      return {
        workflow_status: 'IN_TEST',
        qa_status: 'PENDING',
        disposition_code: 'HOLD',
      };
    case 'TESTING_FAILED':
      return {
        workflow_status: 'FAILED',
        qa_status: 'FAILED_FUNCTIONAL',
        disposition_code: 'REJECT',
      };
  }
}

/** Best-effort reverse mapping for the initial verdict shown to the tech. */
export function workflowToVerdict(
  workflow: string | null | undefined,
): TestingVerdict | null {
  const v = String(workflow ?? '').trim().toUpperCase();
  if (v === 'PASSED' || v === 'DONE') return 'PASS';
  if (v === 'IN_TEST' || v === 'AWAITING_TEST') return 'TEST_AGAIN';
  if (v === 'FAILED' || v.startsWith('FAILED_')) return 'TESTING_FAILED';
  return null;
}

/**
 * Derive the per-unit verdict from a `serial_units.current_status` value.
 *
 * The /api/serial-units/[id]/test endpoint writes these transitions:
 *   PASS         → 'TESTED'
 *   TEST_AGAIN   → 'IN_TEST'
 *   TESTING_FAIL → 'ON_HOLD'
 *
 * Everything else (RECEIVED, GRADED, UNKNOWN, etc.) reads as "no verdict
 * picked yet" so the pills render unselected.
 */
export function unitStatusToVerdict(
  status: string | null | undefined,
): TestingVerdict | null {
  const s = String(status ?? '').trim().toUpperCase();
  if (s === 'TESTED') return 'PASS';
  if (s === 'IN_TEST') return 'TEST_AGAIN';
  if (s === 'ON_HOLD') return 'TESTING_FAILED';
  return null;
}

/**
 * Inverse of {@link unitStatusToVerdict}: the `serial_units.current_status` the
 * /api/serial-units/[id]/test endpoint writes for a verdict. Used to reflect a
 * verdict optimistically before the server round-trip resolves.
 *   PASS → 'TESTED' · TEST_AGAIN → 'IN_TEST' · TESTING_FAILED → 'ON_HOLD'
 */
export function verdictToUnitStatus(verdict: TestingVerdict): string {
  switch (verdict) {
    case 'PASS':
      return 'TESTED';
    case 'TEST_AGAIN':
      return 'IN_TEST';
    case 'TESTING_FAILED':
      return 'ON_HOLD';
  }
}
