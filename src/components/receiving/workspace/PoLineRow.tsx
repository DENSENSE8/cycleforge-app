'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, motionRole } from '@/design-system/motion';
import { useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { ItemRecordRow, type ItemRecord } from '@/design-system/components/item-record';
import {
  PoLineTitleMenu,
  type PoLineSerialSplitContext,
} from '@/components/receiving/workspace/PoLineTitleMenu';
import type { SerialAbsentState } from '@/components/receiving/workspace/line-edit/NoSerialControl';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { resolveReceivingLineSerialsCsv } from '@/components/station/receiving-line-serials';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import { setActiveSinkId } from '@/lib/station-scan-sink';
import { receivingWorkspaceLineTitle } from '@/lib/receiving/po-group-title';
import {
  SCAN_LINE_PULSE_EVENT,
  type ScanLinePulseDetail,
} from '@/lib/scan-feedback/visual';
import { scheduleFocusUnboxCaptureSerialInLine } from './line-edit/focus-unbox-capture-serial';
import type {
  ActiveRowSlot,
  PoLineSerialActions,
} from './po-lines-accordion-types';

/** One-shot match acknowledgement — longer than chipCopyFeedback so the eye catches it. */
const LINE_PULSE_MS = 400;

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
   * @deprecated Inert. Row position is instant — no layout animation anywhere
   * (operator rule, 2026-08-22; AGENTS.md). Kept so the accordion and the
   * return card, which both passed `false`, keep compiling.
   */
  animateLayout?: boolean;
  /**
   * Open Units Displays for this line (serials cell click). Select the line
   * first when inactive. Omit on surfaces without a Displays host.
   */
  onViewAllUnits?: (line: ReceivingLineRow) => void;
  /** Unbox dual loci: */
  onEditConditionInDock?: (line: ReceivingLineRow) => void;
  onEditSerialInDock?: (line: ReceivingLineRow) => void;
  /**
   * When false (Arrival door flow), omit interactive condition · serial /
   * Units editors — meta still paints the five-track face with read-only chips
   * / honest empty serial. Defaults true.
   */
  unitsChrome?: boolean;
  /** Per-line capture body. */
  collapse?: {
    expanded: boolean;
    onToggle: () => void;
    onExpand: () => void;
  } | null;
}

/** One PO-item row — a thin adapter over the shared item face. */
export function PoLineRow({
  line,
  isActive,
  readOnly,
  serialsLoading = false,
  activeConditionOverride,
  activeRowSlot,
  serialSplit,
  onSerialAbsentChange: _onSerialAbsentChange,
  animateLayout: _animateLayout,
  onViewAllUnits,
  onEditConditionInDock,
  onEditSerialInDock,
  unitsChrome = true,
  collapse,
}: Props) {
  const pulseTransition = useMotionTransition(motionRole.feedback.pulse.transition);

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
    // Asking for the serial on a collapsed line has to mount the bar first —
    // otherwise the scheduled focus below queries a field that is not there.
    collapse?.onExpand();
    // Capture face owns serial entry when mounted; dock wedge only as fallback.
    if (activeRowSlot) {
      scheduleFocusUnboxCaptureSerialInLine(line.id, 60);
      return;
    }
    setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
  };

  /** A door scan brings the WHOLE carton in, so a read-only (triage) row reads `1/1` — counted equals expected. */
  const item: ItemRecord = {
    id: line.id,
    title: receivingWorkspaceLineTitle(line),
    imageUrl: line.image_url,
    sku: line.sku,
    quantity: readOnly
      ? { counted: line.quantity_expected ?? 1, expected: line.quantity_expected }
      : { counted: line.quantity_received, expected: line.quantity_expected },
    conditionGrade:
      isActive && activeConditionOverride ? activeConditionOverride : line.condition_grade,
    serials: serialNumbers,
    serialAbsent: line.serial_absent ?? false,
    unitPrice: line.unit_price,
  };

  const serialCellHasContent =
    serialNumbers.length > 0 ||
    canOpenUnits ||
    canEditSerialInDock ||
    (line.serial_absent ?? false);
  const serialInteractive =
    unitsChrome && serialCellHasContent && (canEditSerialInDock || !!onViewAllUnits) && !readOnly;

  return (
    <ItemRecordRow
      item={item}
      active={isActive}
      serialsLoading={unitsChrome && serialsLoading}
      onSelect={readOnly ? undefined : () => activateLineForSerial()}
      onFocus={readOnly ? undefined : () => setActiveSinkId(`po-line:${line.id}`)}
      titleActions={
        !readOnly ? <PoLineTitleMenu line={line} serialSplit={serialSplit} /> : null
      }
      qtyAction={
        !readOnly && activeRowSlot
          ? { label: 'Focus serial for this unit', onClick: activateLineForSerial }
          : null
      }
      conditionAction={
        unitsChrome && onEditConditionInDock && !readOnly
          ? {
              label: 'Edit condition in dock',
              onClick: () => {
                setActiveSinkId(`po-line:${line.id}`);
                if (!isActive) dispatchSelectLine(line);
                collapse?.onExpand();
                onEditConditionInDock(line);
                setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
              },
            }
          : null
      }
      serialAction={
        serialInteractive
          ? {
              label:
                serialNumbers.length > 0
                  ? 'Edit serials in Displays'
                  : onEditSerialInDock
                    ? 'Edit serial in dock'
                    : line.serial_absent
                      ? 'No serial'
                      : 'View serials',
              onClick: () => {
                setActiveSinkId(`po-line:${line.id}`);
                if (!isActive) dispatchSelectLine(line);
                collapse?.onExpand();
                // A FILLED serial edits in Units Displays for THIS line (promotes the sibling + opens the leaf).
                if (serialNumbers.length > 0 && onViewAllUnits) {
                  onViewAllUnits(line);
                  return;
                }
                if (onEditSerialInDock) {
                  onEditSerialInDock(line);
                  setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
                  return;
                }
                onViewAllUnits?.(line);
              },
            }
          : null
      }
      overlay={
        // Opacity-only acknowledgement, so it composites instead of reflowing.
        // AnimatePresence lives HERE rather than in the shared row: the design
        // system stays motion-free.
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
      }
      // Capture body is independent of row selectability.
      body={
        unitsChrome &&
        activeRowSlot &&
        (!collapse || collapse.expanded)
          ? typeof activeRowSlot === 'function'
            ? activeRowSlot({
                line,
                serials: line.serials ?? [],
                units: line.units ?? [],
              })
            : activeRowSlot
          : null
      }
    />
  );
}
