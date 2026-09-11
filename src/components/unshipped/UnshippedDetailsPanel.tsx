'use client';

import { ShippedOrder } from '@/lib/neon/orders-queries';
import { ShippedDetailsPanel } from '@/components/shipped/ShippedDetailsPanel';

interface UnshippedDetailsPanelProps {
  shipped: ShippedOrder;
  onClose: () => void;
  onUpdate: () => void;
  surface?: 'rail' | 'stage';
}

export function UnshippedDetailsPanel({ surface, ...props }: UnshippedDetailsPanelProps) {
  return <ShippedDetailsPanel {...props} context="fulfillment" surface={surface} />;
}
