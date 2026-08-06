'use client';

/**
 * Arrival (triage) Displays — the reference tools that live on the right-edge
 * push column ({@link ReceivingDisplaysPushStack}), never a centre tab strip.
 *
 * Sibling of Unbox's {@link buildUnboxSideTabs}: the centre is the carton's
 * LINES (`POUnboxingSection`); Classify · Staging · Pairing/Linkage are Displays.
 * Each body composes the shared SoT — the Classify body is literally the same
 * `TriageClassifySection` Unbox's Classify display mounts, and Linkage is the
 * shared `CartonMatchHub` (`tabSet="arrival"`, `chrome="bare"`).
 *
 * Strip order = the triage flow (Classify → Stage → Pair), so the pane's
 * "expand" toggle opens the leftmost, Classify. The PO-avenue intent arrives as
 * DATA (`pairingFocus` → the hub's `focusTab`), read on mount — never a timed
 * event that the display's mount races.
 */

import { ClipboardList, Link2, MapPin } from '@/components/Icons';
import { type SectionTab } from '@/design-system/components';
import { buildSectionTabs } from '@/components/station/workbench';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';
import { CartonMatchHub } from '../workspace/line-edit/CartonMatchHub';
import { TriageClassifySection } from './TriageClassifySection';
import { StagingSection } from './StagingSection';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { UnboxLineController } from '../workspace/line-edit/unbox-line-controller';
import type { TriageStagingController } from './useTriageStaging';

/** Arrival Displays vocabulary — the reference tools, in strip order (Classify · Staging · Pairing). */
export type TriageDisplayTab = 'classify' | 'staging' | 'linkage';

interface BuildTriageDisplaysInput {
  row: ReceivingLineRow;
  staffId: string;
  c: UnboxLineController;
  staging: TriageStagingController;
  /** Header classify-pill handoff — open this dimension's names list on mount. */
  classifyExpand: {
    dimension: 'urgency' | 'platform' | 'type';
    requestId: number;
  } | null;
  /** PO-avenue handoff — land Pairing on the PO tab (carried as data, not an event). */
  pairingFocus: { tab: 'zoho_po' | null; requestId: number } | null;
}

export function buildTriageDisplayTabs({
  row,
  staffId,
  c,
  staging,
  classifyExpand,
  pairingFocus,
}: BuildTriageDisplaysInput): SectionTab[] {
  const unfound = shouldUseUnmatchedItemsSurface(row);

  return buildSectionTabs([
    {
      id: 'classify',
      label: 'Classify',
      icon: ClipboardList,
      content: (
        <TriageClassifySection
          row={row}
          c={c}
          expandDimension={classifyExpand?.dimension ?? null}
          expandRequestId={classifyExpand?.requestId ?? 0}
        />
      ),
    },
    {
      id: 'staging',
      label: 'Staging',
      icon: MapPin,
      content: <StagingSection staging={staging} />,
    },
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
