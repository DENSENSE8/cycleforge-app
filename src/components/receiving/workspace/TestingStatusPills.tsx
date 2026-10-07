'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Check, Pencil, Wrench, X } from '@/components/Icons';
import { TOP_CHROME_ICON_GLYPH } from '@/components/layout/header-shell';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useHorizontalWheelScroll } from '@/hooks/useHorizontalWheelScroll';
import { KeyboardKey } from '@/design-system/primitives';

/** Verdict the tech assigns to a receiving line during the testing step. */
export type TestingVerdict = 'PASS' | 'TEST_AGAIN' | 'TESTING_FAILED';

interface Props {
  value: TestingVerdict | null | undefined;
  onChange: (next: TestingVerdict) => void;
  disabled?: boolean;
  /**
   * When set, the picker starts as the full row and collapses to the selected
   * icon face once a verdict is chosen — mirroring {@link ConditionPills} Tags.
   */
  collapsible?: boolean;
  /** Controlled expanded state (collapsible mode only). */
  expanded?: boolean;
  onExpandedChange?: (next: boolean) => void;
  /**
   * Collapsible mode only. When false, the collapsed state renders JUST the edit
   * pencil (no selected-verdict face) — used where another surface already shows
   * the verdict. Defaults to true.
   */
  collapsedLabel?: boolean;
  /** Expanded strip prints each verdict's word beside its glyph (the station's middle verdict row). */
  labeled?: boolean;
  /**
   * Each verdict's key, painted as a KeyboardKey inside its button (owner
   * 2026-10-06, the Quality control station's verdict row; see
   * design-system/pinned.json "KeyboardKey").
   */
  hotkeys?: Readonly<Partial<Record<TestingVerdict, string>>>;
}

const VERDICT_ICON = {
  PASS: <Check className={TOP_CHROME_ICON_GLYPH} aria-hidden />,
  TEST_AGAIN: <Wrench className={TOP_CHROME_ICON_GLYPH} aria-hidden />,
  TESTING_FAILED: <X className={TOP_CHROME_ICON_GLYPH} aria-hidden />,
} as const satisfies Record<TestingVerdict, ReactNode>;

const TEST_OPTS: Array<{
  value: TestingVerdict;
  label: string;
  /** The word a labeled strip prints. */
  short: string;
  face: ReactNode;
  tone: { active: string; inactive: string };
}> = [
  {
    value: 'TESTING_FAILED',
    label: 'Testing Failed',
    short: 'Fail',
    face: VERDICT_ICON.TESTING_FAILED,
    tone: {
      active: 'bg-rose-600 text-white shadow-none ring-rose-700',
      inactive: 'bg-surface-card text-rose-800 ring-rose-200 hover:bg-rose-50',
    },
  },
  {
    value: 'TEST_AGAIN',
    label: 'Test Again',
    short: 'Test again',
    face: VERDICT_ICON.TEST_AGAIN,
    tone: {
      active: 'bg-blue-600 text-white shadow-none ring-blue-700',
      inactive: 'bg-surface-card text-blue-800 ring-blue-200 hover:bg-blue-50',
    },
  },
  {
    value: 'PASS',
    label: 'Pass',
    short: 'Pass',
    face: VERDICT_ICON.PASS,
    tone: {
      active: 'bg-emerald-600 text-white shadow-none ring-emerald-700',
      inactive: 'bg-surface-card text-emerald-800 ring-emerald-200 hover:bg-emerald-50',
    },
  },
];

/**
 * Collapsed selected face — locked square peer of condition Tags.
 * Expanded options use {@link SEGMENT_FACE} (flex-1 fill).
 */
const ICON_FACE =
  'ds-raw-button inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-none ring-1 ring-inset transition-colors active:scale-[0.98]';

/**
 * Expanded segment — equal thirds of the trailing action band (station primary
 * decision). Icon stays centered; hit target fills the cell.
 */
const SEGMENT_FACE =
  'ds-raw-button inline-flex h-11 min-w-0 flex-1 items-center justify-center rounded-none ring-1 ring-inset transition-colors active:scale-[0.98]';

