'use client';

/**
 * `/search?sel=receiving:{id}` centre — Status band, then Items band.
 *
 * Composes {@link SearchEntityCentre} like every other entity pane. The status
 * CONTENT is conditional and always was: a carton linked to a marketplace order
 * shows that order's pipeline, an unmatched one shows the carton's own. That is
 * data varying, not shape — the bands are identical either way.
 */

import { OrderPipelineSection } from '@/components/shipped/details-panel/OrderPipelineSection';
import { SearchEntityCentre } from './SearchEntityCentre';
import { ReceivingCartonPipeline } from '@/components/station/receiving/ReceivingCartonPipeline';
import type { AutoCollapseController } from '@/components/station/collapse';
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
    <SearchEntityCentre
      entity="receiving"
      collapse={collapse}
      status={
        linkedOrder ? (
          <OrderPipelineSection shipped={linkedOrder} />
        ) : (
          <div className="px-4 py-1">
            <ReceivingCartonPipeline log={log} readiness={readiness} />
          </div>
        )
      }
      items={
        linkedOrder ? (
          <SearchOrderItems order={linkedOrder} />
        ) : (
          <SearchReceivingPoItems receiving={receiving} lines={lines} />
        )
      }
    />
  );
}
