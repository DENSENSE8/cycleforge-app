'use client';

/**
 * Mobile orders queue — canonical `/m/orders`; `/m/work` is a compatibility
 * alias that mounts this same component.
 *
 * This page is the full phone queue, not a shrunk spreadsheet.
 */

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from '@/components/Icons';
import { Inset } from '@/design-system/primitives';
import { TOKENS } from '@/components/mobile/redesign/DesignSystem';
import { MobileActionSlotRegistrar, MobileTopBarAction } from '@/components/mobile/redesign/MobileActionSlot';
import { MobileToShipQueue } from '@/components/mobile/redesign/MobileToShipQueue';

/**
 * The route's mode comes from src/lib/routing/mode-registry.ts (triage: the
 * orders queue is a reading flow on `/m/orders` and `/m/work`).
 */
export default function RedesignedMobileAssignedOrders() {
  const router = useRouter();
  return (
    <div className={`h-full overflow-hidden ${TOKENS.colors.background}`}>
      {/* The page's one action: take a new sales order (call or walk-in) from the phone. */}
      <MobileActionSlotRegistrar>
        <MobileTopBarAction icon={<Plus className="size-4" />} onClick={() => router.push('/m/orders/new')} data-testid="m-orders-new">
          New
        </MobileTopBarAction>
      </MobileActionSlotRegistrar>
      <Suspense
        fallback={
          <Inset space="field">
            <p className="text-role-caption text-text-muted">Loading…</p>
          </Inset>
        }
      >
        <MobileToShipQueue />
      </Suspense>
    </div>
  );
}
