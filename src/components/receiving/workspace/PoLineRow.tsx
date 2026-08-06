'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, motionRole } from '@/design-system/motion';
import { ChevronDown, ChevronRight, Check, Barcode } from '@/components/Icons';
import {
  framerPresence,
  framerTransition,
  motionBezier,
} from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import {
  ConditionGradeChip,
  EmptySkuChipFace,
  SerialChipSkeleton,
  SkuScanRefChip,
  UnitPriceChip,
  getLast8,
} from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton, TextField } from '@/design-system/primitives';
import { META_COL } from '@/components/ui/RowMetaColumns';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';
import { PoLineMetaGrid } from '@/components/receiving/workspace/PoLineMetaGrid';
import { PoLineHeaderThumb } from '@/components/receiving/workspace/PoLineHeaderThumb';
import { PO_LINE_HEADER_FACE } from '@/components/receiving/workspace/station-scan-face';
import {
  PoLineTitleMenu,
  type PoLineSerialSplitContext,
} from '@/components/receiving/workspace/PoLineTitleMenu';
import { cn } from '@/utils/_cn';
import { cornerClass } from '@/design-system/tokens/radius';
import {
  NoSerialControl,
  type SerialAbsentState,
} from '@/components/receiving/workspace/line-edit/NoSerialControl';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import { receivingWorkspaceLineTitle } from '@/lib/receiving/po-group-title';
import {
  SCAN_LINE_PULSE_EVENT,
  type ScanLinePulseDetail,
} from '@/lib/scan-feedback/visual';
import { ScannedBadge, ProgressBadge } from './PoLineBadges';
import type {
  ActiveRowSlot,
  PoLineSerialActions,
} from './po-lines-accordion-types';

/** One-shot match acknowledgement — longer than chipCopyFeedback so the eye catches it. */
const LINE_PULSE_MS = 400;

/** Sibling row reorder when the active line changes — softer than the default layout spring. */
const PO_LINE_LAYOUT_SPRING = {
  type: 'spring' as const,
  stiffness: 220,
  damping: 36,
  mass: 0.9,
};

/** Active row body expand/collapse — slower + layout-eased than stationCollapse. */
const PO_LINE_BODY_COLLAPSE = {
  height: {
    type: 'tween' as const,
    duration: 0.4,
    ease: motionBezier.layout,
  },
  opacity: {
    type: 'tween' as const,
    duration: 0.32,
    ease: motionBezier.easeOut,
  },
};

/** Max last-8 serials shown in the collapsed meta preview. */
const SERIAL_PREVIEW_CAP = 2;

/** Inline item-description editor surface handed down from the accordion shell. */
export interface PoLineDescProps {
  shownId: number | null;
  draft: string;
  savingLineId: number | null;
  inputRef: React.RefObject<HTMLInputElement>;
  toggle: (line: ReceivingLineRow) => void;
  setDraft: (value: string) => void;
  save: (lineId: number) => void;
}

interface Props {
  line: ReceivingLineRow;
  isActive: boolean;
  readOnly: boolean;
  /** Serial-hydration fetch in flight — show the serial-slot skeleton until it lands. */
  serialsLoading?: boolean;
  activeCollapsed: boolean;
  onToggleCollapsed: () => void;
  /**
   * When false, inactive rows keep a trailing chevron track for alignment but
   * omit the decorative glyph (Pending group headers use the same
   * `showChevron={false}` discipline — don't advertise expand that only
   * switches focus).
   */
  showInactiveChevron?: boolean;
  activeConditionOverride?: string | null;
  /**
   * Kept for accordion API parity — per-serial edit/delete lives in the expanded
   * body / Units Displays, not the collapsed meta preview.
   */
  activeSerialActions?: PoLineSerialActions;
  activeRowSlot?: ActiveRowSlot;
  renderTitleActions?: (line: ReceivingLineRow) => React.ReactNode;
  /** Unmatched-carton serial split (Testing UNLINK) — offered from the title ⋮ menu. */
  serialSplit?: PoLineSerialSplitContext;
  desc: PoLineDescProps;
  /**
   * Change (clear / re-reason) an already-committed no-serial waiver from the
   * collapsed meta row. Activating a new waiver happens in the expanded editor
   * (green check). Omit on read-only surfaces or when the caller cannot stamp.
   */
  onSerialAbsentChange?: (lineId: number, next: SerialAbsentState) => void;
  /**
   * Enable framer `layout` position tracking. The accordion sets this false
   * while it lives in a hidden tab panel (`display:none`) so the rows don't fly
   * in from the origin when the panel is re-shown; the sibling-reorder layout
   * animation runs only when the panel is actually visible. Defaults to true so
   * standalone callers (testing) are unaffected.
   */
  animateLayout?: boolean;
  /**
   * Open Units Displays for this line (serials cell "View All"). Select the line
   * first when inactive. Omit on surfaces without a Displays host.
   */
  onViewAllUnits?: (line: ReceivingLineRow) => void;
}

