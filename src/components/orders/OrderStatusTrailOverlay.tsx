'use client';

/** STATUS cell peek — Center Lock L2 inset over the slot table. */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DeskStageOverlay } from '@/design-system/components/DeskStageOverlay';
import { OrderTimelineSection } from '@/components/shipped/OrderTimelineSection';
import { cn } from '@/utils/_cn';

export type OrderStatusTrailRow = {
  orderPk: number;
  orderId: string;
  tracking: string | null;
  stateLabel: string;
};

type OrderStatusTrailApi = {
  open: (row: OrderStatusTrailRow) => void;
};

const OrderStatusTrailContext = createContext<OrderStatusTrailApi | null>(null);

export function useOrderStatusTrail(): OrderStatusTrailApi | null {
  return useContext(OrderStatusTrailContext);
}

export function OrderStatusTrailStage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [row, setRow] = useState<OrderStatusTrailRow | null>(null);
  const open = useCallback((next: OrderStatusTrailRow) => {
    setRow(next);
  }, []);
  const close = useCallback(() => {
    setRow(null);
  }, []);
  const api = useMemo(() => ({ open }), [open]);
  const title = row
    ? `${row.stateLabel || 'Status'} · ${row.orderId || `#${row.orderPk}`}`
    : 'Carrier trail';
  const subtitle = row?.tracking ? `Tracking ${row.tracking}` : undefined;

  return (
    <OrderStatusTrailContext.Provider value={api}>
      <div className={cn('relative flex min-h-0 min-w-0 flex-1 flex-col', className)}>
        {children}
        <DeskStageOverlay
          open={row != null}
          onClose={close}
          title={title}
          subtitle={subtitle}
          fill="inset"
          testId="order-status-trail-overlay"
        >
          {row ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <OrderTimelineSection
                key={row.orderPk}
                orderId={row.orderPk}
                flush
                initialLens="carrier"
              />
            </div>
          ) : null}
        </DeskStageOverlay>
      </div>
    </OrderStatusTrailContext.Provider>
  );
}
