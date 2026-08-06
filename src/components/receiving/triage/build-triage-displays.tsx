'use client';

/**
 * Arrival (triage) Displays — Pairing/Linkage on the right-edge push column
 * ({@link ReceivingDisplaysPushStack}), never a centre tab strip.
 *
 * Sibling of Unbox's {@link buildUnboxSideTabs}: Arrival's centre owns the door
 * flow — items (`POUnboxingSection`) + Classify + Staging stacked under them.
 * The Displays strip is Pairing only (`CartonMatchHub`, `tabSet="arrival"`,
 * `chrome="bare"`). The PO-avenue intent arrives as DATA (`pairingFocus` → the
 * hub's `focusTab`), read on mount — never a timed event that the display's
 * mount races.
 */

import { Link2 } from '@/components/Icons';
import { type SectionTab } from '@/design-system/components';
import { buildSectionTabs } from '@/components/station/workbench';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';
import { CartonMatchHub } from '../workspace/line-edit/CartonMatchHub';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

/** Arrival Displays vocabulary — Pairing only (Classify · Staging live in the centre). */
export type TriageDisplayTab = 'linkage';

interface BuildTriageDisplaysInput {
  row: ReceivingLineRow;
  staffId: string;
  /** PO-avenue handoff — land Pairing on the PO tab (carried as data, not an event). */
  pairingFocus: { tab: 'zoho_po' | null; requestId: number } | null;
}

export function buildTriageDisplayTabs({
  row,
  staffId,
  pairingFocus,
}: BuildTriageDisplaysInput): SectionTab[] {
  const unfound = shouldUseUnmatchedItemsSurface(row);

  return buildSectionTabs([
    {
      id: 'linkage',
      label: 'Pairing',
      icon: Link2,
      content: (
        <CartonMatchHub
          row={row}
          staffId={staffId}
          tabSet="arrival"
          chrome="bare"
          autoFocusSearch={false}
          showOpenInUnbox={false}
          focusTab={pairingFocus?.tab ?? null}
          focusRequestId={pairingFocus?.requestId ?? 0}
          autoMatch={
            unfound
              ? {
                  receivingId: row.receiving_id ?? null,
                  lineId: row.id ?? null,
                  trackingNumber: row.tracking_number ?? null,
                }
              : null
          }
        />
      ),
    },
  ]);
}
