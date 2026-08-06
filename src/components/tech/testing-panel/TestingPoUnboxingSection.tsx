'use client';

import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { TestingController } from './testing-panel-types';
import { TestingPoItemsSection } from './TestingPoItemsSection';

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
  suppressItemsHeader = false,
}: {
  row: ReceivingLineRow;
  staffId: string;
  c: TestingController;
  /** Hide "PO items · N" — the parent overview owns the label. */
  suppressItemsHeader?: boolean;
}) {
  return (
    <div className="min-w-0">
      <TestingPoItemsSection
        row={row}
        staffId={staffId}
        c={c}
        embedded
        suppressHeader={suppressItemsHeader}
      />
    </div>
  );
}
