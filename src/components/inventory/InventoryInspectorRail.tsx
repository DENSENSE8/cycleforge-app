'use client';

/**
 * Inventory push inspector — the Wave-1 keystone. A non-modal `RightRailHost`
 * occupant (`modal={false}`) keyed on `?open=<kind>:<ref>`, replacing the legacy
 * inline `InventoryDetailsOverlay` for the migrated `/inventory/units` route.
 *
 * Chrome is the Desk single-card golden (`BinDetailFlyout`): `DeskRailChromeRow`
 * (`→|` close) over a dense `PaneHeaderLabel` identity — never the hero-title
 * `InventoryDetailPanelShell` header, which the right-rail SoT bans on a record
 * inspector (`display/right-rail-inspector.md`). The work surface reflows beside
 * it (push, `edgeCollapse` / resize inherited from the host).
 *
 * Body scope — the units grid only ever writes `unit:`, so `unit` is the only
 * kind Wave 1 exercises:
 *   - `unit`  → `ByUnitView` (record-content SoT; its own body-level title is
 *               allowed — the SoT bans a hero title in the CHROME, not in the body).
 *   - `alert` / `count` → the existing panels in `chrome="bare"` mode (content
 *               only; the rail owns the chrome + scroll port).
 *   - `sku` / `bin` → an honest deferred hint. Their real bodies compose
 *               `SkuDetailView` (panel mode) / `LocationDetailView`, which are
 *               designed by the `/inventory/{skus,bins}` migration (Wave 3);
 *               rendering their full-page shells raw inside a push rail would
 *               double the header, nest a scroll port, and `router.push('/inventory')`
 *               back into the RETIRED shell on Back. A hand-crafted `?open=sku:`
 *               deep-link on this surface lands the hint instead.
 */

import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskRailChromeRow } from '@/components/right-rail/DeskRailChromeRow';
import { PaneHeaderLabel } from '@/components/ui/pane-header';
import type {
  InventoryDetailKind,
  OpenInventoryDetailsPayload,
} from '@/lib/inventory-events-channel';
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

/** Kinds whose full body lands with their own route migration (Wave 3). */
const DEFERRED_HINT: Partial<Record<InventoryDetailKind, string>> = {
  sku: 'SKU details open from the SKUs workspace.',
  bin: 'Bin details open from the Locations workspace.',
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
    case 'alert':
      return <AlertDetailsPanel alertId={recordRef} chrome="bare" />;
    case 'count':
      return <CountCampaignDetailsPanel campaignId={recordRef} chrome="bare" />;
    default:
      return (
        <div className="flex h-full items-center justify-center px-6 text-center">
          <p className="text-sm text-text-muted">
            {DEFERRED_HINT[kind] ?? 'This record opens from its own workspace.'}
          </p>
        </div>
      );
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
