'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, motionRole } from '@/design-system/motion';
import { Barcode } from '@/components/Icons';
import {
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
import { focusRing } from '@/design-system/tokens/focus-ring';
import type { SerialAbsentState } from '@/components/receiving/workspace/line-edit/NoSerialControl';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { resolveReceivingLineSerialsCsv } from '@/components/station/receiving-line-serials';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import { setActiveSinkId } from '@/lib/station-scan-sink';
import { receivingWorkspaceLineTitle } from '@/lib/receiving/po-group-title';
import {
  SCAN_LINE_PULSE_EVENT,
  type ScanLinePulseDetail,
} from '@/lib/scan-feedback/visual';
import { ScannedBadge, ProgressBadge } from './PoLineBadges';
import { scheduleFocusUnboxCaptureSerialInLine } from './line-edit/focus-unbox-capture-serial';
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

/** Max last-8 serials shown in the collapsed meta preview. */
const SERIAL_PREVIEW_CAP = 2;

interface Props {
  line: ReceivingLineRow;
  isActive: boolean;
  readOnly: boolean;
  /** Serial-hydration fetch in flight — show the serial-slot skeleton until it lands. */
  serialsLoading?: boolean;
  activeConditionOverride?: string | null;
  /**
   * Kept for accordion API parity — per-serial edit/delete lives in the expanded
   * body / Units Displays, not the collapsed meta preview.
   */
  activeSerialActions?: PoLineSerialActions;
  activeRowSlot?: ActiveRowSlot;
  /** Unmatched-carton serial split (Testing UNLINK) — offered from the title ⋮ menu. */
  serialSplit?: PoLineSerialSplitContext;
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
   * Open Units Displays for this line (serials cell click). Select the line
   * first when inactive. Omit on surfaces without a Displays host.
   */
  onViewAllUnits?: (line: ReceivingLineRow) => void;
  /**
   * Unbox dual loci: condition / serial meta click → focus that step in the
   * dock (and select the line so the under-row mouse editor shows). When the
   * serial handler is set it outranks {@link onViewAllUnits} for the serials
   * cell.
   */
  onEditConditionInDock?: (line: ReceivingLineRow) => void;
  onEditSerialInDock?: (line: ReceivingLineRow) => void;
  /**
   * When false, meta collapses to qty | SKU | price (Arrival door flow — no
   * condition · serial / Units chrome). Defaults true.
   */
  unitsChrome?: boolean;
}

/**
 * One PO-item row. Nested CSS grid: size-20 (5rem) thumb | wrapping title |
 * boxed meta (qty · SKU · condition · serials preview · price).
 * The thumb lives in the title + details band and expands that row’s height.
 * Inactive siblings dispatch `receiving-select-line` on click for focus.
 * Unbox dual loci: meta chips (`onEditConditionInDock` / `onEditSerialInDock`)
 * focus the dock; parent may also pass `activeRowSlot`
 * (`ActiveLineConditionSerial`) under the active line for mouse go-back edit.
 * Purely presentational — mutations up.
 */
export function PoLineRow({
  line,
  isActive,
  readOnly,
  serialsLoading = false,
  activeConditionOverride,
  activeRowSlot,
  serialSplit,
  onSerialAbsentChange: _onSerialAbsentChange,
  animateLayout = true,
  onViewAllUnits,
  onEditConditionInDock,
  onEditSerialInDock,
  unitsChrome = true,
}: Props) {
  const rowLayoutTransition = useMotionTransition(PO_LINE_LAYOUT_SPRING);
  const pulseTransition = useMotionTransition(motionRole.feedback.pulse.transition);
  const lineTitle = receivingWorkspaceLineTitle(line);

  // Persisted units win; optimistic return lines fall back to the title serial
  // so the meta face stays last-8 before projection catches up.
  const serialNumbers = resolveReceivingLineSerialsCsv(line)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const expectedQty = Number(line.quantity_expected) || 0;
  const canOpenUnits =
    !!onViewAllUnits &&
    !readOnly &&
    (serialNumbers.length > 0 || expectedQty > 1 || (line.units?.length ?? 0) > 0);
  const canEditSerialInDock = !!onEditSerialInDock && !readOnly;

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

  /** Select this line and arm its capture serial (Unbox dual loci). */
  const activateLineForSerial = () => {
    if (readOnly) return;
    setActiveSinkId(`po-line:${line.id}`);
    if (!isActive) dispatchSelectLine(line);
    // Capture face owns serial entry when mounted; dock wedge only as fallback.
    if (activeRowSlot) {
      scheduleFocusUnboxCaptureSerialInLine(line.id, 60);
      return;
    }
    setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
  };

  return (
    <motion.li
      layout={animateLayout ? 'position' : false}
      transition={rowLayoutTransition}
      aria-current={isActive ? 'true' : undefined}
      data-po-line-row
      data-receiving-line-id={line.id}
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
          interactive children can render inside without nested <button>.
          Mouse + keyboard parity: selecting / focusing the row arms the
          Action scan sink (`po-line:`) and reclaims the dock wedge. */}
      <div
        role={!readOnly && !isActive ? 'button' : undefined}
        tabIndex={!readOnly && !isActive ? 0 : -1}
        onFocus={() => {
          if (readOnly) return;
          setActiveSinkId(`po-line:${line.id}`);
        }}
        onClick={() => {
          activateLineForSerial();
        }}
        onKeyDown={(e) => {
          if (readOnly || isActive) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activateLineForSerial();
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
          <div className="flex min-h-0 min-w-0 flex-col justify-between self-stretch">
            {/* Title band — wraps; the conditional line ⋮ (Unlink) / Testing
                serial-link controls trail right. No collapse chevron: capture
                and item detail live in the bottom dock + right-edge Displays,
                so the line row is a pure ledger with no top-right controls on
                the Unbox/Arrival path. */}
            <div className="flex min-w-0 items-start gap-0 px-2 py-1">
              <p className="min-w-0 flex-1 text-role-caption font-semibold leading-tight text-text-default">
                {lineTitle}
              </p>
              {!readOnly ? (
                <PoLineTitleMenu line={line} serialSplit={serialSplit} />
              ) : null}
            </div>
            <PoLineMetaGrid
              unitsChrome={unitsChrome}
              qty={
                readOnly ? (
                  <ScannedBadge expected={line.quantity_expected} />
                ) : activeRowSlot ? (
                  <HoverTooltip label="Focus serial for this unit" asChild>
                    <button
                      type="button"
                      data-po-line-units
                      aria-label="Focus serial for this unit"
                      className={cn(
                        'ds-raw-button flex h-full min-w-0 items-center',
                        focusRing('control', 'neutral'),
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        activateLineForSerial();
                      }}
                    >
                      <ProgressBadge
                        received={line.quantity_received}
                        expected={line.quantity_expected}
                      />
                    </button>
                  </HoverTooltip>
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
                unitsChrome ? (
                  onEditConditionInDock && !readOnly ? (
                    <HoverTooltip label="Edit condition in dock" asChild>
                      <button
                        type="button"
                        aria-label="Edit condition in dock"
                        className={cn(
                          'ds-raw-button flex h-full min-w-0 items-center',
                          focusRing('control', 'neutral'),
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveSinkId(`po-line:${line.id}`);
                          if (!isActive) dispatchSelectLine(line);
                          onEditConditionInDock(line);
                          setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
                        }}
                      >
                        <ConditionGradeChip
                          grade={
                            isActive && activeConditionOverride
                              ? activeConditionOverride
                              : line.condition_grade
                          }
                          dense
                        />
                      </button>
                    </HoverTooltip>
                  ) : (
                    <ConditionGradeChip
                      grade={
                        isActive && activeConditionOverride
                          ? activeConditionOverride
                          : line.condition_grade
                      }
                      dense
                    />
                  )
                ) : undefined
              }
              serial={
                !unitsChrome ? undefined : serialsLoading ? (
                  <SerialChipSkeleton width="w-fit max-w-full" dense />
                ) : serialNumbers.length > 0 ||
                  canOpenUnits ||
                  canEditSerialInDock ||
                  (line.serial_absent ?? false) ? (
                  (canEditSerialInDock || onViewAllUnits) && !readOnly ? (
                    <HoverTooltip
                      label={
                        serialNumbers.length > 0
                          ? 'Edit serials in Displays'
                          : onEditSerialInDock
                            ? 'Edit serial in dock'
                            : line.serial_absent
                              ? 'No serial'
                              : 'View serials'
                      }
                      asChild
                    >
                      {/* ds-raw-button: meta-row serial preview → a FILLED serial
                          edits in Units Displays (edit-in-Displays, per-line); a
                          fresh line (no serial yet) arms the in-row/dock capture. */}
                      <button
                        type="button"
                        aria-label={
                          serialNumbers.length > 0
                            ? 'Edit serials in Displays'
                            : onEditSerialInDock
                              ? 'Edit serial in dock'
                              : line.serial_absent
                                ? 'No serial'
                                : 'View serials'
                        }
                        className={cn(
                          'ds-raw-button flex h-full min-w-0 w-full items-center gap-0.5 overflow-hidden px-2 py-1 text-left transition-colors',
                          cornerClass('flush'),
                          'text-text-muted hover:bg-surface-hover hover:text-text-default',
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveSinkId(`po-line:${line.id}`);
                          if (!isActive) dispatchSelectLine(line);
                          // A FILLED serial edits in Units Displays for THIS line
                          // (promotes the sibling + opens the leaf). Never the
                          // controller-bound dock. A fresh line (no serial yet)
                          // arms the in-row/dock capture instead.
                          if (serialNumbers.length > 0 && onViewAllUnits) {
                            onViewAllUnits(line);
                            return;
                          }
                          if (onEditSerialInDock) {
                            onEditSerialInDock(line);
                            setTimeout(
                              () => emitReceiving('receiving-focus-scan'),
                              60,
                            );
                            return;
                          }
                          onViewAllUnits?.(line);
                        }}
                      >
                        <Barcode
                          className="h-3 w-3 shrink-0 text-emerald-500"
                          aria-hidden
                        />
                        <span className="min-w-0 truncate tabular-nums normal-case tracking-normal">
                          {serialNumbers.length > 0
                            ? serialNumbers
                                .slice(-SERIAL_PREVIEW_CAP)
                                .map((sn) => getLast8(sn))
                                .join(', ')
                            : line.serial_absent
                              ? 'No serial'
                              : '—'}
                        </span>
                      </button>
                    </HoverTooltip>
                  ) : (
                    <span className="flex h-full min-w-0 w-full items-center gap-0.5 overflow-hidden px-2 py-1">
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
                          : line.serial_absent
                            ? 'No serial'
                            : '—'}
                      </span>
                    </span>
                  )
                ) : undefined
              }
              price={<UnitPriceChip amount={line.unit_price} dense />}
            />
          </div>
        </div>
      </div>
      {/* Mouse-escape / Testing body when parent passes `activeRowSlot`.
          Unbox mounts only under the active line; Testing may interleave.
          Snap — no height tween that pushes the ledger on line focus.
          Arrival (`unitsChrome={false}`) never mounts unit editors.
          Entry is boxed off the ledger (hairline frame + card face) so bulk /
          progressive capture reads as one instrument under the selected line. */}
      {unitsChrome && !readOnly && activeRowSlot ? (
        <div
          className={cn(
            'min-w-0 overflow-hidden border-t border-border-hairline bg-surface-sunken',
            // Unbox mounts PoLineUnitCaptureList here, whose first capture row
            // already draws `border-y` (PO_LINE_CAPTURE_ROW_CLASS) flush at the
            // top of this box — two hairlines with nothing between them read as
            // one 2px rule. Yield our top seam to it. Scoped with `:has()` so
            // the TESTING path (ReceivingUnitRows, which draws no top border of
            // its own) keeps this border as its only boundary.
            '[&:has([data-po-line-unit-capture])]:border-t-0',
          )}
          data-po-line-entry
        >
          <div className="min-w-0 border border-border-soft border-t-0 bg-surface-card">
            {typeof activeRowSlot === 'function'
              ? activeRowSlot({
                  line,
                  serials: line.serials ?? [],
                  units: line.units ?? [],
                })
              : activeRowSlot}
          </div>
        </div>
      ) : null}
    </motion.li>
  );
}
