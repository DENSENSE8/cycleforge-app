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
 * receiving carton pipeline (`ReceivingCartonPipeline`), but phase-aware so the
 * panel reads completely differently per lifecycle state without forking the
 * layout (facts drive chrome):
 *
 *   - pending     → stepper + "Awaiting testing"; NO empty milestone rows.
 *   - in_progress → stepper + callout + ONLY the stamped milestone rows.
 *   - shipped     → all rows + carrier status hoisted as the terminal fact.
 *
 * State is derived from the order's stamps (never stored) via
 * {@link deriveOrderPipeline}, so it always reflects the source of truth.
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

      {/* Teaching callout — the operator's next action. Replaces the row of
          empty "PENDING …" stamps a fully-pending order used to show. The
          extra top padding keeps it clear of the stepper labels above. */}
      <p className="pt-1 text-sm font-bold text-text-default">{nextStep}</p>

      {/* Milestone rows appear ONLY for stamped stages — an unstamped stage
          lives solely as a gray dot in the stepper above (progressive
          disclosure: summarize the past, don't enumerate the empty future). */}
      {(testedAt || packedAt || scannedOutAt) ? (
        <div className="divide-y divide-border-hairline">
          {testedAt ? (
            <PipelineStageRow
              label="Tested"
              at={testedAt}
              staffName={meta.techNameDisplay}
              emptyFallback="Not tested"
            />
          ) : null}
          {packedAt ? (
            <PipelineStageRow
              label="Packed"
              at={packedAt}
              staffName={meta.packerNameDisplay}
              emptyFallback="Pending pack"
            />
          ) : null}
          {scannedOutAt ? (
            <PipelineStageRow
              label="Scanned Out"
              at={scannedOutAt}
              staffName={meta.scannedOutByDisplay ?? ''}
              emptyFallback="Pending scan-out"
            />
          ) : null}
        </div>
      ) : null}

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
