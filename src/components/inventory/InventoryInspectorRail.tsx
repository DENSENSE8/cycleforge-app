'use client';

/** Inventory push inspector — the Wave-1 keystone. */

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
            </>
          }
          // Remount the body on record change so it re-fetches server truth.
          body={<InspectorBody key={`${kind}:${recordRef}`} kind={kind} recordRef={recordRef} />}
        />
      </div>
    </DetailStackRailRegistrar>
  );
}
