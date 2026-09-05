'use client';

import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { TestingController } from './testing-panel-types';
import { TestingPoItemsSection } from './TestingPoItemsSection';
import type { LineCollapseController } from '@/components/station/collapse';

/**
 * Testing centre PO line list — the carton's lines (`TestingPoItemsSection`).
 *
 * Flush data floor (Unbox SoT) — zero radius / elevation. Depth lives on the
 * elevated action dock (notes + Pass · Print), not around PO line cards.
 * Sibling of Unbox's {@link POUnboxingSection}.
 *
 * Package Pairing / Ticket / Checklist / Manuals / Timeline are right-edge
 * Displays — never a centre `SectionTabsSlider` strip.
 */
export function TestingPoUnboxingSection({
  row,
  staffId,
  c,
  onViewAllUnits,
  lineCollapse,
}: {
  row: ReceivingLineRow;
  staffId: string;
  c: TestingController;
  /** Kept for caller compat. The receive meter always paints. */
  suppressItemsHeader?: boolean;
  /** Serials-cell / edit click → open the right-edge Units Display. */
  onViewAllUnits?: (line: ReceivingLineRow) => void;
  /** Items-band line collapse, shared with "Collapse all" (Unbox parity). */
  lineCollapse?: LineCollapseController;
}) {
  return (
    <div className="min-w-0">
      <TestingPoItemsSection
        row={row}
        staffId={staffId}
        c={c}
        embedded
        lineCollapse={lineCollapse}
        onViewAllUnits={onViewAllUnits}
      />
    </div>
  );
}