/**
 * One PO-item row. Nested CSS grid: size-20 (5rem) thumb | wrapping title |
 * boxed meta (qty · SKU · condition · serials preview + View All · price).
 * The thumb lives in the title + details band and expands that row’s height.
 * Collapsed siblings dispatch `receiving-select-line` on click; the active row
 * expands condition/serial body. Purely presentational — mutations are delegated up.
 */
export function PoLineRow({
  line,
  isActive,
  readOnly,
  serialsLoading = false,
  activeCollapsed,
  onToggleCollapsed,
  showInactiveChevron = false,
  activeConditionOverride,
  activeRowSlot,
  renderTitleActions,
  serialSplit,
  desc,
  onSerialAbsentChange,
  animateLayout = true,
  onViewAllUnits,
}: Props) {
  const rowBodyCollapse = useMotionPresence(framerPresence.collapseHeight);
  const rowBodyTransition = useMotionTransition(PO_LINE_BODY_COLLAPSE);
  const rowLayoutTransition = useMotionTransition(PO_LINE_LAYOUT_SPRING);
  const pulseTransition = useMotionTransition(motionRole.feedback.pulse.transition);
  const lineTitle = receivingWorkspaceLineTitle(line);
  const chevronTransition = useMotionTransition(framerTransition.stationChevron);

  const descShown = desc.shownId === line.id;

  /**
   * Is this row's editor body on screen? When true, the green-check no-serial
   * offer lives there — suppress the meta-row committed token so the two never
   * stack. Mirrors the body's own render gate below.
   */
  const editorBodyVisible = !readOnly && isActive && !activeCollapsed && !!activeRowSlot;

  const serialNumbers = (Array.isArray(line.serials) ? line.serials : [])
    .map((s) => (s.serial_number || '').trim())
    .filter(Boolean);
  const expectedQty = Number(line.quantity_expected) || 0;
  const showViewAll =
    !!onViewAllUnits &&
    !readOnly &&
    (serialNumbers.length > 0 || expectedQty > 1 || (line.units?.length ?? 0) > 0);

  // Transient match acknowledgement — inset emerald ring, never a persistent
  // green card border. Fired by {@link pulseScanLine} after a successful scan.
  const [pulseToken, setPulseToken] = useState(0);
  useEffect(() => {
    const onPulse = (event: Event) => {
      const detail = (event as CustomEvent<ScanLinePulseDetail>).detail;
      if (detail?.lineId !== line.id) return;
      setPulseToken((n) => n + 1);
    };
    window.addEventListener(SCAN_LINE_PULSE_EVENT, onPulse);
    return () => window.removeEventListener(SCAN_LINE_PULSE_EVENT, onPulse);
  }, [line.id]);
  useEffect(() => {
    if (pulseToken === 0) return;
    const token = pulseToken;
    const timer = window.setTimeout(() => {
      setPulseToken((n) => (n === token ? 0 : n));
    }, LINE_PULSE_MS);
    return () => window.clearTimeout(timer);
  }, [pulseToken]);

  return (
    <motion.li
      layout={animateLayout ? 'position' : false}
      transition={rowLayoutTransition}
      aria-current={isActive ? 'true' : undefined}
      data-po-line-row
      data-po-line-active={isActive ? 'true' : undefined}
      className={cn(
        // Flat data floor: hairline bottom only — no card radius / side borders.
        'relative min-w-0 overflow-hidden rounded-none border-0 border-b border-border-soft transition-colors',
        // Active = the operator's current context: opaque white face on the
        // sunken station canvas (not the bg-blue-50 wash, which reads as no
        // face there). Flat geometry is untouched — rounded-none + hairline
        // border-b stay above.
        isActive
          ? QUEUE_ROW.selectedStationClass
          : 'bg-surface-card hover:bg-surface-hover',
      )}
    >
      <AnimatePresence>
        {pulseToken > 0 ? (
          <motion.span
            key={pulseToken}
            aria-hidden
            initial={{ opacity: 0.85 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={pulseTransition}
            className="pointer-events-none absolute inset-0 z-0 ring-2 ring-inset ring-emerald-400/70"
          />
        ) : null}
      </AnimatePresence>
      {/* Click area = title + meta. Kept as a <div role="button"> so
          interactive children can render inside without nested <button>. */}
      <div
        role={!readOnly && !isActive ? 'button' : undefined}
        tabIndex={!readOnly && !isActive ? 0 : -1}
        onClick={() => {
          if (!readOnly && !isActive) dispatchSelectLine(line);
        }}
        onKeyDown={(e) => {
          if (readOnly || isActive) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            dispatchSelectLine(line);
          }
        }}
        className={`w-full min-w-0 py-0 pl-0 pr-0 text-left ${
          !readOnly && !isActive ? 'cursor-pointer' : ''
        }`}
      >
        {/* Nested grid: size-20 thumb | title + boxed meta. Thumb sits in the
            title + details band (expands that row); structural border-r
            (media vs data); meta gutters are whitespace (gap-x), not vertical
            hairlines. Condition editing stays in the serial body below. */}
        <div
          className={cn(
            'grid min-w-0',
            PO_LINE_HEADER_FACE.minH,
            PO_LINE_HEADER_FACE.thumbGrid,
          )}
        >
          <PoLineHeaderThumb imageUrl={line.image_url} />
          <div className="flex min-w-0 flex-col">
            {/* Title band — wraps; ⋮ + expand chevron stay on the first line,
                trailing right (chevron after line actions). */}
            <div className="flex min-w-0 items-start gap-0 px-2 py-1">
              <p className="min-w-0 flex-1 text-role-caption font-semibold leading-tight text-text-default">
                {lineTitle}
              </p>
              {!readOnly ? (
                <PoLineTitleMenu
                  line={line}
                  descShown={descShown}
                  onToggleDesc={() => desc.toggle(line)}
                  serialSplit={serialSplit}
                />
              ) : null}
              {!readOnly ? renderTitleActions?.(line) : null}
              {!readOnly ? (
                <span
                  className={cn(
                    'flex shrink-0 items-center justify-center self-center',
                    META_COL.dotTrackWide,
                  )}
                >
                  {isActive ? (
                    <motion.button
                      type="button"
                      aria-expanded={!activeCollapsed}
                      aria-label={
                        activeCollapsed ? 'Expand item details' : 'Collapse item details'
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleCollapsed();
                      }}
                      animate={{ rotate: activeCollapsed ? -90 : 0 }}
                      transition={chevronTransition}
                      className="ds-raw-button flex items-center justify-center rounded-md p-0.5 text-text-faint transition-colors hover:bg-surface-hover hover:text-text-muted"
                    >
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                    </motion.button>
                  ) : showInactiveChevron ? (
                    <ChevronDown
                      className="h-3.5 w-3.5 -rotate-90 text-text-faint transition-transform"
                      aria-hidden
                    />
                  ) : (
                    <span className="h-3.5 w-3.5" aria-hidden />
                  )}
                </span>
              ) : null}
            </div>
            <PoLineMetaGrid
              qty={
                readOnly ? (
                  <ScannedBadge expected={line.quantity_expected} />
                ) : (
                  <ProgressBadge
                    received={line.quantity_received}
                    expected={line.quantity_expected}
                  />
                )
              }
              sku={
                (line.sku || '').trim() ? (
                  <SkuScanRefChip
                    value={line.sku as string}
                    display={getLast8(line.sku)}
                    dense
                  />
                ) : (
                  <EmptySkuChipFace dense />
                )
              }
              condition={
                <ConditionGradeChip
                  grade={
                    isActive && activeConditionOverride
                      ? activeConditionOverride
                      : line.condition_grade
                  }
                  dense
                />
              }
              serial={
                serialsLoading ? (
                  <SerialChipSkeleton width="w-fit max-w-full" dense />
                ) : !readOnly &&
                  onSerialAbsentChange &&
                  !editorBodyVisible &&
                  (line.serial_absent ?? false) ? (
                  <NoSerialControl
                    variant="pill"
                    absent
                    reason={line.serial_absent_reason ?? null}
                    onChange={(next) => onSerialAbsentChange(line.id, next)}
                  />
                ) : serialNumbers.length > 0 || showViewAll ? (
                  <div className="flex h-full min-w-0 w-full items-stretch gap-1.5 overflow-hidden">
                    <span className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden px-2 py-1">
                      <Barcode
                        className="h-3 w-3 shrink-0 text-emerald-500"
                        aria-hidden
                      />
                      <span className="min-w-0 truncate tabular-nums text-text-muted normal-case tracking-normal">
                        {serialNumbers.length > 0
                          ? serialNumbers
                              .slice(-SERIAL_PREVIEW_CAP)
                              .map((sn) => getLast8(sn))
                              .join(', ')
                          : '—'}
                      </span>
                    </span>
                    {showViewAll ? (
                      <button
                        type="button"
                        aria-label="View all units"
                        className="ds-raw-button inline-flex h-auto shrink-0 items-center gap-0.5 self-stretch border-0 bg-surface-card px-1.5 py-0 text-role-micro font-semibold uppercase tracking-widest text-text-muted hover:bg-surface-hover hover:text-text-default"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isActive) dispatchSelectLine(line);
                          onViewAllUnits?.(line);
                        }}
                      >
                        View All
                        <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                ) : undefined
              }
              price={
                line.unit_price != null && Number(line.unit_price) > 0 ? (
                  <UnitPriceChip amount={line.unit_price} dense />
                ) : undefined
              }
            />
          </div>
        </div>
      </div>
      {/* Active row only — expanded body (condition pills / serial adder / desc). */}
      {!readOnly && isActive && (activeRowSlot || descShown) ? (
        <motion.div
          initial={false}
          layout={animateLayout ? 'position' : false}
          animate={
            activeCollapsed
              ? rowBodyCollapse.exit
              : rowBodyCollapse.animate
          }
          transition={rowBodyTransition}
          className="min-w-0 overflow-hidden border-t border-border-hairline bg-surface-card"
          aria-hidden={activeCollapsed}
        >
          <div className="min-w-0 bg-surface-card px-0 py-0">
            {descShown ? (
              <div className="flex items-center gap-2">
                <TextField
                  ref={desc.inputRef}
                  label="Item description"
                  value={desc.draft}
                  onChange={desc.setDraft}
                  tone="neutral"
                  className="min-w-0 flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') desc.save(line.id);
                  }}
                />
                <HoverTooltip label="Save item description" asChild>
                  <IconButton
                    ariaLabel="Save item description"
                    onClick={() => desc.save(line.id)}
                    disabled={desc.savingLineId === line.id}
                    className={cn(
                      'inline-flex h-11 w-11 shrink-0 items-center justify-center bg-emerald-600 text-white ring-1 ring-inset ring-emerald-700 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40',
                      cornerClass('flush'),
                    )}
                    icon={<Check className="h-4 w-4" aria-hidden />}
                  />
                </HoverTooltip>
              </div>
            ) : typeof activeRowSlot === 'function'
              ? activeRowSlot({
                  serials: line.serials ?? [],
                  units: line.units ?? [],
                })
              : activeRowSlot}
          </div>
        </motion.div>
      ) : null}
    </motion.li>
  );
}
