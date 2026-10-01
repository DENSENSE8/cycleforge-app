'use client';

/** Testing Displays — reference tools on the right-edge push column ({@link StationDisplaysPushStack}), never a centre `SectionTabsSlider`. */

import dynamic from 'next/dynamic';
import {
  Barcode,
  Boxes,
  ClipboardList,
  Download,
  ExternalLink,
  History,
  Link2,
} from '@/components/Icons';
import { type SectionTab } from '@/design-system/components';
import { buildSectionTabs } from '@/components/station/workbench';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';
import { CartonMatchHub } from '@/components/receiving/workspace/line-edit/CartonMatchHub';
import { TestingUnitsDisplay } from './TestingUnitsDisplay';
import {
  TestingSkuChecklistPanel,
  TestingSkuManualsPanel,
  TestingSkuPairingPanel,
} from '@/components/receiving/workspace/line-edit/LineTestingTabbedCard';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { UseSkuTestingData } from '@/components/tech/sku-testing/useSkuTestingData';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import { cn } from '@/utils/_cn';
import type { TestingController } from './testing-panel-types';
import { TestingListingVerifyHost } from './TestingListingVerifyHost';
import type { SellerClaimedCondition } from '@/lib/receiving/seller-claimed-condition';

const WorkspaceTimelineTab = dynamic(
  () =>
    import('@/components/station/workbench').then((m) => m.WorkspaceTimelineTab),
  { loading: () => null },
);

/** Testing display vocabulary. Ticket is a center task, not a leaf. */
export type TestingDisplayTab =
  | 'units'
  | 'listing'
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
  /** Seller-claimed condition for the Listing verify leaf. */
  sellerClaimed: SellerClaimedCondition;
  /** Auto-match Find ticket → center Ticket task. */
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
  sellerClaimed,
  onFindTicket,
}: BuildTestingDisplaysInput): SectionTab[] {
  const unfound = shouldUseUnmatchedItemsSurface(row);

  return buildSectionTabs([
    {
      id: 'units',
      // Per-unit verdict (serial · condition · pass/test-again/fail) — the
      // Action Display. Centre keeps PO lines + Pass · Print (ops-flow only).
      label: 'Units',
      icon: Boxes,
      // A line exists to test its units — show whenever we have one.
      visible: row.id != null,
      content: <TestingUnitsDisplay row={row} c={c} />,
    },
    {
      id: 'listing',
      label: 'Listing',
      icon: ExternalLink,
      content: (
        <TestingListingVerifyHost row={row} claimed={sellerClaimed} />
      ),
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
