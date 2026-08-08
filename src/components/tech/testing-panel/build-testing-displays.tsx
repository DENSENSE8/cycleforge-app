'use client';

/**
 * Testing Displays — reference tools on the right-edge push column
 * ({@link StationDisplaysPushStack}), never a centre `SectionTabsSlider`.
 *
 * Sibling of Arrival's {@link buildTriageDisplayTabs}. Centre = testing work
 * (PO lines · UnboxLabelPreview); dock = **label / item notes** + Pass · Print.
 * Ticket create/link/chat live in {@link TicketDisplayHost} (Unbox grain) —
 * never a blocking modal over the middle. SKU Pairing · Checklist · Manuals ·
 * Timeline · carton Linkage are Displays. PO `#` chip opens Linkage with
 * `pairingFocus` as DATA.
 *
 * P3 bodies (Ticket · Timeline) are dynamic — strip labels stay eager.
 */

import dynamic from 'next/dynamic';
import { Barcode, ClipboardList, Download, History, Link2, Ticket } from '@/components/Icons';
import { type SectionTab } from '@/design-system/components';
import { buildSectionTabs } from '@/components/station/workbench';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';
import { CartonMatchHub } from '@/components/receiving/workspace/line-edit/CartonMatchHub';
import {
  TestingSkuChecklistPanel,
  TestingSkuManualsPanel,
  TestingSkuPairingPanel,
} from '@/components/receiving/workspace/line-edit/LineTestingTabbedCard';
import type { ClaimModalMode } from '@/components/receiving/workspace/claim/claim-types';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { UseSkuTestingData } from '@/components/tech/sku-testing/useSkuTestingData';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import { cn } from '@/utils/_cn';
import type { TestingController } from './testing-panel-types';

const TicketDisplayHost = dynamic(
  () =>
    import('@/components/receiving/workspace/line-edit/TicketDisplayHost').then(
      (m) => m.TicketDisplayHost,
    ),
  { loading: () => null },
);
const WorkspaceTimelineTab = dynamic(
  () =>
    import('@/components/station/workbench').then((m) => m.WorkspaceTimelineTab),
  { loading: () => null },
);

/** Testing Displays vocabulary — strip order (Ticket first for expand). */
export type TestingDisplayTab =
  | 'ticket'
  | 'pairing'
  | 'checklist'
  | 'manuals'
  | 'timeline'
  | 'linkage';

interface BuildTestingDisplaysInput {
  row: ReceivingLineRow;
  staffId: string;
  c: TestingController;
  productTitle: string;
  hasSkuTabs: boolean;
  hasTimelineTab: boolean;
  skuTestingData: UseSkuTestingData;
  timelineSerials: string[];
  poIdForTimeline: string;
  trackingForTimeline: string;
  /** PO-avenue handoff — land Linkage on the PO tab (data, not a timed event). */
  pairingFocus: { tab: 'zoho_po' | null; requestId: number } | null;
  /** Claim create/link mode while Ticket has no linked id. */
  claimMode: ClaimModalMode;
  onCloseClaim: () => void;
  onCloseTicket: () => void;
  onClaimTicketCreated: (ticketNumber: string) => void;
  onClaimTicketUnlinked: () => void;
  /** Auto-match Find ticket → Ticket Displays topic. */
  onFindTicket?: () => void;
}

export function buildTestingDisplayTabs({
  row,
  staffId,
  c,
  productTitle,
  hasSkuTabs,
  hasTimelineTab,
  skuTestingData,
  timelineSerials,
  poIdForTimeline,
  trackingForTimeline,
  pairingFocus,
  claimMode,
  onCloseClaim,
  onCloseTicket,
  onClaimTicketCreated,
  onClaimTicketUnlinked,
  onFindTicket,
}: BuildTestingDisplaysInput): SectionTab[] {
  const unfound = shouldUseUnmatchedItemsSurface(row);
  const ticketId = c.providerTicketId as number | null | undefined;

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
          />
        ) : null,
    },
    {
      id: 'pairing',
      // SKU catalog pairing — NOT the carton↔PO `linkage` display below. Both
      // shipped as `Pairing` + `Link2`, so Testing's index drew two rows an
      // operator could not tell apart by label or glyph.
      label: 'SKU pairing',
      icon: Barcode,
      visible: row.sku_catalog_id != null,
      content: (
        <div className={cn(DISPLAYS_BODY_INSET, 'py-3')}>
          <TestingSkuPairingPanel
            skuCatalogId={row.sku_catalog_id ?? null}
            headerTitle={productTitle}
          />
        </div>
      ),
    },
    {
      id: 'checklist',
      label: 'Checklist',
      icon: ClipboardList,
      visible: hasSkuTabs,
      content: (
        <div className={cn(DISPLAYS_BODY_INSET, 'py-3')}>
          <TestingSkuChecklistPanel
            receivingLineId={row.id}
            serialUnitId={c.activeSerial?.id ?? null}
            data={skuTestingData}
          />
        </div>
      ),
    },
    {
      id: 'manuals',
      label: 'Manuals',
      icon: Download,
      visible: hasSkuTabs,
      content: (
        <div className={cn(DISPLAYS_BODY_INSET, 'py-3')}>
          <TestingSkuManualsPanel receivingLineId={row.id} data={skuTestingData} />
        </div>
      ),
    },
    {
      id: 'timeline',
      label: 'Timeline',
      icon: History,
      priority: 'overflow',
      visible: hasTimelineTab,
      content: (
        <WorkspaceTimelineTab
          poId={poIdForTimeline || null}
          tracking={trackingForTimeline || null}
          receivingId={row.receiving_id ?? null}
          serials={timelineSerials}
        />
      ),
    },
    {
      id: 'linkage',
      /** Carton ↔ PO — `Linkage` is the SoT name for this display on Unbox. */
      label: 'Linkage',
      icon: Link2,
      content: (
        <CartonMatchHub
          row={row}
          staffId={staffId}
          tabSet="unbox"
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
                  onFindTicket,
                }
              : null
          }
        />
      ),
    },
  ]);
}
