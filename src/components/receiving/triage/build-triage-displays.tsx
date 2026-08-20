'use client';

/**
 * Arrival (triage) Displays — Ticket + Pairing/Linkage on the right-edge push
 * column ({@link StationDisplaysPushStack}), never a centre tab strip.
 *
 * Sibling of Unbox's {@link buildUnboxSideTabs} / Testing's
 * {@link buildTestingDisplayTabs}: Arrival's centre owns the door flow — items
 * (`POUnboxingSection`) and nothing stacked under them — the centre Classify
 * section and the Staging control both left 2026-08-20 (classify survives as the
 * identity header's pills). Displays =
 * **Ticket** (create / link / chat via {@link TicketDisplayHost}) + **Pairing**
 * (`CartonMatchHub`, `tabSet="arrival"`, `chrome="bare"`). The PO-avenue intent
 * arrives as DATA (`pairingFocus` → the hub's `focusTab`), read on mount —
 * never a timed event that the display's mount races.
 *
 * P3 Ticket body is dynamic — strip labels stay eager. Ticket identity is
 * passed as primitives (not the whole line controller) so the builder stays
 * mount-safe when the host reloads mid-edit.
 */

import dynamic from 'next/dynamic';
import { History, Link2, MapPin, Ticket } from '@/components/Icons';
import { type SectionTab } from '@/design-system/components';
import { buildSectionTabs } from '@/components/station/workbench';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';
import { CartonMatchHub } from '../workspace/line-edit/CartonMatchHub';
import { ArrivalLocationsLeaf } from './ArrivalLocationsLeaf';
import type { TriageStagingController } from './useTriageStaging';
import type { ClaimModalMode } from '../workspace/claim/claim-types';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

const TicketDisplayHost = dynamic(
  () =>
    import('../workspace/line-edit/TicketDisplayHost').then((m) => m.TicketDisplayHost),
  { loading: () => null },
);

// Timeline is the SAME pair Unbox mounts (`unbox-tabs.tsx` → Timeline): the
// cross-entity timeline over the carton's PO / tracking, then the carton's own
// audit rows. Deferred for the same reason — the audit read is a per-carton
// round-trip that has no business firing behind every other leaf.
const WorkspaceTimelineTab = dynamic(
  () => import('@/components/station/workbench').then((m) => m.WorkspaceTimelineTab),
  { loading: () => null },
);
const ReceivingAuditPanel = dynamic(
  () =>
    import('../workspace/ReceivingAuditPanel').then((m) => m.ReceivingAuditPanel),
  { loading: () => null },
);

/**
 * Arrival Displays vocabulary — Ticket + Pairing + Locations. Locations is now
 * the ONLY shelf/lane writer on this station (its `selectShelf` auto-routes the
 * lane), which is what keeps `completeTriage`'s Save-for-unbox gate reachable.
 *
 * `location` is a TOOL, not a beat of the carton's procedure: browse the
 * shelves, place the carton, reprint a scuffed sticker, mint a new spot. It
 * earns the right edge for the same reason Pairing does — the centre stays
 * ops-flow.
 */
export type TriageDisplayTab = 'ticket' | 'linkage' | 'location' | 'timeline';

interface BuildTriageDisplaysInput {
  row: ReceivingLineRow;
  staffId: string;
  /** Linked Zendesk provider ticket id (null when unlinked). */
  providerTicketId?: number | null;
  /** RETURN claim reason prefill for Ticket → Claim. */
  returnClaimPrefill?: string | null;
  /** PO-avenue handoff — land Pairing on the PO tab (carried as data, not an event). */
  pairingFocus: { tab: 'zoho_po' | null; requestId: number } | null;
  /** Claim create/link mode while Ticket has no linked id. */
  claimMode: ClaimModalMode;
  onCloseClaim: () => void;
  onCloseTicket: () => void;
  onClaimTicketCreated: (ticketNumber: string) => void;
  onClaimTicketUnlinked: () => void;
  /** Auto-match Find ticket → Ticket Displays topic. */
  onFindTicket?: () => void;
  /** Staging controller — the New location leaf places on the shelf it mints. */
  staging: TriageStagingController;
  /** Close Displays once the carton is on the new spot. */
  onLocationPlaced?: () => void;
  /** Which leaf is showing — Timeline's audit read mounts only while visible. */
  activeTab?: TriageDisplayTab | null;
}

export function buildTriageDisplayTabs({
  row,
  staffId,
  providerTicketId = null,
  returnClaimPrefill = null,
  pairingFocus,
  claimMode,
  onCloseClaim,
  onCloseTicket,
  onClaimTicketCreated,
  onClaimTicketUnlinked,
  onFindTicket,
  staging,
  onLocationPlaced,
  activeTab = null,
}: BuildTriageDisplaysInput): SectionTab[] {
  const unfound = shouldUseUnmatchedItemsSurface(row);
  const ticketId = providerTicketId ?? null;

  return buildSectionTabs([
    {
      id: 'ticket',
      label: 'Ticket',
      icon: Ticket,
      content:
        row.id != null || row.receiving_id != null ? (
          <TicketDisplayHost
            row={row}
            ticketId={ticketId}
            claimMode={claimMode}
            onCloseClaim={onCloseClaim}
            onCloseTicket={onCloseTicket}
            onClaimTicketCreated={onClaimTicketCreated}
            onClaimTicketUnlinked={onClaimTicketUnlinked}
            returnClaimPrefill={returnClaimPrefill}
          />
        ) : null,
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
      content: (
        <ArrivalLocationsLeaf staging={staging} onPlaced={onLocationPlaced} />
      ),
    },
    {
      id: 'timeline',
      label: 'Timeline',
      icon: History,
      // Where the notes composer's ⓘ lands. Arrival had no history leaf at all,
      // so the door pass's only route to "received 14:32 by Mike" was a modal
      // over the work — one control, one destination, and the destination is
      // the right edge.
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
