'use client';

import { WorkspaceCard } from '@/design-system/components';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { TestingController } from './testing-panel-types';
import { TestingPoItemsSection } from './TestingPoItemsSection';

/**
 * Testing centre PO line list — the carton's lines (`TestingPoItemsSection`).
 *
 * Package Pairing left the centre on 2026-08-05 (scan-station Displays SoT): it
 * is now the Linkage body of Testing's right-edge Displays push, opened from the
 * identity `# ----` PO chip — a control on the right edge no longer opens a
 * surface in the centre. Sibling of Unbox's {@link POUnboxingSection}.
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
  /** Hide "PO items · N" — the parent tab row owns the label. */
  suppressItemsHeader?: boolean;
}) {
  return (
    <WorkspaceCard variant="glass" overflow="visible" bodyDensity="nested">
      <div className="space-y-3">
        <TestingPoItemsSection
          row={row}
          staffId={staffId}
          c={c}
          embedded
          suppressHeader={suppressItemsHeader}
        />
      </div>
    </WorkspaceCard>
  );
}
