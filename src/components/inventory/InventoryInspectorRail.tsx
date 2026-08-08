'use client';

/**
 * Inventory push inspector — the Wave-1 keystone. A non-modal `RightRailHost`
 * occupant (`modal={false}`) keyed on `?open=<kind>:<ref>`, replacing the legacy
 * inline `InventoryDetailsOverlay` for the migrated `/inventory/units` route (and
 * the later skus / bins / alerts / counts routes that reuse it).
 *
 * Chrome is the Desk single-card golden (`BinDetailFlyout`): `DeskRailChromeRow`
 * (`→|` close) over a dense `PaneHeaderLabel` identity — never the hero-title
 * `InventoryDetailPanelShell` header, which the right-rail SoT bans on a record
 * inspector (`display/right-rail-inspector.md`). The work surface reflows beside
 * it (push, `edgeCollapse` / resize inherited from the host).
 *
 * Bodies compose the record-content SoTs directly — `ByUnitView` / `BySkuView`
 * (`SkuDetailView`) / `ByBinView` (`LocationDetailView`) — so a later wave that
 * retires the `*DetailsPanel` wrappers leaves this untouched. `alert` / `count`
 * reuse their existing panels in `chrome="bare"` mode (content only, no hero
 * header) until their own wave lands a by-id surface.
 */

import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskRailChromeRow } from '@/components/right-rail/DeskRailChromeRow';
import { PaneHeaderLabel } from '@/components/ui/pane-header';
import type {
  InventoryDetailKind,
  OpenInventoryDetailsPayload,
} from '@/lib/inventory-events-channel';
import { ByBinView } from './ByBinView';
import { BySkuView } from './BySkuView';
import { ByUnitView } from './ByUnitView';
import { AlertDetailsPanel } from './panels/AlertDetailsPanel';
import { CountCampaignDetailsPanel } from './panels/CountCampaignDetailsPanel';

const KIND_EYEBROW: Record<InventoryDetailKind, string> = {
  unit: 'Unit',
  sku: 'SKU',
  bin: 'Bin',
  alert: 'Alert',
  count: 'Cycle Count',
};

function InspectorBody({
  kind,
  recordRef,
}: {
  kind: InventoryDetailKind;
  recordRef: string;
}) {
  switch (kind) {
    case 'unit':
      // `ref` is a plain string prop on ByUnitView (React 19 ref-as-prop).
      return <ByUnitView ref={recordRef} />;
    case 'sku':
      return <BySkuView sku={recordRef} />;
    case 'bin':
      return <ByBinView barcode={recordRef} />;
    case 'alert':
      return <AlertDetailsPanel alertId={recordRef} chrome="bare" />;
    case 'count':
      return <CountCampaignDetailsPanel campaignId={recordRef} chrome="bare" />;
    default:
      return null;
  }
}

export function InventoryInspectorRail({
  selection,
  onClose,
}: {
  selection: OpenInventoryDetailsPayload | null;
  onClose: () => void;
}) {
  if (!selection) return null;

  const { kind, ref: recordRef } = selection;
  const eyebrow = KIND_EYEBROW[kind];

  return (
    // STABLE occupant id per KIND (`detail:inventory-unit`, not per-ref): the host
    // keys its crossfade on the occupant id, so a same-kind ref change swaps the
    // node in place; a kind change (unit → sku) genuinely crossfades.
    <DetailStackRailRegistrar
      id={`detail:inventory-${kind}`}
      onClose={onClose}
      modal={false}
      ariaLabel={`${eyebrow} details`}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border-hairline bg-surface-card/90 backdrop-blur-xl">
          <DeskRailChromeRow onClose={onClose} closeTitle="Close details" />
          <div className="flex min-w-0 flex-col gap-0.5 px-2 pb-2 pt-1">
            <PaneHeaderLabel
              eyebrow={eyebrow}
              valueClassName="truncate font-mono text-role-caption font-semibold text-text-default"
              value={recordRef}
              valueTitle={recordRef}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Remount the body on record change so it re-fetches server truth. */}
          <InspectorBody key={`${kind}:${recordRef}`} kind={kind} recordRef={recordRef} />
        </div>
      </div>
    </DetailStackRailRegistrar>
  );
}
