'use client';

/**
 * POUnboxingSection — the PO **line list** (flat data floor) with optional
 * condition + serial. No glass card shell — elevation belongs on the action dock.
 *
 * Unbox centre mounts this with `editLines` + `serialScan` + `dockOwnsCapture`
 * so the accordion is a ledger (click → dock step); Arrival (`TriagePanel`)
 * mounts `editLines` with `serialScan={false}` + `unitsChrome={false}` (door
 * flow — no condition · serial / Units). Testing composes it too.
 *
 * Package Pairing left it on 2026-08-02 and is the `pairing` Displays tab on
 * the right edge ({@link buildUnboxSideTabs}).
 */

import { LinePoItemsSection } from './LinePoItemsSection';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { UnboxLineController } from './unbox-line-controller';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';

interface POUnboxingSectionProps {
  row: ReceivingLineRow;
  staffId: string;
  poItems: boolean;
  matching: boolean;
  openInUnbox: boolean;
  editLines: boolean;
  serialScan: boolean;
  /**
   * When true, condition/serial inputs leave the accordion — the bottom dock
   * owns capture; the row paints a clickable ledger. Unbox centre only.
   */
  dockOwnsCapture?: boolean;
  /** Ledger click → focus the matching procedure step in the dock. */
  onFocusCaptureStep?: (key: 'serial' | 'condition' | 'item_photos') => void;
  /**
   * When false, meta is qty | SKU | price only and unit editors stay off
   * (Arrival). Defaults true.
   */
  unitsChrome?: boolean;
  c: UnboxLineController;
  includeLinkedPoItems?: boolean;
  /**
   * Hide the "PO items · N" header — Unbox overview + Arrival own the label
   * via identity / Displays; an empty unfound carton must not show "PO ITEMS · 0".
   */
  suppressItemsHeader?: boolean;
  /** Carton-open snapshot of `receiving.accordionExpand`. */
  accordionBootstrap?: 'default' | 'all';
  /** Filled multi-qty unit pencil → open Units display. */
  onEditFilledSerial?: (serial: {
    id: number;
    serial_number: string;
    condition_grade?: string | null;
  }) => void;
  /** Serials cell click → Units Displays. */
  onViewAllUnits?: (line: ReceivingLineRow) => void;
  /** RETURN match → Displays Timeline. */
  onOpenReturnHistory?: () => void;
}

export function POUnboxingSection({
  row,
  staffId,
  poItems,
  matching,
  openInUnbox,
  editLines,
  serialScan,
  dockOwnsCapture = false,
  onFocusCaptureStep,
  unitsChrome = true,
  c,
  includeLinkedPoItems = true,
  suppressItemsHeader = false,
  accordionBootstrap = 'default',
  onEditFilledSerial,
  onViewAllUnits,
  onOpenReturnHistory,
}: POUnboxingSectionProps) {
  const linkedPo = !c.isUnfound && !shouldUseUnmatchedItemsSurface(row);
  const showPoItems = poItems || (includeLinkedPoItems && matching && linkedPo);

  if (!showPoItems) return null;

  // Flush data floor — zero radius / elevation. Depth lives on the elevated
  // action dock (UnboxDockHost), not around PO line cards.
  return (
    <div className="min-w-0">
      <LinePoItemsSection
        row={row}
        staffId={staffId}
        serialScan={serialScan}
        openInUnbox={openInUnbox}
        editLines={editLines}
        dockOwnsCapture={dockOwnsCapture}
        onFocusCaptureStep={onFocusCaptureStep}
        unitsChrome={unitsChrome}
        c={c}
        embedded
        suppressHeader={suppressItemsHeader}
        accordionBootstrap={accordionBootstrap}
        onEditFilledSerial={unitsChrome ? onEditFilledSerial : undefined}
        onViewAllUnits={unitsChrome ? onViewAllUnits : undefined}
        onOpenReturnHistory={onOpenReturnHistory}
      />
    </div>
  );
}
