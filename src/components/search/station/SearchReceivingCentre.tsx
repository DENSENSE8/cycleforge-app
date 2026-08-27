'use client';

/**
 * Zone 2 of `/search?sel=receiving:` — Status first, then Items.
 * Preview search does not mount a warehouse thread.
 *
 * Edge-to-edge of the centre column. The status pipeline owns its inset
 * (`OrderPipelineSection` / inbound wrapper); items sit flush.
 */

import { OrderPipelineSection } from '@/components/shipped/details-panel/OrderPipelineSection';
import { StationCollapsibleBlock } from '@/components/station/collapse/StationCollapsibleBlock';
import type { AutoCollapseController } from '@/components/station/collapse';
import { ReceivingCartonPipeline } from '@/components/station/receiving/ReceivingCartonPipeline';
import type {
  CartonInspectorLine,
  CartonInspectorReceiving,
} from '@/components/receiving/inspector/carton-inspector-model';
import { deriveCartonReadiness } from '@/lib/receiving/carton-readiness';
import { cartonToReceivingDetailsLog } from '@/lib/receiving/carton-to-details-log';
import type { ShippedOrder } from '@/types/orders';
import { SearchOrderItems } from './SearchOrderItems';
import { SearchReceivingPoItems } from './SearchReceivingPoItems';

export function SearchReceivingCentre({
  receiving,
  lines,
  linkedOrder,
  collapse,
}: {
  receiving: CartonInspectorReceiving;
  lines: ReadonlyArray<CartonInspectorLine>;
  linkedOrder: ShippedOrder | null;
  collapse: AutoCollapseController;
}) {
  const log = cartonToReceivingDetailsLog(receiving);
  const readiness = deriveCartonReadiness(log, lines);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <StationCollapsibleBlock
        label="Status"
        collapsed={collapse.collapsed}
        onToggle={collapse.toggle}
        testId="search-receiving-status-block"
      >
        {linkedOrder ? (
          <OrderPipelineSection shipped={linkedOrder} />
        ) : (
          <div className="px-4 py-1">
            <ReceivingCartonPipeline log={log} readiness={readiness} />
          </div>
        )}
      </StationCollapsibleBlock>

      <StationCollapsibleBlock
        label="Items"
        collapsed={collapse.collapsed}
        onToggle={collapse.toggle}
        testId="search-receiving-items-block"
      >
        {linkedOrder ? (
          <SearchOrderItems order={linkedOrder} />
        ) : (
          <SearchReceivingPoItems receiving={receiving} lines={lines} />
        )}
      </StationCollapsibleBlock>
    </div>
  );
}
