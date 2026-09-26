'use client';

/**
 * `/incoming` Add — mounts the receiving-order composer for the open kind.
 * Frame: `ReceivingOrderSheet` (the foundation). Kinds build on it:
 * `PurchaseOrderComposer`, `ReturnOrderComposer`.
 */

import type { ReceivingOrderKind } from '@/lib/inbound/receiving-order-composer-store';
import { PurchaseOrderComposer } from './PurchaseOrderComposer';
import { ReturnOrderComposer } from './ReturnOrderComposer';

export function ReceivingOrderComposer({ kind }: { kind: ReceivingOrderKind }) {
  return kind === 'purchase' ? <PurchaseOrderComposer /> : <ReturnOrderComposer />;
}