/** Edit pencil — locked square peer when no verdict face is shown. */
const PENCIL_FACE =
  'ds-raw-button inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-none border border-border-soft bg-surface-card text-text-faint shadow-none transition-colors hover:bg-surface-hover hover:text-text-muted';

/**
 * Testing verdict picker — station primary action. Trailing fill-width band:
 * X · Wrench · Check share equal thirds, Pass rightmost. Collapsed: selected face pins end;
 * hover expands the full band. HoverTooltip carries the teaching name.
 */
export function TestingStatusPills({
  value,
  onChange,
  disabled = false,
  collapsible = false,
  expanded: expandedProp,
  onExpandedChange,
  collapsedLabel = true,
  labeled = false,
  hotkeys,
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

  const openStrip = () => {
    if (disabled) return;
    setExpanded(true);
  };
  const closeStrip = () => {
    if (!collapsible) return;
    setExpanded(false);
  };

  // Collapsed: selected face pinned trailing (hover/focus/click expands), or
  // pencil-only when no verdict yet / collapsedLabel off.
  if (collapsible && !expanded) {
    return (
      <div
        role="radiogroup"
        aria-label="Testing verdict"
        aria-disabled={disabled || undefined}
        className={`flex w-full min-w-0 items-stretch justify-end gap-0 ${disabled ? 'pointer-events-none opacity-60' : ''}`}
        onMouseEnter={openStrip}
        onFocusCapture={openStrip}
      >
        {selectedOpt && collapsedLabel ? (
          <HoverTooltip label={`${selectedOpt.label} — hover to change`} asChild focusable={false}>
            <button
              type="button"
              aria-label={`Verdict ${selectedOpt.label} — change`}
              onClick={openStrip}
              disabled={disabled}
              className={`${ICON_FACE} ${selectedOpt.tone.active}`}
            >
              {selectedOpt.face}
            </button>
          </HoverTooltip>
        ) : (
          <HoverTooltip
            label={
              selectedOpt
                ? `Verdict ${selectedOpt.label} — hover to change`
                : 'Set testing verdict'
            }
            asChild
            focusable={false}
          >
            <button
              type="button"
              onClick={openStrip}
              disabled={disabled}
              aria-label={
                selectedOpt
                  ? `Verdict ${selectedOpt.label} — change`
                  : 'Set testing verdict'
              }
              className={PENCIL_FACE}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </HoverTooltip>
        )}
      </div>
    );
  }

  return (
    <div
      ref={scrollerRef}
      role="radiogroup"
      aria-label="Testing verdict"
      aria-disabled={disabled || undefined}
      onMouseLeave={closeStrip}
      className={`flex w-full min-w-0 items-stretch gap-0 ${
        disabled ? 'pointer-events-none opacity-60' : ''
      }`}
    >
      {TEST_OPTS.map((opt) => {
        const isActive = selected === opt.value;
        return (
          <HoverTooltip key={opt.value} label={opt.label} asChild focusable={false}>
            <button
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={opt.label}
              aria-keyshortcuts={hotkeys?.[opt.value]}
              onClick={() => {
                onChange(opt.value);
                if (collapsible) setExpanded(false);
              }}
              disabled={disabled}
              className={`${SEGMENT_FACE} ${labeled ? 'gap-2 text-role-caption font-semibold' : ''} ${isActive ? opt.tone.active : opt.tone.inactive}`}
            >
              {opt.face}
              {labeled ? <span className="truncate">{opt.short}</span> : null}
              {hotkeys?.[opt.value] ? (
                <KeyboardKey size="xs" tone="inverse" aria-hidden>
                  {hotkeys[opt.value]}
                </KeyboardKey>
              ) : null}
            </button>
          </HoverTooltip>
        );
      })}
    </div>
  );
}

/** Derive the per-unit verdict from a `serial_units.current_status` value. */
export function unitStatusToVerdict(
  status: string | null | undefined,
): TestingVerdict | null {
  const s = String(status ?? '').trim().toUpperCase();
  if (s === 'TESTED') return 'PASS';
  if (s === 'IN_TEST') return 'TEST_AGAIN';
  if (s === 'ON_HOLD') return 'TESTING_FAILED';
  return null;
}

/** Inverse of {@link unitStatusToVerdict}: */
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
