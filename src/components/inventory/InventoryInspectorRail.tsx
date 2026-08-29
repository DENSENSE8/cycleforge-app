'use client';

/**
 * Inventory push inspector — the Wave-1 keystone. A non-modal `RightRailHost`
 * occupant (`modal={false}`) keyed on `?open=<kind>:<ref>`, replacing the legacy
 * inline `InventoryDetailsOverlay` for the migrated `/inventory/units` route.
 *
 * Chrome is the ONE band: `DeskInspectorIndexShell` in `stance="standalone"`.
 * Nothing routes into this rail through an index — a grid row writes
 * `?open=unit:<ref>` directly — so it owes no Back and declares that with the
 * stance instead of by omitting a header. Never the hero-title
 * `InventoryDetailPanelShell` header, which the right-rail SoT bans on a record
 * inspector (`display/right-rail-inspector.md`). The work surface reflows beside
 * it (push, `edgeCollapse` / resize inherited from the host).
 *
 * **One line, not two (2026-08-21).** The chrome used to stack a
 * `DeskRailChromeRow` over a `PaneHeaderLabel` whose eyebrow (`Unit`) sat above
 * the mono record ref — an eyebrow/title pair on a second header line under the
 * band. The kind is now the band's single-word title and the ref rides the
 * band's trailing cell as a read-only mono cursor, beside the `▦` door onto
 * grid column details. Close stays the host's singleton `✕`; the band reserves
 * its cell.
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
import { DeskInspectorIndexShell } from '@/components/right-rail/DeskInspectorIndexShell';
import type {
  InventoryDetailKind,
  OpenInventoryDetailsPayload,
} from '@/lib/inventory-events-channel';
import { ByUnitView } from './ByUnitView';
import { AlertDetailsPanel } from './panels/AlertDetailsPanel';
import { CountCampaignDetailsPanel } from './panels/CountCampaignDetailsPanel';

/** Band title — the CURRENT segment, one noun. The ref is identity, not title. */
const KIND_TITLE: Record<InventoryDetailKind, string> = {
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
  const title = KIND_TITLE[kind];

  return (
    // STABLE occupant id per KIND (`detail:inventory-unit`, not per-ref): the host
    // keys its crossfade on the occupant id, so a same-kind ref change swaps the
    // node in place; a kind change (unit → sku) genuinely crossfades.
    <DetailStackRailRegistrar
      id={`detail:inventory-${kind}`}
      onClose={onClose}
      modal={false}
      ariaLabel={`${title} details`}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <DeskInspectorIndexShell
          stance="standalone"
          title={title}
          ariaLabel={`${title} details`}
          testId="inventory-inspector-rail"
          headerRightSlot={
            <>
              {/* Read-only identity cell — the record this rail is showing,
                  never a verb. Verbs (`▦`) follow it, then the host's cells. */}
              <span
                className="flex h-full max-w-[18ch] items-center truncate px-1.5 font-mono text-role-caption text-text-soft"
                title={recordRef}
                data-testid="inventory-inspector-ref"
              >
                {recordRef}
              </span>
              <InspectorColumnDisplayButton />
            </>
          }
          // Remount the body on record change so it re-fetches server truth.
          body={<InspectorBody key={`${kind}:${recordRef}`} kind={kind} recordRef={recordRef} />}
        />
      </div>
    </DetailStackRailRegistrar>
  );
}
