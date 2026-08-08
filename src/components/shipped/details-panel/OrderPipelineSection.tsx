'use client';

import { ShippedOrder } from '@/lib/neon/orders-queries';
import {
  LinearWorkflowStepper,
  type LinearStep,
} from '@/components/receiving/workspace/ReceivingProgressStepper';
import { PipelineStageRow } from '@/design-system/components';
import { DetailsPanelRow } from '@/design-system/components/DetailsPanelRow';
import { ShipmentStatusBadge } from '@/components/shipping/ShipmentStatusBadge';
import { deriveShippingDisplayMeta, serialNumberRowsFromShipped } from './shipping-information/helpers';
import { deriveOrderPipeline, orderStampOrNull } from './shipped-details-logic';

const STEPS: ReadonlyArray<LinearStep> = [
  { key: 'tested', label: 'Tested' },
  { key: 'packed', label: 'Packed' },
  { key: 'scanned_out', label: 'Scanned Out' },
];

/**
 * The order's packout pipeline — Tested → Packed → Scanned Out — as a compact
 * stepper over a next-step callout and attributed milestone rows. Mirrors the
 * receiving carton pipeline (`ReceivingCartonPipeline`): **all three milestone
 * rows stay mounted** (spatial predictability). Empty stages render
 * `PipelineStageRow` emptyFallback in-bounds — never progressive hide that
 * shifts muscle-memory layout. Phase from {@link deriveOrderPipeline} drives
 * the next-step callout + carrier terminal fact, not which rows mount.
 */
export function OrderPipelineSection({ shipped }: { shipped: ShippedOrder }) {
  const meta = deriveShippingDisplayMeta(shipped, serialNumberRowsFromShipped(shipped));

  const testedAt = meta.testedAtSource;
  const packedAt = meta.packedAtSource;
  const scannedOutAt = orderStampOrNull(shipped.ship_confirmed_at);

  const { states, nextStep } = deriveOrderPipeline({
    testedAt,
    packedAt,
    scannedOutAt,
    latestStatusCategory: shipped.latest_status_category ?? null,
    shipConfirmedAt: scannedOutAt,
  });

  // Carrier status is the pipeline's terminal fact — it lives here (under the
  // stepper), not buried in the order-details card. Shows the moment a
  // tracking/label exists and the carrier has reported a category/exception.
  const showCarrierStatus =
    (shipped.latest_status_category || shipped.has_exception) && shipped.shipment_id != null;

  return (
    <section className="space-y-4">
      <LinearWorkflowStepper
        steps={STEPS}
        states={states}
        ariaLabel="Order progress"
        className="w-full pt-1"
        size="compact"
      />

      {/* Teaching callout — the operator's next action (Required Next Action). */}
      <p className="pt-1 text-sm font-semibold text-text-default">{nextStep}</p>

      <div className="divide-y divide-border-hairline">
        <PipelineStageRow
          label="Tested"
          at={testedAt}
          staffName={meta.techNameDisplay}
          emptyFallback="Not tested"
        />
        <PipelineStageRow
          label="Packed"
          at={packedAt}
          staffName={meta.packerNameDisplay}
          emptyFallback="Pending pack"
        />
        <PipelineStageRow
          label="Scanned Out"
          at={scannedOutAt}
          staffName={meta.scannedOutByDisplay ?? ''}
          emptyFallback="Pending scan-out"
        />
      </div>

      {showCarrierStatus ? (
        <DetailsPanelRow label="Carrier Status" dividerClassName="">
          <ShipmentStatusBadge
            carrier={shipped.carrier ?? null}
            category={shipped.latest_status_category ?? null}
            description={shipped.latest_status_description ?? null}
            latestEventAt={shipped.latest_event_at ?? null}
            hasException={shipped.has_exception ?? null}
            isTerminal={shipped.is_terminal ?? null}
          />
        </DetailsPanelRow>
      ) : null}
    </section>
  );
}
