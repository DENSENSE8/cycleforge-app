'use client';

/**
 * Testing Displays — reference tools on the right-edge push column
 * ({@link ReceivingDisplaysPushStack}), never a centre `SectionTabsSlider`.
 *
 * Sibling of Arrival's {@link buildTriageDisplayTabs}. Centre = testing work
 * (PO lines · UnboxLabelPreview); dock = **label / item notes** + Pass · Print.
 * Ticket replies stay **inline in this Ticket body** (Unbox grain) — never
 * hijack the middle carton-notes dock. SKU Pairing · Checklist · Manuals ·
 * Timeline · carton Linkage are Displays. PO `#` chip opens Linkage with
 * `pairingFocus` as DATA.
 *
 * P3 bodies (Ticket chat · Timeline) are dynamic — strip labels stay eager.
 */

import dynamic from 'next/dynamic';
import { ClipboardList, Download, History, Link2, Ticket } from '@/components/Icons';
import { type SectionTab } from '@/design-system/components';
import { buildSectionTabs } from '@/components/station/workbench';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';
import { CartonMatchHub } from '@/components/receiving/workspace/line-edit/CartonMatchHub';
import {
  TestingSkuChecklistPanel,
  TestingSkuManualsPanel,
  TestingSkuPairingPanel,
} from '@/components/receiving/workspace/line-edit/LineTestingTabbedCard';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { UseSkuTestingData } from '@/components/tech/sku-testing/useSkuTestingData';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import { cn } from '@/utils/_cn';
import type { TestingController } from './testing-panel-types';

const SupportContextHub = dynamic(
  () => import('@/components/support/context').then((m) => m.SupportContextHub),
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
  onFindTicket,
}: BuildTestingDisplaysInput): SectionTab[] {
  const unfound = shouldUseUnmatchedItemsSurface(row);

  return buildSectionTabs([
    {
      id: 'ticket',
      label: 'Ticket',
      icon: Ticket,
      content:
        row.id != null || row.receiving_id != null ? (
          <div className="flex h-full min-h-[460px] flex-col overflow-hidden">
            <SupportContextHub
              anchor={{
                receivingId: row.receiving_id ?? null,
                lineId: row.id ?? null,
                tracking: row.tracking_number ?? null,
              }}
              variant="station"
              onlySegment="customer"
              hideLinkage
              onRequestLinkTicket={() => c.openClaimModal('link')}
              // Inline composer in this body — ticket notes ≠ carton label notes.
              // Messages only — floor spine is the Timeline Displays peer.
              hostComposer={false}
              mergeFloorTimeline={false}
              className="h-full min-h-0 rounded-none"
            />
          </div>
        ) : null,
    },
    {
      id: 'pairing',
      label: 'Pairing',
      icon: Link2,
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
