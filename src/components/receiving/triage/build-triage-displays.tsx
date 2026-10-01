'use client';

/** Arrival display leaves on the right-edge push column. Ticket is a center task. */

import dynamic from 'next/dynamic';
import { History, Link2, MapPin } from '@/components/Icons';
import { type SectionTab } from '@/design-system/components';
import { buildSectionTabs } from '@/components/station/workbench';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';
import { CartonMatchHub } from '../workspace/line-edit/CartonMatchHub';
import { ArrivalLocationsLeaf } from './ArrivalLocationsLeaf';
import type { TriageStagingController } from './useTriageStaging';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';


// Arrival/Triage retains the timeline pair after Unbox deleted its Displays host.
const WorkspaceTimelineTab = dynamic(
  () => import('@/components/station/workbench').then((m) => m.WorkspaceTimelineTab),
  { loading: () => null },
);
const ReceivingAuditPanel = dynamic(
  () =>
    import('../workspace/ReceivingAuditPanel').then((m) => m.ReceivingAuditPanel),
  { loading: () => null },
);

/** Arrival display vocabulary; Ticket is owned by the global task switcher. */
export type TriageDisplayTab = 'linkage' | 'location' | 'timeline';

interface BuildTriageDisplaysInput {
  row: ReceivingLineRow;
  staffId: string;
  /** Linked Zendesk provider ticket id (null when unlinked). */
  providerTicketId?: number | null;
  /** PO-avenue handoff — land Pairing on the PO tab (carried as data, not an event). */
  pairingFocus: { tab: 'zoho_po' | null; requestId: number } | null;
  /** Auto-match Find ticket → Ticket Displays topic. */
  onFindTicket?: () => void;
  /** Staging controller — the New location leaf places on the shelf it mints. */
  staging: TriageStagingController;
  /** Close Displays once the carton is on the new spot. */
  onLocationPlaced?: () => void;
  /**
   * Which leaf is showing — Timeline's audit read and Locations' sibling /
   * suggestion reads mount only while visible.
   */
  activeTab?: TriageDisplayTab | null;
}

export function buildTriageDisplayTabs({
  row,
  staffId,
  providerTicketId = null,
  pairingFocus,
  onFindTicket,
  staging,
  onLocationPlaced,
  activeTab = null,
}: BuildTriageDisplaysInput): SectionTab[] {
  const unfound = shouldUseUnmatchedItemsSurface(row);
  const ticketId = providerTicketId ?? null;

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
                  providerTicketId: ticketId,
                  onFindTicket,
                }
              : null
          }
        />
      ),
    },
    {
      id: 'location',
      label: 'Locations',
      icon: MapPin,
      // Two grains behind one leaf:
      content: (
        <ArrivalLocationsLeaf
          staging={staging}
          row={row}
          active={activeTab === 'location'}
          onPlaced={onLocationPlaced}
        />
      ),
    },
    {
      id: 'timeline',
      label: 'Timeline',
      icon: History,
      // Where the notes composer's ⓘ lands.
      content:
        row.receiving_id != null ? (
          <div className="space-y-4">
            <WorkspaceTimelineTab
              poId={row.zoho_purchaseorder_id || null}
              tracking={row.tracking_number ?? null}
              receivingId={row.receiving_id}
            />
            {activeTab === 'timeline' ? (
              <ReceivingAuditPanel
                open
                receivingId={row.receiving_id}
                onClose={() => undefined}
                hideHeader
              />
            ) : null}
          </div>
        ) : null,
    },
  ]);
}
